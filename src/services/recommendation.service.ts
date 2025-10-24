import DbService from "./db.service";
import ValidationService from "../services/helper.service";
import { QuizModel, AICompatibleQuizModel } from "../models/quiz.model";
import { ProductRecommendation, RecommendationResponse } from "../models/recommendation.model";
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

            // Determine primary vs secondary concerns
            const allConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
            const primaryConcern = allConcerns[0] || 'general';
            const secondaryConcerns = allConcerns.slice(1);

            // Step 4: ENFORCED DOCUMENTATION APPROACH - AI must read docs first
            const aiPrompt = `
${aiDocumentation}

CRITICAL ENFORCEMENT - READ DOCUMENTATION FIRST:

BEFORE MAKING ANY DECISION, YOU MUST:
1. READ the complete documentation above TWICE
2. UNDERSTAND all rules and requirements
3. APPLY rules in the correct order
4. NEVER skip any mandatory rule

PATIENT PROFILE:
${JSON.stringify(aiQuiz, null, 2)}

DECISION PRIORITY ORDER (STRICT HIERARCHY):
1. SAFETY FIRST: Apply all safety rules from documentation
2. ESSENTIALS SECOND: Cleanser + Moisturizer + SPF (MANDATORY)
3. CONCERNS THIRD: Address primary concern with highest-scoring ingredients
4. BUDGET LAST: Stay within ${aiQuiz.preferences.budget} budget

AVAILABLE PRODUCTS:
${JSON.stringify(products, null, 2)}

FINAL VALIDATION (MANDATORY BEFORE RESPONDING):
□ Read documentation completely?
□ Applied all safety rules?
□ Included Cleanser + Moisturizer + SPF?
□ Addressed primary concern "${primaryConcern}"?
□ Total cost ≤ ${aiQuiz.preferences.budget}?
□ No ingredient conflicts?

RESPONSE FORMAT:
Return ONLY this JSON structure:
{
  "treatmentApproach": "single",
  "products": [
    {
      "productId": "exact-product-id",
      "targetConcern": "specific-concern",
      "priority": "primary",
      "routineStep": 1,
      "usageInstructions": "detailed instructions"
    }
  ],
  "totalCost": 0,
  "budgetUtilization": "$X/${aiQuiz.preferences.budget} (Z%)",
  "clinicalReasoning": "Why these products were chosen",
  "safetyNotes": ["safety note 1", "safety note 2"],
  "routineInstructions": ["instruction 1", "instruction 2"]
}

RETURN ONLY THE JSON OBJECT - NO OTHER TEXT.
`;
            console.log(`Starting AI consultation for ${aiQuiz.demographics.name}...`);

            // Step 5: Call AI with retry mechanism
            const aiResponse = await this.addToQueue(async () => {
                return await this.makeAPICallWithRetry(aiPrompt, `consultation-${aiQuiz.demographics.name}`);
            }, 'high');

            const aiResponseText = aiResponse.content?.[0]?.text?.trim();

            // Step 6: Parse AI response
            let cleanResponse = aiResponseText || "{}";
            cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

            let recommendation: any;
            try {
                recommendation = JSON.parse(cleanResponse);
            } catch (parseError) {
                console.error('AI Response parsing failed:', cleanResponse);
                throw new Error("AI provided invalid recommendation format");
            }

            console.log(`AI consultation completed for ${aiQuiz.demographics.name}`);

            // Step 7: Validate and enhance products with full details
            const enhancedProducts: ProductRecommendation[] = [];
            let totalCost = 0;

            for (const recProduct of recommendation.products || []) {
                const product = products.find(p => p.productId === recProduct.productId);
                if (!product) {
                    console.warn(`Product ${recProduct.productId} not found in database`);
                    continue;
                }

                const productCost = product.price || 0;
                totalCost += productCost;

                enhancedProducts.push({
                    productId: recProduct.productId,
                    productName: product.productName || 'Unknown Product',
                    targetConcern: recProduct.targetConcern || 'General',
                    priority: recProduct.priority || 'primary',
                    routineStep: recProduct.routineStep || 1,
                    price: productCost,
                    usageInstructions: recProduct.usageInstructions || 'Follow product instructions'
                });
            }

            // Step 8: Return final recommendation
            return {
                success: true,
                treatmentApproach: recommendation.treatmentApproach || 'single',
                products: enhancedProducts,
                totalCost,
                budgetUtilization: recommendation.budgetUtilization || `$${totalCost}/${aiQuiz.preferences.budget}`,
                routineInstructions: recommendation.routineInstructions || ['Follow routine as prescribed'],
                safetyNotes: recommendation.safetyNotes || ['No safety notes'],
                clinicalReasoning: recommendation.clinicalReasoning || 'Routine optimized for patient profile'
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
}

