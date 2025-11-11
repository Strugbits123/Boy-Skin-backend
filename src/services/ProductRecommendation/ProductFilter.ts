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



    static async prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Promise<Product[]> {
        console.log(`🚀 Starting clean filter with ${allProducts.length} total products`);

        this.clearUserNotes();

        const essentialProducts = allProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") ||
                steps.includes("moisturize") ||
                steps.includes("protect");
        });

        const treatmentProducts = allProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            const isEssential = steps.includes("cleanse") ||
                steps.includes("moisturize") ||
                steps.includes("protect");
            return !isEssential;
        });

        let safeEssentials = essentialProducts
            .filter(p => !ProductUtils.hasNonCompatibleConflict(p))
            .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
            .filter(p => ValidationUtils.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));

        let safeTreatments = treatmentProducts
            .filter(p => !ProductUtils.hasNonCompatibleConflict(p))
            .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
            .filter(p => ProductUtils.productHasSkinType(p, aiQuiz.skinAssessment.skinType))
            .filter(p => ValidationUtils.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));

        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            safeEssentials = safeEssentials.filter(p => ProductUtils.isSensitiveSafe(p));
            safeTreatments = safeTreatments.filter(p => ProductUtils.isSensitiveSafe(p));
        }

        const safeProducts = [...safeEssentials, ...safeTreatments];
        console.log(`✅ Safe products: ${safeProducts.length} (Essentials: ${safeEssentials.length}, Treatments: ${safeTreatments.length})`);

        const essentials = this.selectEssentials(aiQuiz, safeProducts);
        console.log(`✅ Selected essentials: ${essentials.length} (${essentials.map(p => p.productName).join(', ')})`);

        const withTreatments = this.addTreatments(aiQuiz, safeProducts, essentials);
        console.log(`✅ With treatments: ${withTreatments.length}`);

        const budgetOptimized = this.optimizeBudget(aiQuiz, withTreatments);
        console.log(`✅ Final routine: ${budgetOptimized.length} products, Cost: $${ProductUtils.totalCost(budgetOptimized)}`);

        return budgetOptimized;
    }

    private static selectEssentials(aiQuiz: AICompatibleQuizModel, safeProducts: Product[]): Product[] {
        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const essentials: Product[] = [];
        const routineTime = aiQuiz.preferences.timeCommitment;

        const getRequiredProductCount = (time: string): { min: number, max: number } => {
            if (time === "5_minute") return { min: 2, max: 3 };
            if (time === "10_minute") return { min: 3, max: 5 };
            if (time === "15+_minute") return { min: 4, max: 6 };
            return { min: 3, max: 5 };
        };

        const { min: minProducts, max: maxProducts } = getRequiredProductCount(routineTime);

        const bestCleanser = this.selectBestProduct(buckets.cleansers, aiQuiz, "cleanser", true);
        if (bestCleanser) {
            essentials.push(bestCleanser);
        }

        const comboProducts = safeProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(p);
        });

        const bestCombo = this.selectBestProduct(comboProducts, aiQuiz, "combo moisturizer+SPF", true);

        if (bestCombo) {
            essentials.push(bestCombo);
            console.log(`✅ Found combo product: ${bestCombo.productName}`);
            return essentials;
        }

        const bestMoisturizer = this.selectBestProduct(buckets.moisturizers, aiQuiz, "moisturizer", true);
        if (bestMoisturizer) {
            essentials.push(bestMoisturizer);
        }

        const bestSPF = this.selectBestProduct(buckets.protects, aiQuiz, "SPF", true);
        if (bestSPF) {
            essentials.push(bestSPF);
        }

        console.log(`✅ Selected essentials: ${essentials.length} (${essentials.map(p => p.productName).join(', ')})`);
        return essentials;
    }

    private static addTreatments(aiQuiz: AICompatibleQuizModel, safeProducts: Product[], essentials: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const routineTime = aiQuiz.preferences.timeCommitment;

        const getTargetCount = (time: string): number => {
            console.log(`🎯 DEBUG TARGET COUNT: Routine time = '${time}'`);
            if (time === "5_minute") return 3;
            if (time === "10_minute") return 4;
            if (time === "15+_minute") return 5;
            return 4;
        };

        const targetCount = getTargetCount(routineTime);

        const hasCleanser = essentials.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse");
        });
        const hasMoisturizer = essentials.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize");
        });
        const hasSPF = essentials.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect");
        });

        if (!hasCleanser || !hasMoisturizer || !hasSPF) {
            console.log(`🚨 CRITICAL: Essentials incomplete! Cleanser=${hasCleanser}, Moisturizer=${hasMoisturizer}, SPF=${hasSPF}`);
            console.log(`⚠️ Returning essentials only for safety`);

            this.addMissingEssentialNotes(hasCleanser, hasMoisturizer, hasSPF, aiQuiz);

            return essentials;
        }

        console.log(`✅ SAFETY VALIDATED: All essentials present`);

        if (essentials.length >= targetCount) {
            return essentials;
        }

        const existingCategories = new Set<string>();
        essentials.forEach(p => {
            const steps = ProductUtils.productSteps(p);
            if (steps.includes("cleanse")) existingCategories.add("cleanse");
            if (steps.includes("moisturize")) existingCategories.add("moisturize");
            if (steps.includes("protect")) existingCategories.add("protect");
        });

        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const existingIds = new Set(essentials.map(p => p.productId));

        let availableTreatments = buckets.treats.filter(t => !existingIds.has(t.productId));

        let currentCost = ProductUtils.totalCost(essentials);
        const results = [...essentials];

        while (results.length < targetCount && availableTreatments.length > 0 && currentCost < ceil * 0.9) {
            const nextTreatment = this.selectBestProduct(availableTreatments, aiQuiz, "treatment", false);

            if (!nextTreatment) {
                console.log(`ℹ️ No more quality treatments available`);
                break;
            }

            const treatmentSteps = ProductUtils.productSteps(nextTreatment);
            const isPrimaryEssential =
                treatmentSteps.includes("cleanse") ||
                treatmentSteps.includes("moisturize") ||
                treatmentSteps.includes("protect");

            if (isPrimaryEssential) {
                console.log(`⚠️ Skipping ${nextTreatment.productName} - would create duplicate essential category`);

                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                continue;
            }

            if ((currentCost + (nextTreatment.price || 0)) <= ceil) {
                results.push(nextTreatment);
                currentCost += (nextTreatment.price || 0);

                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);

                console.log(`✅ Added treatment: ${nextTreatment.productName} ($${nextTreatment.price}) - Total: ${results.length}/${targetCount}`);
            } else {
                console.log(`💰 Budget limit reached ($${currentCost + (nextTreatment.price || 0)} > $${ceil})`);
                break;
            }
        }

        return results;
    }

    private static selectBestProduct(
        candidates: Product[],
        aiQuiz: AICompatibleQuizModel,
        category: string,
        isEssential: boolean = false
    ): Product | null {
        if (candidates.length === 0) {
            if (isEssential) {
                console.log(`🚨 CRITICAL: No ${category} candidates available!`);
            }
            return null;
        }

        const premiumCandidates = candidates.filter(p => DbService.isBestProductForUser(p, aiQuiz));

        if (premiumCandidates.length > 0) {
            const scored = premiumCandidates
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0 && scored[0]) {
                console.log(`✅ ${category}: Selected BEST quality - ${scored[0].product.productName}`);
                return scored[0].product;
            }
        }

        if (isEssential) {
            console.log(`⚠️ ${category}: No premium available, selecting SAFE fallback`);

            const scored = candidates
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0 && scored[0]) {
                console.log(`✅ ${category}: Safe fallback - ${scored[0].product.productName}`);
                return scored[0].product;
            }
        }

        const scored = candidates
            .map(p => ({
                product: p,
                score: ConcernScorer.scoreForConcerns(p, aiQuiz)
            }))
            .sort((a, b) => b.score - a.score);

        if (scored.length > 0 && scored[0]) {
            return scored[0].product;
        }

        console.log(`ℹ️ ${category}: No suitable products found`);
        return null;
    }

    private static optimizeBudget(aiQuiz: AICompatibleQuizModel, products: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const totalCost = ProductUtils.totalCost(products);

        if (totalCost <= ceil) {
            return products;
        }

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

    private static addMissingEssentialNotes(
        hasCleanser: boolean,
        hasMoisturizer: boolean,
        hasSPF: boolean,
        aiQuiz: AICompatibleQuizModel
    ): void {
        const missing: string[] = [];
        if (!hasCleanser) missing.push("cleanser");
        if (!hasMoisturizer) missing.push("moisturizer");
        if (!hasSPF) missing.push("sunscreen");

        if (missing.length === 0) return;

        const allergies = aiQuiz.safetyInformation.knownAllergies || [];
        const hasAllergies = allergies.length > 0;
        const skinType = aiQuiz.skinAssessment.skinType;
        const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

        missing.forEach(item => {
            let note = "";

            if (hasAllergies) {
                const allergyList = allergies.join(", ");

                if (item === "sunscreen") {
                    note = `We couldn't include a sunscreen in your routine due to your sensitivity to ${allergyList}. Please look for a ${allergyList}-free SPF product, as sun protection is essential for healthy skin.`;
                } else if (item === "moisturizer") {
                    note = `We couldn't include a moisturizer in your routine due to your sensitivity to ${allergyList}. Please consult with a dermatologist to find a suitable ${allergyList}-free moisturizer for your ${skinType} skin.`;
                } else if (item === "cleanser") {
                    note = `We couldn't include a cleanser in your routine due to your sensitivity to ${allergyList}. Please look for a gentle ${allergyList}-free cleanser suitable for ${skinType} skin.`;
                }
            } else if (isSensitive) {
                if (item === "sunscreen") {
                    note = `We're currently limited in sunscreen options for very sensitive skin. Please consult with a dermatologist for a gentle SPF recommendation, as sun protection is important for your skin health.`;
                } else if (item === "moisturizer") {
                    note = `We're currently limited in moisturizer options that are gentle enough for your very sensitive ${skinType} skin. Please consult with a dermatologist for a suitable recommendation.`;
                } else if (item === "cleanser") {
                    note = `We're currently limited in cleanser options that are gentle enough for your very sensitive ${skinType} skin. Please consult with a dermatologist for a suitable recommendation.`;
                }
            } else {
                if (item === "sunscreen") {
                    note = `We're currently unable to include a sunscreen that perfectly matches your ${skinType} skin type and concerns. Please look for an SPF product suitable for ${skinType} skin, as sun protection is essential.`;
                } else if (item === "moisturizer") {
                    note = `We're currently unable to include a moisturizer that matches your specific ${skinType} skin needs. Please look for a moisturizer formulated for ${skinType} skin.`;
                } else if (item === "cleanser") {
                    note = `We're currently unable to include a cleanser that matches your specific ${skinType} skin needs. Please look for a gentle cleanser formulated for ${skinType} skin.`;
                }
            }

            if (note) {
                this.addUserNote(note);
            }
        });
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
