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
     * Calculate diversity score to prevent same products in every routine
     */
    static calculateDiversityScore(p: Product, aiQuiz: AICompatibleQuizModel): number {
        let diversityScore = 0;

        // Boost different product categories based on concerns
        const primaryConcerns = aiQuiz.concerns.primary;
        const steps = ProductUtils.productSteps(p);

        // Encourage treatment diversity
        if (steps.includes("treat")) {
            if (primaryConcerns.includes("acne") && ProductUtils.extractActives(p).includes("salicylic acid")) {
                diversityScore += 3;
            }
            if (primaryConcerns.includes("hyperpigmentation") && ProductUtils.extractActives(p).includes("vitamin c")) {
                diversityScore += 3;
            }
            if (primaryConcerns.includes("texture") && ProductUtils.extractActives(p).includes("glycolic acid")) {
                diversityScore += 3;
            }
            if (primaryConcerns.includes("redness") && ProductUtils.extractActives(p).includes("niacinamide")) {
                diversityScore += 3;
            }
        }

        return diversityScore;
    }

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

        // Enhanced validation: Check for combo products that serve multiple functions
        const hasComboMoisturizerSPF = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("moisturize") && steps.includes("protect");
        });

        const hasTreatment = selection.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        });

        // Both moisturizer and protect requirements can be met by combo products
        const finalHasProtect = hasProtect;
        const finalHasMoisturizer = hasMoisturizer || hasComboMoisturizerSPF;

        return {
            isValid: hasCleanser && finalHasMoisturizer && finalHasProtect,
            hasCleanser,
            hasMoisturizer: finalHasMoisturizer,
            hasProtect: finalHasProtect,
            hasTreatment
        };
    }

    /**
     * Executes 10-step filtering pipeline to generate personalized routine
     */
    static prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        EssentialSelector.clearUserNotes();

        // AI.DOC Phase 1: Safety Filtering Rules (CRITICAL - Apply first)
        let filtered = allProducts.filter(p => !ProductUtils.hasNonCompatibleConflict(p));
        filtered = filtered.filter(p => !ValidationUtils.violatesSafety(p, aiQuiz));

        // AI.DOC Phase 2: Skin Type Matching (EXACT matches only per Rules T1-T4)
        const skinType = aiQuiz.skinAssessment.skinType;
        filtered = filtered.filter(p => ProductUtils.productHasSkinType(p, skinType));

        // AI.DOC Rule T5: Sensitive Skin Override (improved to be less restrictive)
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => ProductUtils.isSensitiveSafe(p));
        }

        // AI.DOC Rule T6: Strength of Actives Filter (Post Skin-Type)
        filtered = filtered.filter(p => ValidationUtils.passesStrengthFilter(p, skinType));        // AI.DOC Phase 3: Check routine architecture requirements  
        const timeCommitment = aiQuiz.preferences.timeCommitment;
        const routineConfig = RoutineBuilder.getRoutineConfig(timeCommitment);

        // AI.DOC Phase 4: Enhanced Concern-Based Targeting with Diversity
        const scoredProducts = filtered.map(p => ({
            product: p,
            concernScore: ConcernScorer.scoreForConcerns(p, aiQuiz),
            diversityScore: this.calculateDiversityScore(p, aiQuiz)
        })).sort((a, b) => (b.concernScore + b.diversityScore) - (a.concernScore + a.diversityScore));

        // Use top-scored products for selection
        const topScoredProducts = scoredProducts.map(sp => sp.product);

        // 🎯 SINGLE SPF SELECTION POINT - Only EssentialSelector decides SPF
        const essentials = EssentialSelector.ensureEssentials(aiQuiz, topScoredProducts, allProducts);

        // Pass essentials to RoutineBuilder (no duplicate selection)  
        const finalPick = RoutineBuilder.buildRoutineBasics(aiQuiz, topScoredProducts, allProducts, essentials);

        const adjusted = BudgetManager.enforceBudget(aiQuiz, finalPick, filtered);

        // PRODUCTION FIX: Safe compatibility checking to prevent massive product drops
        let compatible = adjusted.filter(p => {
            return !ValidationUtils.violatesSafety(p, aiQuiz) &&
                !ProductUtils.hasNonCompatibleConflict(p);
        });

        const validation = this.validateEssentials(compatible);

        let final = DiversityChecker.ensureDiversity(compatible, aiQuiz, filtered);

        // PRODUCTION SAFETY: Ensure minimum product count meets AI.doc requirements
        if (final.length < 3) {
            const safeProducts = filtered.filter(p =>
                !ValidationUtils.violatesSafety(p, aiQuiz) &&
                ProductUtils.productHasSkinType(p, aiQuiz.skinAssessment.skinType)
            );

            const additionalProducts = safeProducts
                .filter(p => !final.some(f => f.productId === p.productId))
                .slice(0, 3 - final.length);

            final = [...final, ...additionalProducts];
        } if (!validation.isValid) {
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
                .filter(p => ValidationUtils.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));
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

        // AI.DOC Compliance Validation using existing ValidationUtils

        // AI.DOC Rule R6: Single Exfoliant Per Routine (STRICT) 
        const exfoliatingProducts = ordered.filter(p => ValidationUtils.isExfoliating(p));
        if (exfoliatingProducts.length > 1) {
            // Remove exfoliating cleansers, keep exfoliating treatments (AI.DOC preference)
            const exfoliatingCleansers = exfoliatingProducts.filter((p: Product) => {
                const steps = ProductUtils.productSteps(p);
                return steps.includes("cleanse");
            });

            ordered = ordered.filter(p => !exfoliatingCleansers.includes(p));
            EssentialSelector.addUserNote("Removed exfoliating cleanser to comply with single exfoliant rule - kept exfoliating treatment for better results.");
        }

        // AI.DOC Rule R7: Per-Step Product Caps (STRICT)
        // Max 1 cleanser, 1 moisturizer, 1 protect product
        const seenSteps = new Set<string>();
        ordered = ordered.filter(p => {
            const steps = ProductUtils.productSteps(p);
            const criticalSteps = ["cleanse", "moisturize", "protect"];

            for (const step of steps) {
                if (criticalSteps.includes(step)) {
                    if (seenSteps.has(step)) {
                        return false; // Skip duplicate step
                    }
                    seenSteps.add(step);
                }
            }
            return true;
        });

        // FINAL SPF DEDUPLICATION - Remove duplicate SPFs after ALL pipeline steps
        const spfProducts = ordered.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect") && SPFUtils.passesSpfQuality(p);
        });

        if (spfProducts.length > 1) {
            // Keep only the first SPF and remove others (AI.DOC Rule R7 compliance)
            const keepSPF = spfProducts[0];
            const removeSPF = spfProducts.slice(1);

            ordered = ordered.filter(p => {
                const shouldRemove = removeSPF.some(spf => spf.productId === p.productId);
                return !shouldRemove;
            });
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