export default RecommendationService;
export type { RecommendationResponse, ProductRecommendation };




// Old Ai Prompt 
// Step 4: Enhanced AI prompt with STRICT enforcement including BUDGET ENFORCEMENT
// const aiPrompt = `
// ${aiDocumentation}

// CRITICAL INSTRUCTIONS - READ TWICE BEFORE RESPONDING:

// 1. The documentation above contains ALL the rules you must follow
// 2. Before selecting ANY product, re-read the relevant sections of the documentation
// 3. NEVER skip or ignore any rule - every rule is mandatory
// 4. When in doubt, refer back to the documentation

// PATIENT PROFILE (Already Transformed Per Documentation):
// ${JSON.stringify(aiQuiz, null, 2)}

// CONCERN PRIORITY HIERARCHY (MANDATORY):
// PRIMARY CONCERN: "${primaryConcern}" - MUST use highest-scoring ingredients (scores 8-10)
// SECONDARY CONCERNS: ${secondaryConcerns.length > 0 ? secondaryConcerns.join(', ') : 'None'} - Can use supporting ingredients (scores 5-7)

// CRITICAL RULES YOU MUST ENFORCE:

// RULE 1 - CONCERN TARGETING (Phase 4):
// - For PRIMARY concern "${primaryConcern}": Select products with HIGHEST-SCORING ingredients from docs
// - Refer to "Ingredient Effectiveness Matrix" in documentation
// - PRIMARY concerns MUST have primary actives (scores 8-10)
// - Do NOT use low-scoring ingredients for primary concerns

// RULE 2 - MANDATORY PRODUCTS (Phase 3, Rule R4):
// You MUST include ALL three essentials:
// ✓ Cleanser (appropriate for ${aiQuiz.skinAssessment.skinType} skin)
// ✓ Moisturizer (separate product - NOT just SPF)
// ✓ SPF Protection (SPF 30+ minimum)

// RULE 3 - SENSITIVE SKIN HANDLING (Phase 2, Rule T5):
// ${aiQuiz.skinAssessment.skinSensitivity === 'sensitive' ?
//         `Patient has sensitive skin - BUT:
// - DO NOT avoid effective actives completely
// - SELECT gentle formulations of high-scoring ingredients
// - INCLUDE barrier-supporting ingredients (ceramides, niacinamide)
// - PROVIDE gradual introduction instructions
// - STILL address all concerns with appropriate actives`
//         : 'Patient does not have sensitive skin - use standard formulations'}

// RULE 4 - AGE-BASED REQUIREMENTS (Phase 1):
// Patient age: ${aiQuiz.demographics.age}
// ${aiQuiz.demographics.age === '18-25' ?
//         '- REMOVE all retinol/retinal products (Rule S1)' :
//         '- Retinoids ARE ALLOWED and RECOMMENDED for anti-aging concerns'}

// RULE 5 - PRODUCT COUNT (Phase 3):
// Time commitment: ${aiQuiz.preferences.timeCommitment}
// ${aiQuiz.preferences.timeCommitment === '5_minute' ?
//         'Required: 2-3 products minimum (Rule R1)' :
//         aiQuiz.preferences.timeCommitment === '10_minute' ?
//             'Required: 3-5 products (Rule R2)' :
//             'Required: 4-6 products (Rule R3)'}

// RULE 6 - BUDGET ENFORCEMENT (Phase 6) - ABSOLUTE PRIORITY:
// Patient Budget: ${aiQuiz.preferences.budget}

// MANDATORY BUDGET RULES:
// ✓ Total cost of ALL products MUST be ≤ ${aiQuiz.preferences.budget}
// ✓ Calculate: Sum of ALL product prices
// ✓ If total > ${aiQuiz.preferences.budget}: REMOVE products or SUBSTITUTE cheaper alternatives
// ✓ NEVER exceed budget - even $1 over is FAILURE
// ✓ Budget utilization MUST show: $X/${aiQuiz.preferences.budget} (Z%) where Z ≤ 100%

// BUDGET VALIDATION BEFORE RESPONDING:
// □ Added up ALL product prices?
// □ Total cost ≤ ${aiQuiz.preferences.budget}?
// □ If over budget: removed/substituted products?
// □ Still have essentials (Cleanser + Moisturizer + SPF)?
// □ Budget percentage ≤ 100%?

