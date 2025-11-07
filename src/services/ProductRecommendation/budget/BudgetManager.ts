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

    // 🎯 AI.DOC BUDGET TIER SYSTEM
    static getBudgetTier(budget: number): 1 | 2 | 3 {
        if (budget <= 70) return 1;
        if (budget <= 150) return 2;
        return 3;
    }

    static getTierStrategy(tier: 1 | 2 | 3) {
        const strategies = {
            1: { name: "Low Budget - Essentials Only", targetProducts: [2, 3], targetUtilization: 95, maxTreatments: 0, allowEye: false },
            2: { name: "Mid Budget - Essentials + Treatment", targetProducts: [3, 4], targetUtilization: 80, maxTreatments: 2, allowEye: false },
            3: { name: "High Budget - Premium Multi-Treatment", targetProducts: [4, 6], targetUtilization: 85, maxTreatments: 3, allowEye: true }
        };
        return strategies[tier];
    }

    static optimizeForBudgetTier(
        aiQuiz: AICompatibleQuizModel,
        selection: Product[],
        candidatePool: Product[],
        strategy: any,
        budget: number
    ): Product[] {
        const currentCost = ProductUtils.totalCost(selection);
        const currentCount = selection.length;
        const utilizationPercent = (currentCost / budget) * 100;

        // console.log(`📊 CURRENT: ${currentCount} products, $${currentCost}, ${utilizationPercent.toFixed(1)}% utilization`);

        // If already optimal, return as is
        if (currentCount >= strategy.targetProducts[0] &&
            utilizationPercent >= strategy.targetUtilization - 10) {
            // console.log(`✅ TIER OPTIMIZATION: Already meets targets`);
            return selection;
        }

        // Apply tier-specific enhancement
        if (strategy.maxTreatments > 0) {
            selection = this.enhanceWithPremiumTreatments(aiQuiz, selection, candidatePool, strategy, budget);
        }

        return selection;
    }

    static enhanceWithPremiumTreatments(
        aiQuiz: AICompatibleQuizModel,
        selection: Product[],
        candidatePool: Product[],
        strategy: any,
        budget: number
    ): Product[] {
        const concerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
        const currentTreatments = selection.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.some(s => s.includes("treat"));
        }).length;

        if (currentTreatments >= strategy.maxTreatments) {
            return selection;
        }

        const neededTreatments = strategy.maxTreatments - currentTreatments;
        const budgetRemaining = budget - ProductUtils.totalCost(selection);
        const budgetPerTreatment = budgetRemaining / (neededTreatments + 1); // +1 for safety margin

        // console.log(`🎯 PREMIUM ENHANCEMENT: Need ${neededTreatments} treatments, $${budgetPerTreatment.toFixed(2)} per treatment`);

        const buckets = ProductCategorizer.bucketByCategory(candidatePool);
        const treatmentPool = buckets.treats.filter(t => {
            // Filter out existing treatments
            const alreadySelected = selection.some(s => s.productId === t.productId);
            if (alreadySelected) return false;

            // Price filtering for premium focus
            const price = t.price || 0;
            if (price > budgetPerTreatment) return false;

            // Exfoliation validation
            if (!ValidationUtils.respectsExfoliationWith(selection, t)) return false;

            return true;
        });

        // Score and select premium treatments
        const scored = treatmentPool
            .map(t => {
                let score = ConcernScorer.scoreForConcerns(t, aiQuiz);

                // Premium bonus for higher prices (quality indicator)
                const price = t.price || 0;
                const premiumBonus = Math.min(price / 50, 3); // Up to 3 point bonus for expensive products
                score += premiumBonus;

                // Multi-concern bonus
                const concernMatches = concerns.filter(c =>
                    (t.productName || '').toLowerCase().includes(c.toLowerCase()) ||
                    (ProductUtils.getPrimaryActivesText(t) || '').toLowerCase().includes(c.toLowerCase())
                ).length;
                score += concernMatches * 2;

                return { product: t, score, price };
            })
            .sort((a, b) => b.score - a.score);

        let enhanced = [...selection];
        let addedCount = 0;
        let totalSpent = ProductUtils.totalCost(selection);

        for (const { product, score, price } of scored) {
            if (addedCount >= neededTreatments) break;
            if (totalSpent + price > budget * 0.95) break; // Keep 5% margin

            enhanced.push(product);
            totalSpent += price;
            addedCount++;

            // console.log(`💎 ADDED PREMIUM: ${product.productName} - $${price} (Score: ${score.toFixed(1)})`);
        }

        // Add eye cream for Tier 3 if budget allows and concerns match
        if (strategy.allowEye && concerns.includes('dark circles')) {
            const eyeProducts = candidatePool.filter(p => {
                const name = (p.productName || '').toLowerCase();
                return name.includes('eye') && name.includes('cream');
            });

            for (const eyeProduct of eyeProducts) {
                const price = eyeProduct.price || 0;
                if (totalSpent + price <= budget * 0.95) {
                    enhanced.push(eyeProduct);
                    totalSpent += price;
                    // console.log(`👁️ ADDED EYE CREAM: ${eyeProduct.productName} - $${price}`);
                    break;
                }
            }
        }

        const finalUtilization = ((totalSpent / budget) * 100);
        // console.log(`🎯 TIER OPTIMIZATION COMPLETE: ${enhanced.length} products, $${totalSpent.toFixed(2)}, ${finalUtilization.toFixed(1)}% utilization`);

        return enhanced;
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

        // 🎯 AI.DOC BUDGET TIER STRATEGY
        const budgetTier = this.getBudgetTier(ceil);
        const tierStrategy = this.getTierStrategy(budgetTier);
        // console.log(`💰 AI.DOC BUDGET TIER ${budgetTier}: ${tierStrategy.name} ($${ceil})`);
        // console.log(`🎯 TARGETS: ${tierStrategy.targetProducts} products, ${tierStrategy.targetUtilization}% utilization`);

        // Apply tier-specific budget optimization
        selection = this.optimizeForBudgetTier(aiQuiz, selection, candidatePool, tierStrategy, ceil);

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

            // Note: Budget note generation moved to ProductFilter.ts for accurate final cost calculation

            return selection;
        }

        // Check current treatment count
        const treatmentCount = selection.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        }).length;

        // console.log(`💊 CURRENT TREATMENTS (${treatmentCount}):`, selection.filter(p => {
        //     const steps = ProductUtils.productSteps(p);
        //     return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        // }).map(p => p.productName));

        // Legacy budget analysis (kept for compatibility)
        const userHasConcerns = aiQuiz.concerns.primary.length > 0 || aiQuiz.concerns.secondary.length > 0;
        const budgetUtilization = (total / ceil) * 100;

        // Legacy budget tier naming
        let legacyTierName: string;
        let targetTreatments: number;
        let targetProducts: number;

        if (ceil <= 70) {
            legacyTierName = "TIER 1: Low Budget";
            targetTreatments = 1;
            targetProducts = 3;
        } else if (ceil <= 150) {
            legacyTierName = "TIER 2: Mid Budget";
            targetTreatments = 2;
            targetProducts = 4;
        } else {
            legacyTierName = "TIER 3: High Budget";
            targetTreatments = 3;
            targetProducts = 5;
        }

        // console.log(`💰 AI.DOC BUDGET ANALYSIS: ${legacyTierName} ($${ceil})`);
        // console.log(`🎯 TARGET: ${targetTreatments} treatments, ${targetProducts} total products`);

        const needsMoreTreatments = treatmentCount < targetTreatments;
        const lowBudgetUtilization = budgetUtilization < 60;

        const shouldAddTreatments = (total < floor) ||
            (treatmentCount === 0 && userHasConcerns && total < ceil) ||
            (needsMoreTreatments && userHasConcerns && total < ceil) ||
            (lowBudgetUtilization && userHasConcerns && needsMoreTreatments);

        // console.log(`🔍 BUDGET DEBUG: Total=$${total}, Floor=$${floor}, Ceil=$${ceil}, TreatmentCount=${treatmentCount}, HasConcerns=${userHasConcerns}`);
        // console.log(`📊 Budget Utilization: ${budgetUtilization.toFixed(1)}%, Low Utilization: ${lowBudgetUtilization}, Needs More: ${needsMoreTreatments}`);
        // console.log(`🎯 SHOULD ADD TREATMENTS: ${shouldAddTreatments}`);

        if (shouldAddTreatments) {
            if (treatmentCount === 0) {
                // console.log(`Adding treatments for user with ${aiQuiz.concerns.primary.concat(aiQuiz.concerns.secondary).join(', ')} concerns`);
            }

            const inSel = new Set(selection.map(p => p.productId));
            const candidatesTreats = ProductCategorizer.bucketByCategory(candidatePool).treats
                .filter(t => !inSel.has(t.productId));

            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
            const concernPriority: Record<string, number> = {
                'fine lines': 5,
                'aging': 5,
                'anti-aging': 5,
                'wrinkles': 5,
                'hyperpigmentation': 4,
                'dark circles': 4,
                'dark spots': 4,
                'acne': 4,
                'active acne': 4,
                'texture': 3,
                'dullness': 3,
                'dryness': 3,
                'redness': 3,
                'large pores': 2,
                'oiliness': 2
            };

            // Enhanced ingredient-based scoring for specific concerns
            const getIngredientBonus = (product: Product, concerns: string[]): number => {
                const actives = ProductUtils.extractActives(product);
                const ingredientText = (product.ingredientList?.plain_text || '').toLowerCase();
                const primaryActives = (product.primaryActiveIngredients || []).map((i: any) => i.name?.toLowerCase() || i.toString().toLowerCase());
                const allIngredients = [...actives, ...primaryActives, ingredientText].join(' ').toLowerCase();

                let bonus = 0;

                for (const concern of concerns) {
                    const concernLower = concern.toLowerCase();

                    // Acne concerns - prioritize salicylic acid, niacinamide
                    if (concernLower.includes('acne') || concernLower.includes('texture')) {
                        if (allIngredients.includes('salicylic') || allIngredients.includes('bha')) bonus += 3;
                        if (allIngredients.includes('niacinamide')) bonus += 2;
                    }

                    // Anti-aging concerns - prioritize retinol, peptides
                    if (concernLower.includes('aging') || concernLower.includes('fine lines') || concernLower.includes('wrinkles')) {
                        if (allIngredients.includes('retinol') || allIngredients.includes('retinoid')) bonus += 4;
                        if (allIngredients.includes('peptide')) bonus += 3;
                        if (allIngredients.includes('glycolic') || allIngredients.includes('aha')) bonus += 2;
                    }

                    // Hyperpigmentation - prioritize vitamin C, niacinamide
                    if (concernLower.includes('pigment') || concernLower.includes('dark')) {
                        if (allIngredients.includes('vitamin c') || allIngredients.includes('ascorbic')) bonus += 3;
                        if (allIngredients.includes('niacinamide')) bonus += 2;
                    }

                    // Dryness - prioritize hyaluronic acid, ceramides
                    if (concernLower.includes('dry') || concernLower.includes('hydrat')) {
                        if (allIngredients.includes('hyaluronic')) bonus += 3;
                        if (allIngredients.includes('ceramide')) bonus += 2;
                    }
                }

                return bonus;
            };

            // AI.DOC RULE R6: Prioritize NON-exfoliating treatments for high budget users
            const hasExfoliatingCleanser = selection.some(p => {
                const steps = ProductUtils.productSteps(p);
                return steps.includes("cleanse") && ValidationUtils.isExfoliating(p);
            });

            const currentExfoliatingTreatments = selection.filter(p => {
                const steps = ProductUtils.productSteps(p);
                return steps.some(s => s.includes("treat")) && ValidationUtils.isExfoliating(p);
            }).length;

            // console.log(`🧪 EXFOLIATION STATUS: Cleanser=${hasExfoliatingCleanser}, Treatments=${currentExfoliatingTreatments}`);

            const ranked = candidatesTreats
                .map(t => {
                    const baseScore = ConcernScorer.scoreForConcerns(t, aiQuiz);
                    let priorityBoost = 0;

                    for (const concern of userConcerns) {
                        const concernKey = concern.toLowerCase();
                        if (concernPriority[concernKey]) {
                            priorityBoost += concernPriority[concernKey];
                        }
                    }

                    const ingredientBonus = getIngredientBonus(t, userConcerns);

                    // AI.DOC RULE R6: Boost non-exfoliating treatments for compliance
                    let exfoliationPenalty = 0;
                    const isExfoliating = ValidationUtils.isExfoliating(t);

                    if (isExfoliating) {
                        if (hasExfoliatingCleanser) {
                            exfoliationPenalty = -100; // Block completely if cleanser is exfoliating
                        } else if (currentExfoliatingTreatments >= 1) {
                            exfoliationPenalty = -50; // Heavy penalty if already have exfoliating treatment
                        }
                    } else {
                        // Boost non-exfoliating treatments for high budget users
                        if (ceil >= 150) {
                            priorityBoost += 10; // High budget prefers multiple non-exfoliating treatments
                        }
                    }

                    const finalScore = baseScore + priorityBoost + ingredientBonus + exfoliationPenalty;

                    // console.log(`Treatment scoring: ${t.productName} -> Base: ${baseScore}, Priority: ${priorityBoost}, Ingredient: ${ingredientBonus}, Exfoliation: ${exfoliationPenalty}, Final: ${finalScore}`);

                    return { t, s: finalScore };
                })
                .filter(item => item.s > -50) // Remove heavily penalized items
                .sort((a, b) => b.s - a.s)
                .map(x => x.t);

            let addedAny = false;
            let skippedDueToConflicts = 0;
            let treatmentsAdded = 0;

            // console.log(`🔄 PROCESSING ${ranked.length} RANKED TREATMENTS:`);

            for (const cand of ranked) {
                // console.log(`🧪 Checking treatment: ${cand.productName}`);

                if (!ValidationUtils.respectsExfoliationWith(selection, cand)) {
                    // console.log(`   ❌ Failed exfoliation validation`);
                    continue;
                }

                const hasConflict = selection.some(existing => ConflictDetector.conflicts(cand, existing));
                if (hasConflict) {
                    // console.log(`   ❌ Has conflict with existing products`);
                    skippedDueToConflicts++;
                    continue;
                }

                const newTotal = ProductUtils.totalCost([...selection, cand]);
                // console.log(`   💰 New total would be: $${newTotal} (Limit: $${ceil})`);

                if (newTotal <= ceil) {
                    selection.push(cand);
                    total = newTotal;
                    addedAny = true;
                    treatmentsAdded++;

                    // console.log(`Added treatment: ${cand.productName} | Total: $${total} | Treatments: ${treatmentsAdded}`);

                    // AI.DOC Budget Tier Logic - Stop based on target treatments per tier
                    const budgetUtilization = (total / ceil) * 100;
                    const hasMinTreatments = treatmentsAdded >= 1;
                    const reachedTargetTreatments = treatmentsAdded >= targetTreatments;
                    const reachedBudgetThreshold = budgetUtilization >= 85; // Higher threshold for better budget use
                    const maxTreatmentsReached = treatmentsAdded >= 3; // Hard cap

                    // console.log(`🎯 TREATMENT PROGRESS: ${treatmentsAdded}/${targetTreatments} (Tier ${budgetTier}), Budget: ${budgetUtilization.toFixed(1)}%`);

                    if (hasMinTreatments && (reachedTargetTreatments || reachedBudgetThreshold || maxTreatmentsReached)) {
                        // console.log(`✅ Stopping treatment addition: Target: ${reachedTargetTreatments}, Budget: ${reachedBudgetThreshold}, Max: ${maxTreatmentsReached}`);
                        break;
                    }
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
