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
        // Use passed essentials or create new ones (only if not provided)
        const finalEssentials = essentials || EssentialSelector.ensureEssentials(aiQuiz, filtered, allProducts);

        // console.log(`🏗️ ROUTINE BUILDER: Using ${essentials ? 'PASSED' : 'NEW'} essentials`);

        const essentialProducts: Product[] = [];
        if (finalEssentials.cleanser) essentialProducts.push(finalEssentials.cleanser);
        if (finalEssentials.moisturizer) essentialProducts.push(finalEssentials.moisturizer);
        if (finalEssentials.protect && finalEssentials.protect !== finalEssentials.moisturizer) {
            essentialProducts.push(finalEssentials.protect);
        }

        let treatmentsAdded = 0;
        if (finalEssentials.treatment) {
            essentialProducts.push(finalEssentials.treatment);
            treatmentsAdded++;
        }

        const buckets = ProductCategorizer.bucketByCategory(filtered);
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
        const treatPool = buckets.treats.filter(t => allowEye ? true : !ProductUtils.isEyeProduct(t));

        const essentialTreatmentId = finalEssentials.treatment?.productId;
        const additionalTreatPool = treatPool.filter(t => t.productId !== essentialTreatmentId);

        let pickTreats = TreatmentScorer.selectConcernTreatments(aiQuiz, additionalTreatPool, essentialProducts);

        const chosenCleanser = finalEssentials.cleanser;
        if (chosenCleanser && ValidationUtils.isExfoliating(chosenCleanser)) {
            pickTreats = pickTreats.filter(t => !ValidationUtils.isExfoliating(t));
        } else {
            const exfoliatingTreatments = pickTreats.filter(t => ValidationUtils.isExfoliating(t));
            if (exfoliatingTreatments.length > 1) {
                const firstEx = exfoliatingTreatments[0];
                if (firstEx) {
                    pickTreats = pickTreats.filter(t => !ValidationUtils.isExfoliating(t) || t.productId === firstEx.productId);
                }
            }
        }

        if (treatmentsAdded === 0 && pickTreats.length === 0) {
            EssentialSelector.addUserNote("Note: We couldn't include a treatment product in your routine because we couldn't find one that matches your skin type and addresses your specific concerns safely. We've prioritized your core essentials (cleanser, moisturizer, and SPF) to ensure the best results without compromising on quality or safety.");
        }

        const finalPick: Product[] = [];
        for (const p of [...essentialProducts, ...pickTreats]) {
            if (!finalPick.find(x => x.productId === p.productId)) finalPick.push(p);
        }
        return finalPick;
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
