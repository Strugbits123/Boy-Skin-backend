import DbService from "./db.service";
import ValidationService from "../services/helper.service";
import { QuizModel, AICompatibleQuizModel } from "../models/quiz.model";
import { ProductRecommendation, RecommendationResponse } from "../models/recommendation.model";
import ProductFilterService from "./product.filter.service";
import { RetryConfig, QueuedRequest } from "../models/ai.models";
import * as fs from 'fs';
import * as path from 'path';


class RecommendationService {
    // Toggle AI usage (products are selected locally; AI only for tips if enabled)
    private static readonly USE_AI: boolean = false;
    // Enhanced Retry Configuration 
    private static readonly RETRY_CONFIG: RetryConfig = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2.5,
        retryableStatusCodes: [429, 500, 502, 503, 504]
    };

    // Request Queue Management
    private static requestQueue: QueuedRequest[] = [];
    private static isProcessingQueue = false;
    private static lastRequestTime = 0;
    private static minRequestInterval = 1500;

    // Cached docs content
    private static cachedDocsContent: string | null = null;


    // Read and parse AI.doc.md from project root
    private static getAIDocumentation(): string {
        if (this.cachedDocsContent) {
            return this.cachedDocsContent;
        }
        try {
            const docPath = path.join(process.cwd(), 'Ai.doc.txt');
            const txtContent = fs.readFileSync(docPath, 'utf-8');


            let cleanContent = txtContent
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]+$/gm, '')
                .replace(/^[ \t]+/gm, '')
                .trim();

            this.cachedDocsContent = cleanContent;
            return cleanContent;
        } catch (error) {
            if (process.env.DEBUG === 'true') console.error('Error reading Ai.doc.txt:', error);
            throw new Error('AI documentation file not found. Ensure Ai.doc.txt exists in project root.');
        }
    }

    // Read and parse Ai.tips.txt from project root (cached)
    static getAITips(): Array<{
        tip: string;
        skinTypes: string[];
        category: string;
        conflictsWith: string[];
    }> {
        try {
            const tipsPath = path.join(process.cwd(), 'Ai.tips.txt');
            const raw = fs.readFileSync(tipsPath, 'utf-8');

            const text = raw
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const lines = text.split('\n');
            const tips: Array<{ tip: string; skinTypes: string[]; category: string; conflictsWith: string[]; }> = [];

            let currentTip: { tip: string; skinTypes: string[]; category: string; conflictsWith: string[] } | null = null;

            const extractQuoted = (s: string): string => {
                // supports straight and curly quotes
                const m = s.match(/["“”](.*?)["“”]/);
                return (m && m[1]) ? m[1].trim() : s.replace(/^TIP:\s*/i, '').trim();
            };

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) {
                    continue;
                }

                if (line.toUpperCase().startsWith('TIP:')) {
                    // push previous
                    if (currentTip && currentTip.tip) {
                        tips.push(currentTip);
                    }
                    currentTip = {
                        tip: extractQuoted(line),
                        skinTypes: [],
                        category: '',
                        conflictsWith: []
                    };
                    continue;
                }

                if (!currentTip) {
                    continue;
                }

                if (line.toLowerCase().startsWith('- skin types:')) {
                    const v = line.split(':')[1] ?? '';
                    const list = v.split(',').map(s => s.trim()).filter(Boolean);
                    currentTip.skinTypes = list.length > 0 ? list : ['All'];
                    continue;
                }

                if (line.toLowerCase().startsWith('- category:')) {
                    const v = line.split(':')[1] ?? '';
                    currentTip.category = v.trim();
                    continue;
                }

                if (line.toLowerCase().startsWith('- conflicts with:')) {
                    const v = line.split(':')[1] ?? '';
                    const extracted = extractQuoted(v);
                    // may contain multiple by "..." and "..." pattern or comma separated
                    const parts: string[] = [];
                    const regex = /["“”](.*?)["“”]/g;
                    let m: RegExpExecArray | null;
                    while ((m = regex.exec(v)) !== null) {
                        if (m[1]) parts.push(m[1].trim());
                    }
                    if (parts.length === 0) {
                        const split = extracted.split(',').map(s => s.trim()).filter(Boolean);
                        currentTip.conflictsWith = split;
                    } else {
                        currentTip.conflictsWith = parts;
                    }
                    continue;
                }
            }

            if (currentTip && currentTip.tip) {
                tips.push(currentTip);
            }

            return tips;
        } catch (error) {
            if (process.env.DEBUG === 'true') console.error('Error reading Ai.tips.txt:', error);
            throw new Error('AI tips file not found or unreadable. Ensure Ai.tips.txt exists in project root.');
        }
    }

    // Advanced Sleep with Jitter
    private static async sleep(ms: number): Promise<void> {
        const jitter = Math.random() * 0.3 * ms;
        const totalDelay = ms + jitter;
        return new Promise(resolve => setTimeout(resolve, totalDelay));
    }

    // Calculate Exponential Backoff Delay
    private static calculateBackoffDelay(attempt: number, baseDelay: number): number {
        const delay = baseDelay * Math.pow(this.RETRY_CONFIG.backoffMultiplier, attempt);
        return Math.min(delay, this.RETRY_CONFIG.maxDelay);
    }

    // Advanced Rate Limit Handler
    private static async handleRateLimit(response: Response, attempt: number): Promise<number> {
        const retryAfter = response.headers.get('retry-after');
        const rateLimitReset = response.headers.get('x-ratelimit-reset-date');

        let waitTime: number;

        if (retryAfter) {
            waitTime = parseInt(retryAfter) * 1000;
        } else if (rateLimitReset) {
            const resetTime = new Date(rateLimitReset).getTime();
            const currentTime = Date.now();
            waitTime = Math.max(resetTime - currentTime, 1000);
        } else {
            waitTime = this.calculateBackoffDelay(attempt, this.RETRY_CONFIG.baseDelay);
        }

        return Math.min(Math.max(waitTime, 1000), this.RETRY_CONFIG.maxDelay);
    }

    // Enhanced API Call with Advanced Retry Logic
    private static async makeAPICallWithRetry(
        prompt: string,
        requestId: string = Math.random().toString(36).substr(2, 9),
    ): Promise<any> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.RETRY_CONFIG.maxRetries; attempt++) {
            try {


                const timeSinceLastRequest = Date.now() - this.lastRequestTime;
                if (timeSinceLastRequest < this.minRequestInterval) {
                    const waitTime = this.minRequestInterval - timeSinceLastRequest;
                    await this.sleep(waitTime);
                }

                this.lastRequestTime = Date.now();

                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "anthropic-version": "2023-06-01",
                        "x-api-key": process.env.CLAUDE_SONNET_4_API_KEY ?? "",
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        "model": "claude-sonnet-4-20250514",
                        "max_tokens": 4000,
                        "temperature": 0.2,
                        "messages": [{ "role": "user", "content": prompt }]
                    })
                });

                if (response.status === 429) {
                    const waitTime = await this.handleRateLimit(response, attempt);
                    if (attempt < this.RETRY_CONFIG.maxRetries) {
                        await this.sleep(waitTime);
                        continue;
                    } else {
                        throw new Error(`Rate limit exceeded - max retries reached`);
                    }
                }

                if (response.status === 401) {
                    throw new Error("API authentication failed - check your API key");
                }

                if (response.status === 400) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Bad request: ${JSON.stringify(errorData)}`);
                }

                if (!response.ok) {
                    if (this.RETRY_CONFIG.retryableStatusCodes.includes(response.status)) {
                        const waitTime = this.calculateBackoffDelay(attempt, this.RETRY_CONFIG.baseDelay);
                        if (attempt < this.RETRY_CONFIG.maxRetries) {
                            await this.sleep(waitTime);
                            continue;
                        }
                    }
                    throw new Error(`API error ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();

                return data;

            } catch (error: any) {
                lastError = error;


                if (error.message?.includes('authentication') ||
                    error.message?.includes('Bad request') ||
                    error.name === 'SyntaxError') {
                    throw error;
                }

                if (attempt < this.RETRY_CONFIG.maxRetries) {
                    const waitTime = this.calculateBackoffDelay(attempt, this.RETRY_CONFIG.baseDelay);
                    await this.sleep(waitTime);
                }
            }
        }

        throw new Error(`API request failed after ${this.RETRY_CONFIG.maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    // Queue-based Request Processing
    private static async addToQueue<T>(
        requestFunction: () => Promise<T>,
        priority: 'high' | 'normal' = 'normal'
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const queueItem: QueuedRequest = {
                id: Math.random().toString(36).substr(2, 9),
                execute: requestFunction,
                resolve,
                reject,
                retries: 0,
                timestamp: Date.now()
            };

            if (priority === 'high') {
                this.requestQueue.unshift(queueItem);
            } else {
                this.requestQueue.push(queueItem);
            }


            this.processQueue();
        });
    }

    // Process Request Queue
    private static async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const item = this.requestQueue.shift()!;

            try {
                const result = await item.execute();
                item.resolve(result);
            } catch (error) {

                item.reject(error);
            }

            if (this.requestQueue.length > 0) {
                await this.sleep(500);
            }
        }

        this.isProcessingQueue = false;
    }

    static async getRecommendedProduct(quiz: QuizModel): Promise<RecommendationResponse> {
        try {
            // Step 1: Transform quiz to AI-compatible format
            const aiQuiz: AICompatibleQuizModel = ValidationService.transformQuizToAIFormat(quiz);

            // Step 2: Get products from database
            const products = await DbService.getCachedNotionProducts();

            if (!products || products.length === 0) {
                throw new Error("No products found in database");
            }

            // Step 3: Tips list (used regardless of AI usage)
            const allTips = this.getAITips();

            // Determine primary vs secondary concerns
            const allConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
            const primaryConcern = allConcerns[0] || 'general';

            // 🔥 NEW: Use Advanced Recommendation System (AI Doc Compliant)
            // const filteredCandidates = AdvancedProductRecommendationService.buildRecommendation(aiQuiz, products);

            // ⚠️ OLD: Previous implementation (commented out for comparison)
            const filteredCandidates = ProductFilterService.prefilterProducts(aiQuiz, products);

            // ✅ NEW: Retrieve user notes collected during filtering
            const userNotes = ProductFilterService.getUserNotes();

            if (!this.USE_AI) {
                // Local response: build products from filtered candidates and pick tips
                const enhancedProducts: ProductRecommendation[] = [];
                let totalCost = 0;
                for (const p of filteredCandidates) {
                    const price = p.price || 0;
                    totalCost += price;
                    enhancedProducts.push({
                        productId: p.productId,
                        productName: p.productName || 'Unknown Product',
                        targetConcern: primaryConcern,
                        priority: 'primary',
                        routineStep: 1,
                        price,
                        usageInstructions: 'Use as directed'
                    });
                }

                // Simple tip selection: filter by skin type match or 'All'
                const userSkin = aiQuiz.skinAssessment.skinType.toLowerCase();
                const filteredTips = allTips.filter(t => t.skinTypes.some(st => st.toLowerCase() === 'all' || st.toLowerCase().includes(userSkin)));

                // ✅ NEW: Append user notes to tips (quality/safety explanations)
                const tips = [...filteredTips.slice(0, 6).map(t => t.tip), ...userNotes];

                return {
                    success: true,
                    treatmentApproach: 'single',
                    products: enhancedProducts,
                    totalCost,
                    budgetUtilization: `$${totalCost}/${aiQuiz.preferences.budget}`,
                    clinicalReasoning: 'Routine optimized locally per safety/type/strength/budget',
                    tips
                };
            }

            // Fallback: AI path (disabled by default)
            const aiDocumentation = this.getAIDocumentation();
            const aiPrompt = `${aiDocumentation}`;
            const aiResponse = await this.addToQueue(async () => {
                return await this.makeAPICallWithRetry(aiPrompt, `consultation-${aiQuiz.demographics.name}`);
            }, 'high');
            const aiResponseText = aiResponse.content?.[0]?.text?.trim() || '{}';
            const recommendation = JSON.parse(aiResponseText);
            return recommendation;

        } catch (error: any) {
            console.error(`Critical error in getRecommendedProduct: ${error?.message ?? error}`);
            throw new Error(error?.message ?? "Clinical consultation system error");
        }
    }

    // Streamlined validation - basic checks only
    static validateQuizData(quiz: QuizModel): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        const requiredFields = [
            { field: quiz.Name, name: "Name" },
            { field: quiz.wakeUpSkinType, name: "Skin Type" },
            { field: quiz.work_on, name: "Concerns" },
            { field: quiz.Budget, name: "Budget" }
        ];

        requiredFields.forEach(({ field, name }) => {
            if (!field || field.trim().length === 0) {
                errors.push(`${name} is required`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Main entry point
    static async getFinalProduct(quiz: QuizModel): Promise<RecommendationResponse | null> {
        try {
            const validation = this.validateQuizData(quiz);
            if (!validation.isValid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            return await this.getRecommendedProduct(quiz);
        } catch (error: any) {

            throw error;
        }
    }

    // UTILITY: Get current queue status
    static getQueueStatus(): {
        queueLength: number;
        isProcessing: boolean;
        lastRequestTime: number;
    } {
        return {
            queueLength: this.requestQueue.length,
            isProcessing: this.isProcessingQueue,
            lastRequestTime: this.lastRequestTime
        };
    }

    // UTILITY: Clear queue (emergency use)
    static clearQueue(): void {
        this.requestQueue.forEach(item => {
            item.reject(new Error('Queue cleared'));
        });
        this.requestQueue = [];
        console.log('Request queue cleared');
    }
}

export default RecommendationService;
export type { RecommendationResponse, ProductRecommendation };

