/**
 * Clean Product Recommendation Filter
 * Simple flow: All Products → Safety → Essentials (with premium criteria) → Treatments → Budget
 */

import Product from "../../models/product.model";
import { AICompatibleQuizModel } from "../../models/quiz.model";
import { ProductUtils } from "./utils/ProductUtils";
import { SPFUtils } from "./utils/SPFUtils";
import { ValidationUtils } from "./utils/ValidationUtils";
import { DiversityChecker } from "./utils/DiversityChecker";
import { ConcernScorer } from "./scoring/ConcernScorer";
import { CompatibilityEnforcer } from "./compatibility/CompatibilityEnforcer";
import { ProductCategorizer } from "./selection/ProductCategorizer";
import { BudgetManager } from "./budget/BudgetManager";
import DbService from "../db.service";

export class ProductFilterClean {

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

        // 1. Select cleanser with premium criteria
        const bestCleanser = this.selectBestProduct(buckets.cleansers, aiQuiz, "cleanse");
        if (bestCleanser) {
            essentials.push(bestCleanser);
            console.log(`🧴 Selected cleanser: ${bestCleanser.productName}`);
        }

        // 2. Prioritize combo moisturizer+SPF
        const comboProducts = safeProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(p);
        });

        const bestCombo = this.selectBestProduct(comboProducts, aiQuiz, "combo");
        if (bestCombo) {
            essentials.push(bestCombo);
            console.log(`🧴 Selected combo moisturizer+SPF: ${bestCombo.productName}`);
            return essentials; // We have cleanser + combo, that's enough
        }

        // 3. If no combo, select separate moisturizer and SPF
        const bestMoisturizer = this.selectBestProduct(buckets.moisturizers, aiQuiz, "moisturize");
        if (bestMoisturizer) {
            essentials.push(bestMoisturizer);
            console.log(`🧴 Selected moisturizer: ${bestMoisturizer.productName}`);
        }

        const bestSPF = this.selectBestProduct(buckets.protects, aiQuiz, "protect");
        if (bestSPF) {
            essentials.push(bestSPF);
            console.log(`🧴 Selected SPF: ${bestSPF.productName}`);
        }

        return essentials;
    }

    /**
     * Add treatments if budget allows
     */
    private static addTreatments(aiQuiz: AICompatibleQuizModel, safeProducts: Product[], essentials: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const essentialsCost = ProductUtils.totalCost(essentials);
        const remainingBudget = ceil - essentialsCost;

        console.log(`💰 Budget check: Essentials=${essentialsCost}, Remaining=${remainingBudget}`);

        if (remainingBudget <= 10) {
            console.log(`⚠️ Low budget, keeping essentials only`);
            return essentials;
        }

        // Select treatments with premium criteria
        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const existingIds = new Set(essentials.map(p => p.productId));
        const availableTreatments = buckets.treats.filter(t => !existingIds.has(t.productId));

        const bestTreatment = this.selectBestProduct(availableTreatments, aiQuiz, "treat");
        if (bestTreatment && (essentialsCost + (bestTreatment.price || 0)) <= ceil) {
            essentials.push(bestTreatment);
            console.log(`🧴 Added treatment: ${bestTreatment.productName}`);
        }

        return essentials;
    }

    /**
     * Single isBestProductForUser function - apply everywhere
     */
    private static selectBestProduct(candidates: Product[], aiQuiz: AICompatibleQuizModel, category: string): Product | null {
        if (candidates.length === 0) return null;

        // Apply premium criteria to all candidates
        const premiumCandidates = candidates.filter(p => this.isBestProductForUser(p, aiQuiz));

        if (premiumCandidates.length > 0) {
            // Score premium products
            const scored = premiumCandidates
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0 && scored[0]) {
                console.log(`🎯 ${category}: Found ${premiumCandidates.length} premium options, selected: ${scored[0].product.productName}`);
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
            console.log(`⚠️ ${category}: No premium options, fallback to: ${scored[0].product.productName}`);
            return scored[0].product;
        }

        return null;
    }

    /**
     * Single premium criteria function
     */
    private static isBestProductForUser(product: Product, aiQuiz: AICompatibleQuizModel): boolean {
        return DbService.isBestProductForUser(product, aiQuiz);
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

        console.log(`💰 Over budget (${totalCost}>${ceil}), keeping essentials only`);
        return essentials;
    }
}