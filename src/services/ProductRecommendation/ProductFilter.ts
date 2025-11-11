/**
 * Clean Product Recommendation Filter
 * Simple flow: All Products → Safety → Essentials (with premium criteria) → Treatments → Budget
 */

import Product from "../../models/product.model";
import { AICompatibleQuizModel } from "../../models/quiz.model";
import { ProductUtils } from "./utils/ProductUtils";
import { SPFUtils } from "./utils/SPFUtils";
import { ValidationUtils } from "./utils/ValidationUtils";
import { ConcernScorer } from "./scoring/ConcernScorer";
import { ProductCategorizer } from "./selection/ProductCategorizer";
import { BudgetManager } from "./budget/BudgetManager";
import DbService from "../db.service";


export class ProductFilter {





    /**
     * Main filtering pipeline: All Products → Safety → Essentials → Treatments → Budget
     */
    static async prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Promise<Product[]> {
        console.log(`🚀 Starting clean filter with ${allProducts.length} total products`);

        // STEP 1: Apply ONLY safety rules (no premium filtering)
        let safeProducts = allProducts
            .filter(p => !ProductUtils.hasNonCompatibleConflict(p))
            .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
            .filter(p => ProductUtils.productHasSkinType(p, aiQuiz.skinAssessment.skinType))
            .filter(p => ValidationUtils.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));

        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            safeProducts = safeProducts.filter(p => ProductUtils.isSensitiveSafe(p));
        }

        console.log(`✅ Safe products after filtering: ${safeProducts.length}`);

        // STEP 2: Select 3 essentials with premium criteria
        const essentials = this.selectEssentials(aiQuiz, safeProducts);
        console.log(`✅ Selected essentials: ${essentials.length} (${essentials.map(p => p.productName).join(', ')})`);

        // STEP 3: Add treatments if budget allows
        const withTreatments = this.addTreatments(aiQuiz, safeProducts, essentials);
        console.log(`✅ With treatments: ${withTreatments.length}`);

        // STEP 4: Apply budget optimization
        const budgetOptimized = this.optimizeBudget(aiQuiz, withTreatments);
        console.log(`✅ Final routine: ${budgetOptimized.length} products, Cost: $${ProductUtils.totalCost(budgetOptimized)}`);

        return budgetOptimized;
    }

    /**
     * Select 3 essentials: cleanser + moisturizer + SPF (prioritize combo moisturizer+SPF)
     */
    private static selectEssentials(aiQuiz: AICompatibleQuizModel, safeProducts: Product[]): Product[] {
        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const essentials: Product[] = [];
        const routineTime = aiQuiz.preferences.timeCommitment;

        // Get required product count based on routine time (AI docs Rule R1-R3)
        const getRequiredProductCount = (time: string): { min: number, max: number } => {
            if (time === "5_minute") return { min: 2, max: 3 };  // Basic routine
            if (time === "10_minute") return { min: 3, max: 5 }; // Standard routine  
            if (time === "15+_minute") return { min: 4, max: 6 }; // Comprehensive routine
            return { min: 3, max: 5 }; // Default to standard
        };

        const { min: minProducts, max: maxProducts } = getRequiredProductCount(routineTime);

        // 1. ALWAYS select cleanser (MANDATORY - AI docs Rule R4)
        const bestCleanser = this.selectBestProduct(buckets.cleansers, aiQuiz, "cleanser");
        if (bestCleanser) {
            essentials.push(bestCleanser);
        }

        // 2. PRIORITY: Try combo moisturizer+SPF first (user's preference)
        const comboProducts = safeProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(p);
        });

        const bestCombo = this.selectBestProduct(comboProducts, aiQuiz, "combo");
        let hasSpfCoverage = false;
        let hasMoisturizerCoverage = false;

        if (bestCombo) {
            essentials.push(bestCombo);
            hasSpfCoverage = true;
            hasMoisturizerCoverage = true;
            console.log(`✅ Found combo product: ${bestCombo.productName}`);
        } else {
            // 3. If no combo available, get separate moisturizer and SPF (MANDATORY)
            const bestMoisturizer = this.selectBestProduct(buckets.moisturizers, aiQuiz, "moisturizer");
            if (bestMoisturizer) {
                essentials.push(bestMoisturizer);
                hasMoisturizerCoverage = true;
            }

            const bestSPF = this.selectBestProduct(buckets.protects, aiQuiz, "SPF");
            if (bestSPF) {
                essentials.push(bestSPF);
                hasSpfCoverage = true;
            }
        }

        // 4. SAFETY CHECK: Ensure we have all essentials (AI docs Rule R4 compliance)
        if (!hasSpfCoverage || !hasMoisturizerCoverage) {
            console.log(`⚠️ MISSING ESSENTIAL: SPF=${hasSpfCoverage}, Moisturizer=${hasMoisturizerCoverage}`);

            // Force fallback to ANY available products from all safe products for safety
            if (!hasMoisturizerCoverage) {
                const allMoisturizers = safeProducts.filter(p => {
                    const steps = ProductUtils.productSteps(p);
                    return steps.includes("moisturize");
                });
                if (allMoisturizers.length > 0 && allMoisturizers[0]) {
                    essentials.push(allMoisturizers[0]);
                    hasMoisturizerCoverage = true;
                }
            }
            if (!hasSpfCoverage) {
                const allSPFs = safeProducts.filter(p => {
                    const steps = ProductUtils.productSteps(p);
                    return steps.includes("protect") && SPFUtils.passesSpfQuality(p);
                });
                if (allSPFs.length > 0 && allSPFs[0]) {
                    essentials.push(allSPFs[0]);
                    hasSpfCoverage = true;
                }
            }
        }        // Note: Don't add treatments here - let addTreatments method handle all treatment logic        console.log(`✅ Selected essentials: ${essentials.length} (${essentials.map(p => p.productName).join(', ')})`);
        return essentials;
    }

    /**
     * Add treatments based on routine time and budget (AI docs compliance)
     */
    private static addTreatments(aiQuiz: AICompatibleQuizModel, safeProducts: Product[], essentials: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const routineTime = aiQuiz.preferences.timeCommitment;

        // Get target product count for routine time (AI docs Rule R1-R3)
        const getTargetCount = (time: string): number => {
            console.log(`🎯 DEBUG TARGET COUNT: Routine time = '${time}'`);
            if (time === "5_minute") return 3;      // Max 3 for basic
            if (time === "10_minute") return 4;     // Target 4 for standard  
            if (time === "15+_minute") return 5;    // Target 5 for comprehensive
            return 4; // Default
        };

        const targetCount = getTargetCount(routineTime);

        // If we already have enough products, return
        if (essentials.length >= targetCount) {
            return essentials;
        }

        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const existingIds = new Set(essentials.map(p => p.productId));
        const availableTreatments = buckets.treats.filter(t => !existingIds.has(t.productId));

        // Add treatments until we reach target count or budget limit
        let currentCost = ProductUtils.totalCost(essentials);
        const results = [...essentials];

        while (results.length < targetCount && availableTreatments.length > 0 && currentCost < ceil * 0.9) {
            const nextTreatment = this.selectBestProduct(availableTreatments, aiQuiz, "treatment");

            if (nextTreatment && (currentCost + (nextTreatment.price || 0)) <= ceil) {
                results.push(nextTreatment);
                currentCost += (nextTreatment.price || 0);

                // Remove from available to avoid duplicates
                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);

                console.log(`✅ Added treatment: ${nextTreatment.productName} ($${nextTreatment.price}) - Total: ${results.length}/${targetCount}`);
            } else {
                break; // Can't add more within budget
            }
        }

        return results;
    }

    /**
     * Single isBestProductForUser function - apply everywhere
     */
    private static selectBestProduct(candidates: Product[], aiQuiz: AICompatibleQuizModel, category: string): Product | null {
        if (candidates.length === 0) return null;

        // Apply premium criteria to all candidates
        const premiumCandidates = candidates.filter(p => DbService.isBestProductForUser(p, aiQuiz));

        if (premiumCandidates.length > 0) {
            // Score premium products
            const scored = premiumCandidates
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0 && scored[0]) {
                return scored[0].product;
            }
        }

        // Fallback: Select best basic product that meets all conditions
        const scored = candidates
            .map(p => ({
                product: p,
                score: ConcernScorer.scoreForConcerns(p, aiQuiz)
            }))
            .sort((a, b) => b.score - a.score);

        if (scored.length > 0 && scored[0]) {
            return scored[0].product;
        }

        return null;
    }

    /**
     * Apply budget optimization
     */
    private static optimizeBudget(aiQuiz: AICompatibleQuizModel, products: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const totalCost = ProductUtils.totalCost(products);

        if (totalCost <= ceil) {
            return products;
        }

        // If over budget, prioritize essentials
        const essentials = products.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
        });

        return essentials;
    }


    private static userNotes: string[] = [];

    static getUserNotes(): string[] {
        return this.userNotes.slice();
    }

    static clearUserNotes(): void {
        this.userNotes = [];
    }

    static addUserNote(note: string): void {
        if (note && !this.userNotes.includes(note)) {
            this.userNotes.push(note);
        }
    }

    /**
     * Simple getBestProductsForUser - just return best products
     */
    static async getBestProductsForUser(aiQuiz: AICompatibleQuizModel): Promise<Product[]> {
        try {
            const allProducts = await DbService.getCachedNotionProducts();

            // 🎯 CATEGORY-SPECIFIC PREMIUM CRITERIA: Use different standards for different product types
            const bestProducts = allProducts.filter(product => {
                const steps = ProductUtils.productSteps(product);
                const isEssential = steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");

                if (isEssential) {
                    // For essential products: Use relaxed premium criteria to ensure coverage
                    return this.isRelaxedBestProductForUser(product, aiQuiz);
                } else {
                    // For treatments: Use strict premium criteria
                    return DbService.isBestProductForUser(product, aiQuiz);
                }
            });

            console.log(`🎯 Found ${bestProducts.length} premium products for ${aiQuiz.demographics.name}`);

            // 🔍 DEBUG: Show breakdown by category
            const cleanserCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("cleanse")).length;
            const moisturizerCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("moisturize")).length;
            const spfCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("protect")).length;
            const treatmentCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("treat")).length;

            console.log(`🎯 BALANCED PREMIUM PRODUCTS: Cleansers=${cleanserCount}, Moisturizers=${moisturizerCount}, SPF=${spfCount}, Treatments=${treatmentCount}`);

            return bestProducts;
        } catch (error) {
            console.error('Error getting best products:', error);
            return [];
        }
    }

    /**
     * COMPREHENSIVE isBestProductForUser logic - apply at every filtering step
     * Integrates DbService logic directly into ProductFilter
     */
    private static isBestProductForUser(product: Product, aiQuiz: AICompatibleQuizModel): boolean {
        try {
            // STEP 1: Check if it's a best product (premium ingredients + functions + price)
            const primaryActives = product.primaryActiveIngredients || [];
            const functions = product.function || [];
            const price = product.price || 0;

            const topActives = ["Azelaic Acid", "Retinol", "Vitamin C", "Niacinamide", "Salicylic Acid", "Hyaluronic Acid"];
            const topFunctions = ["Treat", "Spot Treatment", "Exfoliate", "Protect"];

            const hasTopActive = primaryActives.some(active =>
                topActives.some(topActive =>
                    (active.name || "").toLowerCase().includes(topActive.toLowerCase())
                )
            );

            const hasTopFunction = functions.some(func =>
                topFunctions.some(topFunc =>
                    (func.name || "").includes(topFunc)
                )
            );

            const hasPremiumPrice = price >= 18;
            const hasMultipleActives = primaryActives.length >= 2;

            // Must meet premium criteria first
            const isBestProduct = (hasTopActive && hasTopFunction) || (hasTopActive && hasPremiumPrice) || (hasTopFunction && hasMultipleActives);
            if (!isBestProduct) return false;

            // STEP 2: User-specific matching
            const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();
            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            // STEP 3: Skin type matching
            const productSkinTypes = (product.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));

            // STEP 4: Concern matching
            const productConcerns = (product.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );

            // STEP 5: Sensitive skin check
            if (isSensitive) {
                const sensitiveFriendly = (product.sensitiveSkinFriendly?.name || "").toLowerCase();
                if (sensitiveFriendly.includes("no")) return false;
            }

            return skinTypeMatch && concernMatch;

        } catch (error) {
            console.error('Error checking if product is best for user:', error);
            return false;
        }
    }

    /**
     * 🎯 RELAXED PREMIUM CRITERIA - For fallback essential products (cleanser, moisturizer, SPF)
     */
    private static isRelaxedBestProductForUser(product: Product, aiQuiz: AICompatibleQuizModel): boolean {
        try {
            // STEP 1: Relaxed premium criteria for essential categories
            const primaryActives = product.primaryActiveIngredients || [];
            const functions = product.function || [];
            const price = product.price || 0;

            const topActives = ["Azelaic Acid", "Retinol", "Vitamin C", "Niacinamide", "Salicylic Acid", "Hyaluronic Acid"];
            const topFunctions = ["Treat", "Spot Treatment", "Exfoliate", "Protect"];

            const hasTopActive = primaryActives.some(active =>
                topActives.some(topActive =>
                    (active.name || "").toLowerCase().includes(topActive.toLowerCase())
                )
            );

            const hasTopFunction = functions.some(func =>
                topFunctions.some(topFunc =>
                    (func.name || "").includes(topFunc)
                )
            );

            const hasPremiumPrice = price >= 18;
            const hasMultipleActives = primaryActives.length >= 2;

            // 🎯 RELAXED CRITERIA: Category-specific premium requirements
            const steps = ProductUtils.productSteps(product);
            const isCleanser = steps.includes("cleanse");
            const isMoisturizerOrSPF = steps.includes("moisturize") || steps.includes("protect");
            const isTreatment = steps.includes("treat");

            let isBestProduct: boolean;
            if (isCleanser) {
                // For cleansers: VERY LENIENT - any premium criteria OR decent price OR good functions
                isBestProduct = hasTopActive || hasTopFunction || hasPremiumPrice || hasMultipleActives || price >= 8 || functions.length > 0;
            } else if (isMoisturizerOrSPF) {
                // For moisturizers/SPF: Moderate criteria - any premium criteria OR decent price
                isBestProduct = hasTopActive || hasTopFunction || hasPremiumPrice || hasMultipleActives || price >= 12;
            } else {
                // For treatments: Standard premium criteria (less strict than main pipeline)
                isBestProduct = hasTopActive || hasTopFunction || hasPremiumPrice || hasMultipleActives;
            }

            if (!isBestProduct) return false;

            // STEP 2: User-specific matching (same as strict version)
            const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();
            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            // STEP 3: Skin type matching
            const productSkinTypes = (product.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));

            // STEP 4: Concern matching
            const productConcerns = (product.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );

            // STEP 5: Sensitive skin check
            if (isSensitive) {
                const sensitiveFriendly = (product.sensitiveSkinFriendly?.name || "").toLowerCase();
                if (sensitiveFriendly.includes("no")) return false;
            }

            return skinTypeMatch && concernMatch;

        } catch (error) {
            console.error('Error checking if product is relaxed best for user:', error);
            return false;
        }
    }

    static getBestProductsFromCache(aiQuiz: AICompatibleQuizModel): Product[] {
        try {
            const bestProducts = DbService.getBestProductsForProfile(aiQuiz);

            return bestProducts;
        } catch (error) {
            console.error('Error getting best products from cache:', error);
            return [];
        }
    }
}

export default ProductFilter;
