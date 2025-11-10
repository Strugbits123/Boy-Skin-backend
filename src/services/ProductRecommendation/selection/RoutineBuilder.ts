/**
 * Routine Building Engine
 * Assembles complete skincare routines with essential products and additional treatments
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";
import { ValidationUtils } from "../utils/ValidationUtils";
import { TreatmentScorer } from "../scoring/TreatmentScorer";
import { ProductCategorizer } from "./ProductCategorizer";
import { EssentialSelector } from "./EssentialSelector";

export class RoutineBuilder {

    static buildRoutineBasics(
        aiQuiz: AICompatibleQuizModel,
        filtered: Product[],
        allProducts: Product[],
        essentials?: { cleanser: Product | null; moisturizer: Product | null; protect: Product | null; treatment: Product | null }
    ): Product[] {
        // AI.doc Phase 3: Routine Architecture Rules

        // Use passed essentials or create new ones (only if not provided)
        const finalEssentials = essentials || EssentialSelector.ensureEssentials(aiQuiz, filtered, allProducts);

        // Determine routine complexity based on time commitment
        const timeCommitment = aiQuiz.preferences.timeCommitment || "10_minute";
        const routineConfig = this.getRoutineConfig(timeCommitment);

        const essentialProducts: Product[] = [];

        // Rule R7: Per-Step Product Caps (STRICT)
        // Max 1 cleanser, 1 moisturizer, 1 protect product
        if (finalEssentials.cleanser) essentialProducts.push(finalEssentials.cleanser);
        if (finalEssentials.moisturizer) essentialProducts.push(finalEssentials.moisturizer);

        // Handle SPF/Protect logic - avoid duplication
        if (finalEssentials.protect && finalEssentials.protect !== finalEssentials.moisturizer) {
            // Only add separate SPF if moisturizer doesn't have SPF
            const moisturizerHasSPF = finalEssentials.moisturizer &&
                ProductUtils.productSteps(finalEssentials.moisturizer).includes("protect");

            if (!moisturizerHasSPF) {
                essentialProducts.push(finalEssentials.protect);
            }
        }

        let treatmentsAdded = 0;
        if (finalEssentials.treatment) {
            essentialProducts.push(finalEssentials.treatment);
            treatmentsAdded++;
        }

        // Rule R5: Treatment Categories - Eye Cream ONLY if "dark circles" concern
        const buckets = ProductCategorizer.bucketByCategory(filtered);
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") ||
            aiQuiz.concerns.secondary.includes("dark circles");
        const treatPool = buckets.treats.filter(t => allowEye ? true : !ProductUtils.isEyeProduct(t));

        const essentialTreatmentId = finalEssentials.treatment?.productId;
        const additionalTreatPool = treatPool.filter(t => t.productId !== essentialTreatmentId);

        let pickTreats = TreatmentScorer.selectConcernTreatments(aiQuiz, additionalTreatPool, essentialProducts);

        // Rule R6: Single Exfoliant Per Routine (STRICT)
        // ALLOW ONLY ONE exfoliating product in any routine (cleanser OR treatment), not both
        const chosenCleanser = finalEssentials.cleanser;
        if (chosenCleanser && ValidationUtils.isExfoliating(chosenCleanser)) {
            // Cleanser is exfoliating - all treatments must be NON-exfoliating
            pickTreats = pickTreats.filter(t => !ValidationUtils.isExfoliating(t));
        } else {
            // Cleanser is non-exfoliating - allow max 1 exfoliating treatment
            const exfoliatingTreatments = pickTreats.filter(t => ValidationUtils.isExfoliating(t));
            if (exfoliatingTreatments.length > 1) {
                // Keep only the first (highest scored) exfoliating treatment
                const firstEx = exfoliatingTreatments[0];
                if (firstEx) {
                    pickTreats = pickTreats.filter(t =>
                        !ValidationUtils.isExfoliating(t) || t.productId === firstEx.productId
                    );
                }
            }
        }

        // Apply routine complexity limits (AI.doc Rules R1-R3)
        const currentCount = essentialProducts.length;
        const remainingSlots = routineConfig.maxProducts - currentCount;

        if (remainingSlots > 0) {
            pickTreats = pickTreats.slice(0, remainingSlots);
        } else {
            pickTreats = [];
        }

        // Safety message for minimal treatment scenarios
        if (treatmentsAdded === 0 && pickTreats.length === 0) {
            EssentialSelector.addUserNote("Note: We couldn't include a treatment product in your routine because we couldn't find one that matches your skin type and addresses your specific concerns safely. We've prioritized your core essentials (cleanser, moisturizer, and SPF) to ensure the best results without compromising on quality or safety.");
        }

        // Assemble final routine with deduplication
        const finalPick: Product[] = [];
        for (const p of [...essentialProducts, ...pickTreats]) {
            if (!finalPick.find(x => x.productId === p.productId)) {
                finalPick.push(p);
            }
        }

        return finalPick;
    }

    /**
     * AI.doc Phase 3: Get routine configuration based on time commitment
     */
    static getRoutineConfig(timeCommitment: string): { maxProducts: number; mandatorySteps: string[] } {
        switch (timeCommitment) {
            case "5_minute":
                // Rule R1: Basic Routine (5 minutes) - 2-3 products
                // MANDATORY: Cleanser + Moisturizer, OPTIONAL: None
                return { maxProducts: 3, mandatorySteps: ["cleanser", "moisturizer"] };

            case "15+_minute":
                // Rule R3: Comprehensive Routine (15+ minutes) - 4-6 products  
                // MANDATORY: Cleanser + Moisturizer + SPF
                return { maxProducts: 6, mandatorySteps: ["cleanser", "moisturizer", "protect"] };

            case "10_minute":
            default:
                // Rule R2: Standard Routine (10 minutes) - 3-5 products
                // MANDATORY: Cleanser + Moisturizer + SPF
                return { maxProducts: 5, mandatorySteps: ["cleanser", "moisturizer", "protect"] };
        }
    }

    static splitEssentialsAndTreats(products: Product[]): { essentials: Product[]; treats: Product[] } {
        const essentials: Product[] = [];
        const treats: Product[] = [];

        let treatmentCount = 0;

        for (const p of products) {
            const steps = ProductUtils.productSteps(p);
            const isCorEssential = steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
            const isTreatment = steps.includes("treat") || steps.includes("serum") || steps.includes("active");

            if (isCorEssential) {
                essentials.push(p);
            } else if (isTreatment) {
                if (treatmentCount === 0) {
                    essentials.push(p);
                    treatmentCount++;
                } else {
                    treats.push(p);
                }
            } else {
                treats.push(p);
            }
        }

        return { essentials, treats };
    }
}