// IF ANY CHECKBOX UNCHECKED → REDO PRODUCT SELECTION INTERNALLY (DO NOT SHOW REVISION PROCESS)

// BUDGET TIER GUIDANCE:
// ${(() => {
//         const budgetNum = parseInt(aiQuiz.preferences.budget.replace(/[^0-9]/g, ''));
//         if (budgetNum <= 70) {
//             return `Low Budget ($40-$70): Focus on ESSENTIALS ONLY (Cleanser + Moisturizer with SPF). Skip treatments if needed to stay under budget.`;
//         } else if (budgetNum <= 150) {
//             return `Mid Budget ($70-$150): Essentials + 1-2 treatments. Allocate 60% to basics, 40% to treatments.`;
//         } else {
//             return `High Budget ($150-$250): Essentials + 2-3 treatments. Allocate 50% to basics, 50% to treatments.`;
//         }
//     })()}

// AVAILABLE PRODUCTS DATABASE:
// ${JSON.stringify(products, null, 2)}

// BEFORE YOU RESPOND:
// 1. Re-read Phase 4 "Ingredient Effectiveness Matrix" for "${primaryConcern}"
// 2. Identify which ingredients score 8-10 for this concern
// 3. Find products containing those ingredients
// 4. Verify you have Cleanser + Moisturizer + SPF
// 5. Check compatibility matrix (Phase 5)
// 6. CALCULATE TOTAL COST and verify ≤ ${aiQuiz.preferences.budget}
// 7. If over budget: remove/substitute products and recalculate INTERNALLY
// 8. DO NOT SHOW YOUR WORKING OR REVISION PROCESS - ONLY RETURN FINAL VALID JSON

// RESPONSE FORMAT ENFORCEMENT - CRITICAL:

// YOUR ENTIRE RESPONSE MUST BE:
// - ONLY ONE SINGLE JSON OBJECT
// - NO explanatory text before or after the JSON
// - NO markdown code blocks (no \`\`\`json)
// - NO revision comments like "Let me revise..."
// - NO multiple JSON objects
// - NO thinking process shown
// - JUST THE RAW JSON OBJECT THAT MEETS ALL REQUIREMENTS

// IF YOUR FIRST CALCULATION IS OVER BUDGET:
// - DO THE REVISION SILENTLY IN YOUR HEAD
// - ONLY RETURN THE FINAL BUDGET-COMPLIANT JSON
// - DO NOT SHOW THE OVER-BUDGET VERSION

// EXPECTED JSON STRUCTURE (RETURN THIS EXACT FORMAT):
// {
//   "treatmentApproach": "single",
//   "products": [
//     {
//       "productId": "exact-product-id-from-database",
//       "targetConcern": "specific-concern",
//       "priority": "primary",
//       "routineStep": 1,
//       "usageInstructions": "detailed AM/PM instructions"
//     }
//   ],
//   "totalCost": 0,
//   "budgetUtilization": "$X/${aiQuiz.preferences.budget} (Z%)",
//   "clinicalReasoning": "Explain: 1) Why primary concern ingredient was chosen (reference docs score), 2) Why all essentials included, 3) How routine addresses patient profile, 4) Why total cost is within budget",
//   "safetyNotes": ["specific precautions based on docs rules Add In one by one Index as a bullet Points"],
//   "routineInstructions": ["complete AM/PM routine with all products Add In one by one Index as a bullet Points"]
// }

// FINAL VALIDATION CHECKLIST - Confirm INTERNALLY before responding:
// □ Primary concern has highest-scoring ingredient (8-10 from docs)?
// □ Cleanser included?
// □ Moisturizer included (separate from SPF)?
// □ SPF protection included?
// □ Product count matches time commitment?
// □ All products match ${aiQuiz.skinAssessment.skinType} skin type?
// □ No ingredient conflicts (Phase 5 checked)?
// □ TOTAL COST ≤ ${aiQuiz.preferences.budget}? ← CRITICAL
// □ Budget utilization ≤ 100%? ← CRITICAL
// □ Age-appropriate ingredients (${aiQuiz.demographics.age})?
// □ Response is ONLY ONE clean JSON object with NO extra text?

// If ANY checkbox is unchecked, REVISE INTERNALLY and only return the final valid JSON.

// DO NOT RESPOND WITH ANYTHING EXCEPT THE FINAL JSON OBJECT.
// `;