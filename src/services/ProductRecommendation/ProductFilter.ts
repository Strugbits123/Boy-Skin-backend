/**
 * Product Recommendation Filter
 * Coordinates 10-step pipeline for personalized skincare routine generation
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

        // 🎯 SINGLE SPF SELECTION POINT - Only EssentialSelector decides SPF
        // console.log(`🎯 === CENTRALIZED SPF SELECTION START ===`);
        const essentials = EssentialSelector.ensureEssentials(aiQuiz, filtered, allProducts);
        // console.log(`🎯 === CENTRALIZED SPF SELECTION COMPLETE ===`);

        // Pass essentials to RoutineBuilder (no duplicate selection)
        const finalPick = RoutineBuilder.buildRoutineBasics(aiQuiz, filtered, allProducts, essentials);

        const adjusted = BudgetManager.enforceBudget(aiQuiz, finalPick, filtered);

        const compatible = CompatibilityEnforcer.enforceCompatibility(aiQuiz, adjusted, filtered, this.validateEssentials);

        const validation = this.validateEssentials(compatible);

        // console.log(`🔍 BEFORE DIVERSITY: ${compatible.length} products`);
        // compatible.forEach((p, i) => console.log(`   ${i + 1}. ${p.productName}`));

        let final = DiversityChecker.ensureDiversity(compatible, aiQuiz, filtered);

        // console.log(`🔍 AFTER DIVERSITY: ${final.length} products`);
        // final.forEach((p, i) => console.log(`   ${i + 1}. ${p.productName}`));

        if (!validation.isValid) {
            // console.error('CRITICAL: Core essentials missing after pipeline!');
            // console.error(`Missing: Cleanser=${!validation.hasCleanser}, Moisturizer=${!validation.hasMoisturizer}, SPF=${!validation.hasProtect}`);

            // 🚨 BACKUP ESSENTIALS - Use ORIGINAL essentials (no duplicate selection!)
            // console.log(`🚨 BACKUP MODE: Using original essentials instead of creating new ones`);

            if (!validation.hasCleanser && essentials.cleanser) {
                // console.log(`🔧 Adding backup cleanser: ${essentials.cleanser.productName}`);
                final.push(essentials.cleanser);
            }
            if (!validation.hasMoisturizer && essentials.moisturizer) {
                // console.log(`🔧 Adding backup moisturizer: ${essentials.moisturizer.productName}`);
                final.push(essentials.moisturizer);
            }
            if (!validation.hasProtect && essentials.protect) {
                const alreadyAdded = final.some((p: Product) => p.productId === essentials.protect?.productId);
                if (!alreadyAdded) {
                    // console.log(`🔧 Adding backup SPF: ${essentials.protect.productName}`);
                    final.push(essentials.protect);
                } else {
                    // console.log(`⚠️ SPF already present, skipping backup`);
                }
            }
            if (!validation.hasTreatment && essentials.treatment) {
                // console.log(`🔧 Adding backup treatment: ${essentials.treatment.productName}`);
                final.push(essentials.treatment);
            }

            // 🧹 COMPREHENSIVE DUPLICATE REMOVAL
            // console.log(`🧹 CLEANING DUPLICATES: Before cleanup: ${final.length} products`);
            // final.forEach((p, index) => console.log(`   ${index + 1}. ${p.productName}`));

            const seen = new Set<string>();
            final = final.filter((p: Product) => {
                if (seen.has(p.productId)) {
                    // console.log(`❌ REMOVED DUPLICATE: ${p.productName}`);
                    return false;
                }
                seen.add(p.productId);
                return true;
            });

            // console.log(`✅ AFTER CLEANUP: ${final.length} products remaining`);

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

            // 🚨 CHECK: Don't add SPF if already exists
            const hasSPF = final.some(p => {
                const steps = ProductUtils.productSteps(p);
                return steps.includes("protect") && SPFUtils.passesSpfQuality(p);
            });

            for (const p of byCat.protects) {
                if (addables.length >= need) break;
                if (!SPFUtils.passesSpfQuality(p)) continue;

                if (hasSPF) {
                    // console.log(`🚫 BLOCKED ADDITIONAL SPF: ${p.productName} (SPF already exists)`);
                    continue; // Skip SPF if already have one
                }

                // console.log(`➕ ADDING BACKUP SPF: ${p.productName}`);
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

        let ordered = CompatibilityEnforcer.finalSort(aiQuiz, final);

        // FINAL SPF DEDUPLICATION - Remove duplicate SPFs after ALL pipeline steps
        const spfProducts = ordered.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect") && SPFUtils.passesSpfQuality(p);
        });

        if (spfProducts.length > 1) {
            // console.log(`🚨 CRITICAL BUG: Centralized SPF selection failed! This should NOT happen!`);
            // console.log(`🚨 FOUND ${spfProducts.length} SPF PRODUCTS - EMERGENCY CLEANUP:`);
            // spfProducts.forEach((spf, index) => console.log(`   ${index + 1}. ${spf.productName}`));

            // Keep only the first SPF and remove others
            const keepSPF = spfProducts[0];
            const removeSPF = spfProducts.slice(1);

            ordered = ordered.filter(p => {
                const shouldRemove = removeSPF.some(spf => spf.productId === p.productId);
                if (shouldRemove) {
                    // console.log(`❌ REMOVING DUPLICATE SPF: ${p.productName}`);
                }
                return !shouldRemove;
            });

            if (keepSPF) {
                // console.log(`✅ KEPT SINGLE SPF: ${keepSPF.productName}`);
            }
        }

        const finalValidation = this.validateEssentials(ordered);

        if (!finalValidation.isValid) {
            // console.error('❌❌❌ CRITICAL ERROR: Core essential products missing after all steps!');
            // console.error('Missing:', {
            //     cleanser: !finalValidation.hasCleanser,
            //     moisturizer: !finalValidation.hasMoisturizer,
            //     protect: !finalValidation.hasProtect
            // });
        }

        // Generate accurate budget and treatment notes with final calculations
        const finalCost = ProductUtils.totalCost(ordered);
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const userSkinType = aiQuiz.skinAssessment.skinType;
        
        // Check if routine has treatment products
        const hasTreatments = ordered.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        });
        
        // Generate treatment note for sensitive skin without treatments
        if (!hasTreatments && aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            const treatmentNote = `Note: We couldn't include a treatment product in your routine because we couldn't find one that matches your ${userSkinType.toLowerCase()} skin type and addresses your specific concerns safely. We've prioritized your core essentials (cleanser, moisturizer, and SPF) to ensure the best results without compromising on quality or safety.`;
            EssentialSelector.addUserNote(treatmentNote);
        }
        
        // Generate budget note only if actually over budget
        if (finalCost > ceil) {
            const budgetNote = `Note: Your personalized routine ($${finalCost.toFixed(2)}) slightly exceeds your budget ($${ceil}) because we prioritized products that best match your ${userSkinType.toLowerCase()} skin type and your specific concerns. We couldn't find cheaper alternatives that would provide the same quality results while maintaining safety and effectiveness. We recommend keeping this routine for optimal results, but you can adjust your budget if needed.`;
            EssentialSelector.addUserNote(budgetNote);
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
