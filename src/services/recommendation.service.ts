import DbService from "./db.service";
import ValidationService from "../services/helper.service";
import { QuizModel, AICompatibleQuizModel } from "../models/quiz.model";
import { ProductRecommendation, RecommendationResponse } from "../models/recommendation.model";
import Product from "../models/product.model";
import ProductFilterService from "./product.filter.service";
import { RetryConfig, QueuedRequest } from "../models/ai.models";
import * as fs from 'fs';
import * as path from 'path';


class RecommendationService {
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
    // Cached tips content
    private static cachedTips: Array<{
        tip: string;
        skinTypes: string[];
        category: string;
        conflictsWith: string[];
    }> | null = null;

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
            console.error('Error reading Ai.doc.txt:', error);
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
        if (this.cachedTips) {
            return this.cachedTips;
        }

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

            this.cachedTips = tips;
            return tips;
        } catch (error) {
            console.error('Error reading Ai.tips.txt:', error);
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
                console.log(`API Request [${requestId}] - Attempt ${attempt + 1}/${this.RETRY_CONFIG.maxRetries + 1}`);

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
                console.log(`API Request [${requestId}] - Success on attempt ${attempt + 1}`);
                return data;

            } catch (error: any) {
                lastError = error;
                console.error(`API Request [${requestId}] - Attempt ${attempt + 1} failed: ${error.message}`);

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

            console.log(`Added request [${queueItem.id}] to queue. Queue length: ${this.requestQueue.length}`);
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
                console.error(`Queue item [${item.id}] failed: ${error}`);
                item.reject(error);
            }

            if (this.requestQueue.length > 0) {
                await this.sleep(500);
            }
        }

        this.isProcessingQueue = false;
        console.log(`Queue processing completed`);
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

            // Step 3: Get AI documentation (beautified from MD)
            const aiDocumentation = this.getAIDocumentation();
            // Get curated tips list
            const allTips = this.getAITips();

            // Determine primary vs secondary concerns
            const allConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
            const primaryConcern = allConcerns[0] || 'general';
            const secondaryConcerns = allConcerns.slice(1);

            // DETERMINISTIC PRODUCT SELECTION - Code-based selection for 100% reliability
            console.log(`Products fetched from Notion: ${products.length}`);
            const selectedProducts = ProductFilterService.selectProductsDeterministically(aiQuiz, products);
            console.log(`Products selected deterministically: ${selectedProducts.length}`);

            // Step 4: Prefilter tips based on skin type and sensitivity
            const filteredTips = this.getFilteredTips(allTips, aiQuiz);

            // Step 5: Generate AI response for tips and usage instructions only
            const aiPrompt = `
${aiDocumentation}

PATIENT PROFILE:
${JSON.stringify(aiQuiz, null, 2)}

SELECTED PRODUCTS (ALREADY CHOSEN BY DETERMINISTIC LOGIC):
${JSON.stringify(selectedProducts.map(p => ({
                productId: p.productId,
                productName: p.productName,
                price: p.price,
                primaryActiveIngredients: p.primaryActiveIngredients?.plain_text || '',
                format: p.format?.name || '',
                step: p.step?.map(s => s.name) || []
            })), null, 2)}

AVAILABLE TIPS (SELECT ONLY FROM THESE - PRE-FILTERED FOR PATIENT):
${JSON.stringify(filteredTips, null, 2)}

TASK: Generate usage instructions and select 3-6 relevant tips for the selected products.

RESPONSE FORMAT:
Return ONLY this JSON structure:
{
  "treatmentApproach": "single",
  "products": [
    {
      "productId": "exact-product-id",
      "targetConcern": "specific-concern-based-on-ingredients",
      "priority": "primary",
      "routineStep": 1,
      "usageInstructions": "detailed usage instructions for this specific product"
    }
  ],
  "totalCost": ${selectedProducts.reduce((sum, p) => sum + (p.price || 0), 0)},
  "budgetUtilization": "$${selectedProducts.reduce((sum, p) => sum + (p.price || 0), 0)}/${aiQuiz.preferences.budget}",
  "clinicalReasoning": "Why these specific products were chosen based on patient profile and ingredient effectiveness",
  "tips": ["tip 1", "tip 2", "tip 3"]
}

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.
`;
            console.log(`Starting AI tips generation for ${aiQuiz.demographics.name}...`);

            // Step 6: Call AI for tips and usage instructions only
            const aiResponse = await this.addToQueue(async () => {
                return await this.makeAPICallWithRetry(aiPrompt, `tips-${aiQuiz.demographics.name}`);
            }, 'high');

            const aiResponseText = aiResponse.content?.[0]?.text?.trim();

            // Step 7: Parse AI response
            let cleanResponse = aiResponseText || "{}";
            cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

            let recommendation: any;
            try {
                recommendation = JSON.parse(cleanResponse);
            } catch (parseError) {
                console.error('AI Response parsing failed:', cleanResponse);
                // Fallback: create basic recommendation from selected products
                recommendation = this.createFallbackRecommendation(selectedProducts, aiQuiz);
            }

            console.log(`AI tips generation completed for ${aiQuiz.demographics.name}`);

            // Step 8: Create enhanced products from deterministic selection
            const enhancedProducts: ProductRecommendation[] = [];
            let totalCost = 0;

            for (const product of selectedProducts) {
                const productCost = product.price || 0;
                totalCost += productCost;

                // Find corresponding AI recommendation for this product
                const aiProduct = recommendation.products?.find((p: any) => p.productId === product.productId);

                enhancedProducts.push({
                    productId: product.productId,
                    productName: product.productName || 'Unknown Product',
                    targetConcern: aiProduct?.targetConcern || this.inferTargetConcern(product, aiQuiz),
                    priority: aiProduct?.priority || 'primary',
                    routineStep: aiProduct?.routineStep || this.inferRoutineStep(product),
                    price: productCost,
                    usageInstructions: aiProduct?.usageInstructions || this.generateDefaultUsageInstructions(product)
                });
            }

            // Step 8: Budget lower-bound validation (≥ 75% of stated budget)
            const budgetMatch = aiQuiz.preferences.budget.match(/\$(\d+)/);
            const budgetNum = budgetMatch ? parseInt(budgetMatch[1] || '0', 10) : 0;
            const minUtilization = Math.round(budgetNum * 0.75);

            let finalClinicalReasoning = recommendation.clinicalReasoning || 'Routine optimized for patient profile';
            if (budgetNum > 0 && totalCost < minUtilization) {
                finalClinicalReasoning += ` | Note: Budget utilization below 75% ($${totalCost} of $${budgetNum}). Catalog constraints or selected essentials/treatments kept it lower.`;
            }

            const utilizationString = `$${totalCost}/${aiQuiz.preferences.budget}`;

            // Step 9: Return final recommendation
            return {
                success: true,
                treatmentApproach: recommendation.treatmentApproach || 'single',
                products: enhancedProducts,
                totalCost,
                budgetUtilization: recommendation.budgetUtilization || utilizationString,
                clinicalReasoning: finalClinicalReasoning,
                tips: Array.isArray(recommendation.tips) ? recommendation.tips : []
            };

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
            console.error('getFinalProduct error:', error);
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

    // Helper: Filter tips based on skin type and sensitivity
    private static getFilteredTips(allTips: Array<{
        tip: string;
        skinTypes: string[];
        category: string;
        conflictsWith: string[];
    }>, aiQuiz: AICompatibleQuizModel): Array<{
        tip: string;
        skinTypes: string[];
        category: string;
        conflictsWith: string[];
    }> {
        const skinType = aiQuiz.skinAssessment.skinType;
        const sensitivity = aiQuiz.skinAssessment.skinSensitivity;

        return allTips.filter(tip => {
            // Filter by skin type
            if (tip.skinTypes.length > 0 && !tip.skinTypes.includes('All')) {
                const skinTypeMatch = tip.skinTypes.some(t =>
                    t.toLowerCase().includes(skinType) ||
                    (sensitivity === 'sensitive' && t.toLowerCase().includes('sensitive'))
                );
                if (!skinTypeMatch) return false;
            }

            // Filter by sensitivity
            if (sensitivity === 'sensitive') {
                // Include tips that are safe for sensitive skin
                const sensitiveSafe = tip.category.toLowerCase().includes('sensitive') ||
                    tip.tip.toLowerCase().includes('gentle') ||
                    tip.tip.toLowerCase().includes('sensitive');
                if (!sensitiveSafe) return false;
            }

            return true;
        });
    }

    // Helper: Create fallback recommendation when AI fails
    private static createFallbackRecommendation(selectedProducts: any[], aiQuiz: AICompatibleQuizModel): any {
        const totalCost = selectedProducts.reduce((sum, p) => sum + (p.price || 0), 0);

        return {
            treatmentApproach: "single",
            products: selectedProducts.map((product, index) => ({
                productId: product.productId,
                targetConcern: this.inferTargetConcern(product, aiQuiz),
                priority: index < 3 ? "primary" : "secondary",
                routineStep: this.inferRoutineStep(product),
                usageInstructions: this.generateDefaultUsageInstructions(product)
            })),
            totalCost,
            budgetUtilization: `$${totalCost}/${aiQuiz.preferences.budget}`,
            clinicalReasoning: "Routine selected based on patient profile and ingredient effectiveness",
            tips: ["Follow the recommended routine consistently", "Patch test new products", "Use SPF daily"]
        };
    }

    // Helper: Infer target concern from product ingredients
    private static inferTargetConcern(product: any, aiQuiz: AICompatibleQuizModel): string {
        const primaryConcern = aiQuiz.concerns.primary[0] || 'general';
        const ingredients = (product.primaryActiveIngredients?.plain_text || '').toLowerCase();

        // Map ingredients to concerns
        if (ingredients.includes('salicylic') || ingredients.includes('benzoyl peroxide')) {
            return 'acne';
        }
        if (ingredients.includes('vitamin c') || ingredients.includes('ascorbic')) {
            return 'hyperpigmentation';
        }
        if (ingredients.includes('retinol') || ingredients.includes('retinal')) {
            return 'wrinkles';
        }
        if (ingredients.includes('niacinamide')) {
            return 'pores';
        }

        return primaryConcern;
    }

    // Helper: Infer routine step from product
    private static inferRoutineStep(product: any): number {
        const steps = product.step?.map((s: any) => s.name?.toLowerCase()) || [];
        const name = (product.productName || '').toLowerCase();

        if (steps.includes('cleanse') || name.includes('cleanser') || name.includes('wash')) {
            return 1;
        }
        if (steps.includes('treat') || steps.includes('serum') || name.includes('serum')) {
            return 2;
        }
        if (steps.includes('moisturize') || name.includes('moisturizer') || name.includes('cream')) {
            return 3;
        }
        if (steps.includes('protect') || name.includes('spf') || name.includes('sunscreen')) {
            return 4;
        }

        return 3; // Default to moisturizer step
    }

    // Helper: Generate default usage instructions
    private static generateDefaultUsageInstructions(product: any): string {
        const steps = product.step?.map((s: any) => s.name?.toLowerCase()) || [];
        const name = (product.productName || '').toLowerCase();

        if (steps.includes('cleanse') || name.includes('cleanser')) {
            return "Apply to wet face, massage gently, then rinse thoroughly with water. Use morning and evening.";
        }
        if (steps.includes('treat') || steps.includes('serum')) {
            return "Apply a small amount to clean skin, avoiding eye area. Use as directed, typically once daily.";
        }
        if (steps.includes('moisturize') || name.includes('moisturizer')) {
            return "Apply to clean skin, gently massage until absorbed. Use morning and evening.";
        }
        if (steps.includes('protect') || name.includes('spf')) {
            return "Apply as the final step in your morning routine. Reapply every 2 hours if exposed to sun.";
        }

        return "Follow the product instructions on the packaging.";
    }
}

export default RecommendationService;
export type { RecommendationResponse, ProductRecommendation };

