/**
 * Product Recommendation Filter
 * Coordinates 10-step pipeline for personalized skincare routine generation
 */

import Product from "../../models/product.model";
import { AICompatibleQuizModel } from "../../models/quiz.model";
import { ProductUtils } from "./utils/ProductUtils";
import { SPFUtils } from "./utils/SPFUtils";
import { ValidationUtils } from "./utils/ValidationUtils";
import { ConcernScorer } from "./scoring/ConcernScorer";
import { CompatibilityEnforcer } from "./compatibility/CompatibilityEnforcer";
import { ProductCategorizer } from "./selection/ProductCategorizer";
import { EssentialSelector } from "./selection/EssentialSelector";
import { RoutineBuilder } from "./selection/RoutineBuilder";
import { BudgetManager } from "./budget/BudgetManager";

export class ProductFilter {

    /**
     * Validates that routine contains all essential product categories
     */
    static validateEssentials(selection: Product[]): {
        isValid: boolean;
        hasCleanser: boolean;
        hasMoisturizer: boolean;
        hasProtect: boolean;
        hasTreatment: boolean;
    } {
        const hasCleanser = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse");
        });

        const hasMoisturizer = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize");
        });

        const hasProtect = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect");
        });

        const hasProtectViaCombo = !hasProtect && selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize") && steps.includes("protect");
        });

        const hasTreatment = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        });

        const finalHasProtect = hasProtect || hasProtectViaCombo;

        return {
            isValid: hasCleanser && hasMoisturizer && finalHasProtect,
            hasCleanser,
            hasMoisturizer,
            hasProtect: finalHasProtect,
            hasTreatment
        };
    }

    /**
     * Executes 10-step filtering pipeline to generate personalized routine
     */
    static prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        EssentialSelector.clearUserNotes();

        let filtered = allProducts.filter(p => !ProductUtils.hasNonCompatibleConflict(p));

        filtered = filtered.filter(p => !ValidationUtils.violatesSafety(p, aiQuiz));

        const skinType = aiQuiz.skinAssessment.skinType;
        filtered = filtered.filter(p => ProductUtils.productHasSkinType(p, skinType));

        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => ProductUtils.isSensitiveSafe(p));
        }

        filtered = filtered.filter(p => ValidationUtils.passesStrengthFilter(p, skinType));

        const preEssentials = EssentialSelector.ensureEssentials(aiQuiz, filtered, allProducts);

        const finalPick = RoutineBuilder.buildRoutineBasics(aiQuiz, filtered, allProducts);

        const adjusted = BudgetManager.enforceBudget(aiQuiz, finalPick, filtered);

        const compatible = CompatibilityEnforcer.enforceCompatibility(aiQuiz, adjusted, filtered, this.validateEssentials);

        const validation = this.validateEssentials(compatible);

        let final = compatible;

        if (!validation.isValid) {
            console.error('CRITICAL: Core essentials missing after pipeline!');
            console.error(`Missing: Cleanser=${!validation.hasCleanser}, Moisturizer=${!validation.hasMoisturizer}, SPF=${!validation.hasProtect}`);

            const backupEssentials = EssentialSelector.ensureEssentials(aiQuiz, allProducts, allProducts);

            if (!validation.hasCleanser && backupEssentials.cleanser) {
                final.push(backupEssentials.cleanser);
            }
            if (!validation.hasMoisturizer && backupEssentials.moisturizer) {
                final.push(backupEssentials.moisturizer);
            }
            if (!validation.hasProtect && backupEssentials.protect) {
                const alreadyAdded = final.some((p: Product) => p.productId === backupEssentials.protect?.productId);
                if (!alreadyAdded) {
                    final.push(backupEssentials.protect);
                }
            }
            if (!validation.hasTreatment && backupEssentials.treatment) {
                final.push(backupEssentials.treatment);
            }

            const seen = new Set<string>();
            final = final.filter((p: Product) => {
                if (seen.has(p.productId)) return false;
                seen.add(p.productId);
                return true;
            });

            const totalCost = ProductUtils.totalCost(final);
            const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
            if (totalCost > ceil) {
                const { essentials, treats } = RoutineBuilder.splitEssentialsAndTreats(final);
                const scored = treats
                    .map((t: Product) => ({ t, s: ConcernScorer.scoreForConcerns(t, aiQuiz) }))
                    .sort((a: { t: Product; s: number }, b: { t: Product; s: number }) => a.s - b.s);

                let adjusted = [...essentials];
                let cost = ProductUtils.totalCost(adjusted);

                for (const item of scored.reverse()) {
                    const newCost = cost + (item.t.price || 0);
                    if (newCost <= ceil) {
                        adjusted.push(item.t);
                        cost = newCost;
                    }
                }
                final = adjusted;
            }
        }

        if (final.length < 3) {
            const safePool = allProducts
                .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
                .filter(p => ValidationUtils.passesStrengthFilter(p, skinType));
            const need = 3 - final.length;
            const existingIds = new Set(final.map((p: Product) => p.productId));
            const byCat = ProductCategorizer.bucketByCategory(safePool.filter((p: Product) => !existingIds.has(p.productId)));
            const addables: Product[] = [];

            for (const p of byCat.protects) {
                if (addables.length >= need) break;
                if (!SPFUtils.passesSpfQuality(p)) continue;
                addables.push(p);
            }
            for (const m of byCat.moisturizers) {
                if (addables.length >= need) break;
                addables.push(m);
            }
            for (const t of byCat.treats) {
                if (addables.length >= need) break;
                if (ValidationUtils.respectsExfoliationWith(final, t)) addables.push(t);
            }
            final = [...final, ...addables.slice(0, need)];
        }

        const ordered = CompatibilityEnforcer.finalSort(aiQuiz, final);

        const finalValidation = this.validateEssentials(ordered);

        if (!finalValidation.isValid) {
            console.error('❌❌❌ CRITICAL ERROR: Core essential products missing after all steps!');
            console.error('Missing:', {
                cleanser: !finalValidation.hasCleanser,
                moisturizer: !finalValidation.hasMoisturizer,
                protect: !finalValidation.hasProtect
            });
        }

        return ordered;
    }

    static getUserNotes(): string[] {
        return EssentialSelector.getUserNotes();
    }

    static clearUserNotes(): void {
        EssentialSelector.clearUserNotes();
    }

    static addUserNote(note: string): void {
        EssentialSelector.addUserNote(note);
    }
}

export default ProductFilter;
