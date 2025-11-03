/**
 * Budget Management Engine
 * Smart budget optimization with essential protection and intelligent product replacement
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";
import { ValidationUtils } from "../utils/ValidationUtils";
import { ConcernScorer } from "../scoring/ConcernScorer";
import { ConflictDetector } from "../compatibility/ConflictDetector";
import { ProductCategorizer } from "../selection/ProductCategorizer";
import { EssentialSelector } from "../selection/EssentialSelector";
import { RoutineBuilder } from "../selection/RoutineBuilder";

export class BudgetManager {

    static getBudgetBounds(aiQuiz: AICompatibleQuizModel): { ceil: number; floor: number } {
        const raw = ProductUtils.parseBudgetToNumber(aiQuiz.preferences.budget);
        const ceil = Math.min(raw, 200);
        const floor = Math.round((ceil * 0.55) * 100) / 100;
        return { ceil, floor };
    }

    static enforceBudget(aiQuiz: AICompatibleQuizModel, current: Product[], candidatePool: Product[]): Product[] {
        const { ceil, floor } = this.getBudgetBounds(aiQuiz);
        const uniqueById = (arr: Product[]) => {
            const seen = new Set<string>();
            const out: Product[] = [];
            for (const p of arr) {
                if (!seen.has(p.productId)) {
                    seen.add(p.productId);
                    out.push(p);
                }
            }
            return out;
        };

        let selection = uniqueById(current);
        let total = ProductUtils.totalCost(selection);

        let { essentials, treats } = RoutineBuilder.splitEssentialsAndTreats(selection);

        const hasCleanser = essentials.some(p => ProductUtils.productSteps(p).includes("cleanse"));
        const hasMoisturizer = essentials.some(p => ProductUtils.productSteps(p).includes("moisturize"));
        const hasProtect = essentials.some(p => ProductUtils.productSteps(p).includes("protect"));
        const hasTreatment = essentials.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        });

        if (!hasCleanser || !hasMoisturizer || !hasProtect) {
            const backupEssentials = EssentialSelector.ensureEssentials(aiQuiz, candidatePool, candidatePool);

            if (!hasCleanser && backupEssentials.cleanser) {
                essentials.push(backupEssentials.cleanser);
            }
            if (!hasMoisturizer && backupEssentials.moisturizer) {
                essentials.push(backupEssentials.moisturizer);
            }
            if (!hasProtect && backupEssentials.protect) {
                const alreadyAdded = essentials.some(e => e.productId === backupEssentials.protect?.productId);
                if (!alreadyAdded) {
                    essentials.push(backupEssentials.protect);
                }
            }
            if (!hasTreatment && backupEssentials.treatment) {
                essentials.push(backupEssentials.treatment);
            }

            selection = [...essentials, ...treats];
            total = ProductUtils.totalCost(selection);
        }

        if (total > ceil) {

            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";
            let replacementAttempted = false;
            let replacementSuccessful = false;

            for (const treatment of treats) {
                if (total <= ceil) break;

                const budgetRemaining = ceil - ProductUtils.totalCost(essentials);
                const maxPriceForTreatment = budgetRemaining - ProductUtils.totalCost(treats.filter(t => t.productId !== treatment.productId));

                const alternativePool = candidatePool.filter((p: Product) => {
                    if (p.productId === treatment.productId) return false;
                    if ((p.price || 0) >= (treatment.price || 0)) return false;
                    if ((p.price || 0) > maxPriceForTreatment) return false;
                    if (ValidationUtils.violatesSafety(p, aiQuiz)) return false;
                    if (!ProductUtils.productHasSkinType(p, skinType)) return false;
                    if (isSensitive && !ProductUtils.isSensitiveSafe(p)) return false;
                    return true;
                });

                const alternativeBuckets = ProductCategorizer.bucketByCategory(alternativePool);
                const alternativeTreats = alternativeBuckets.treats;

                if (alternativeTreats.length > 0) {
                    replacementAttempted = true;

                    const scoredAlternatives = alternativeTreats
                        .filter(alt => {
                            const currentSelection = [...essentials, ...treats.filter(t => t.productId !== treatment.productId)];
                            return ConflictDetector.isSafeToAdd(alt, currentSelection);
                        })
                        .map(alt => {
                            const concernScore = ConcernScorer.scoreForConcerns(alt, aiQuiz);
                            const skinTypeMatch = ProductUtils.productHasSkinType(alt, skinType) ? 2.0 : 0;
                            const totalScore = concernScore + skinTypeMatch;
                            return { alt, s: totalScore, price: alt.price || 0 };
                        })
                        .sort((a, b) => {
                            if (b.s !== a.s) return b.s - a.s;
                            return a.price - b.price;
                        });

                    if (scoredAlternatives.length > 0 && scoredAlternatives[0]) {
                        const bestAlternative = scoredAlternatives[0].alt;

                        treats = treats.map(t => t.productId === treatment.productId ? bestAlternative : t);
                        selection = [...essentials, ...treats];
                        total = ProductUtils.totalCost(selection);
                        replacementSuccessful = true;
                    }
                }
            }

            if (total > ceil) {
                if (replacementAttempted && !replacementSuccessful) {

                    const budgetNote = `Note: Your personalized routine ($${total}) slightly exceeds your budget ($${ceil}) because we prioritized products that best match your ${skinType.toLowerCase()} skin type and your specific concerns. We couldn't find cheaper alternatives that would provide the same quality results while maintaining safety and effectiveness. We recommend keeping this routine for optimal results, but you can adjust your budget if needed.`;

                    EssentialSelector.addUserNote(budgetNote);
                }
            }

            return selection;
        }

        if (total < floor) {

            const inSel = new Set(selection.map(p => p.productId));
            const candidatesTreats = ProductCategorizer.bucketByCategory(candidatePool).treats
                .filter(t => !inSel.has(t.productId));

            const ranked = candidatesTreats
                .map(t => ({ t, s: ConcernScorer.scoreForConcerns(t, aiQuiz) }))
                .sort((a, b) => b.s - a.s)
                .map(x => x.t);

            let addedAny = false;
            let skippedDueToConflicts = 0;

            for (const cand of ranked) {
                if (!ValidationUtils.respectsExfoliationWith(selection, cand)) {
                    continue;
                }

                const hasConflict = selection.some(existing => ConflictDetector.conflicts(cand, existing));
                if (hasConflict) {
                    skippedDueToConflicts++;
                    continue;
                }

                const newTotal = ProductUtils.totalCost([...selection, cand]);
                if (newTotal <= ceil) {
                    selection.push(cand);
                    total = newTotal;
                    addedAny = true;
                    if (total >= floor) break;
                }
            }

            if (!addedAny && skippedDueToConflicts > 0 && total < floor) {
                const note = `Note: We've carefully selected this routine to ensure all products work safely together for your ${aiQuiz.skinAssessment.skinType.toLowerCase()} ${aiQuiz.skinAssessment.skinSensitivity === 'sensitive' ? 'sensitive' : ''} skin. While we could add more products to use your full budget, we've prioritized ingredient compatibility and safety over maximizing spending. This routine gives you the best results without risking skin irritation or product conflicts.`;
                EssentialSelector.addUserNote(note);
            }
        }

        return selection;
    }
}
