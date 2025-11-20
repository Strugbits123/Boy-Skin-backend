/**
 * Product Recommendation Filter
 * 
 * Flow: All Products → Safety Filtering → Essentials Selection (3-phase logic) → Treatments (3-phase logic) → Budget Optimization
 * 
 * Key Features:
 * - 3-Phase Selection Logic for Cleanser, Moisturizer, SPF, and Treatments
 *   Phase 1: Match ALL (primaryActiveIngredients, function, format, skinConcern, strengthRating, skinType)
 *   Phase 2: Match skinConcern + function only
 *   Phase 3: Match function + skinConcern only
 * 
 * - Budget Management: 20% budget utilization for treatments, essentials can use full budget
 * - Exfoliation Safety: Only one exfoliating product per routine
 * - Step Caps: Max 1 cleanser, 1 moisturizer, 1 SPF (combo products prioritized)
 * - Edge Case Handling: User-friendly notes for phase changes, budget issues, and product availability
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
        // console.log(`🚀 Starting clean filter with ${allProducts.length} total products`);

        this.clearUserNotes();
        const cleanProducts = allProducts.filter(p => !ProductUtils.hasNonCompatibleConflict(p));
        // console.log(`Length of clean products: ${cleanProducts.length} | Actual products: ${allProducts.length}`);
        const allSafetyProducts = cleanProducts.filter(p => !ValidationUtils.violatesSafety(p, aiQuiz));
        // console.log(`Length of safety products: ${allSafetyProducts.length} | Clean products: ${cleanProducts.length}`);
        let allSafeProducts = allSafetyProducts.filter(p => ValidationUtils.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));
        // console.log(`Length of strength products: ${allSafeProducts.length} | Safety products: ${allSafetyProducts.length}`);
        allSafeProducts = allSafeProducts.filter(p => ProductUtils.productHasSkinType(p, aiQuiz.skinAssessment.skinType));
        // console.log(`Length of skin type products: ${allSafeProducts.length} | Safe products: ${allSafeProducts.length}`);
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            allSafeProducts = allSafeProducts.filter(p => ProductUtils.isSensitiveSafe(p));
            // console.log(`Length of sensitive products: ${allSafeProducts.length} | Safe products: ${allSafeProducts.length}`);
        }
        // console.log(`======================================================================================`);
        // console.log(`Length of all safe products: ${allSafeProducts.length}`);
        const allEssentialsProducts = allSafeProducts.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") ||
                steps.includes("moisturize") ||
                steps.includes("protect");
        });
        // console.log(`Length of essentials products: ${allEssentialsProducts.length} | Safe products: ${allSafeProducts.length}`);
        // console.log(`======================================================================================`);

        // const spfProducts = allEssentialsProducts.filter(p => {
        //     const steps = ProductUtils.productSteps(p);
        //     return steps.includes("protect");
        // });
        // console.log(`All SPF Products (${spfProducts.length}):`);
        // spfProducts.forEach(p => {
        //     console.log(`   - ${p.productName} (ID: ${p.productId})`);
        // });

        // const cleanserProducts = allEssentialsProducts.filter(p => {
        //     const steps = ProductUtils.productSteps(p);
        //     return steps.includes("cleanse");
        // });
        // console.log(`All Cleanser Products (${cleanserProducts.length}):`);
        // cleanserProducts.forEach(p => {
        //     console.log(`   - ${p.productName} (ID: ${p.productId})`);
        // });

        // const moisturizerProducts = allEssentialsProducts.filter(p => {
        //     const steps = ProductUtils.productSteps(p);
        //     return steps.includes("moisturize");
        // });
        // console.log(`All Moisturizer Products (${moisturizerProducts.length}):`);
        // moisturizerProducts.forEach(p => {
        //     console.log(`   - ${p.productName} (ID: ${p.productId})`);
        // });

        // console.log(`======================================================================================\N`);
        // const allTreatmentsProducts = allSafeProducts.filter(p => {
        //     const steps = ProductUtils.productSteps(p);
        //     const isEssential = steps.includes("cleanse") ||
        //         steps.includes("moisturize") ||
        //         steps.includes("protect");
        //     return !isEssential && steps.includes("treat");
        // });
        // console.log(`All Treatments Products (${allTreatmentsProducts.length}):`);
        // allTreatmentsProducts.forEach(p => {
        //     console.log(`   - ${p.productName} (ID: ${p.productId})`);
        // });
        // console.log(`======================================================================================\n`);

        // Step 1: Select essentials using 3-phase logic
        const selectedEssentials = this.selectEssentials(aiQuiz, allEssentialsProducts);

        // console.log(`======================================================================================`);
        // console.log(`Selected Essentials Names & IDs: ${selectedEssentials.length}(${selectedEssentials.map(p => `${p.productName} (ID: ${p.productId})`).join(', ')})`);
        // console.log(`======================================================================================\n`);

        // Step 2: Add treatments with budget and exfoliation safety
        const withTreatments = this.addTreatments(aiQuiz, allSafeProducts, selectedEssentials);
        // console.log(`======================================================================================`);
        // console.log(`With Treatments Names & IDs: ${withTreatments.length}(${withTreatments.map(p => `${p.productName} (ID: ${p.productId})`).join(', ')})`);
        // console.log(`======================================================================================\n`);

        // Step 3: Final exfoliation safety check
        const exfoliationSafe = this.enforceExfoliationSafety(withTreatments);
        // console.log(`======================================================================================`);
        // console.log(`Exfoliation Safe Names & IDs: ${exfoliationSafe.length}(${exfoliationSafe.map(p => `${p.productName} (ID: ${p.productId})`).join(', ')})`);
        // console.log(`======================================================================================\n`);

        // Step 4: Budget optimization (20% cap)
        const finalRoutine = this.optimizeBudget(aiQuiz, exfoliationSafe);
        // console.log(`======================================================================================`);
        // console.log(`Final Routine Names & IDs: ${finalRoutine.length}(${finalRoutine.map(p => `${p.productName} (ID: ${p.productId})`).join(', ')})`);
        // console.log(`======================================================================================\n`);


        await Promise.resolve(setTimeout(() => { }, 3000));
        return finalRoutine;
    }

    private static selectEssentials(aiQuiz: AICompatibleQuizModel, safeProducts: Product[]): Product[] {
        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const essentials: Product[] = [];

        // Get budget tier
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const budgetTier = BudgetManager.getBudgetTier(ceil);
        const essentialCaps = BudgetManager.getEssentialCaps(ceil);

        // Step 1: Select cleanser
        const bestCleanser = this.selectCleanser(buckets.cleansers, aiQuiz, essentialCaps.cleanser);
        if (bestCleanser) {
            essentials.push(bestCleanser);
        }

        // 🎯 CLIENT REQUIREMENT: Budget ≥$80 → ALWAYS prioritize separate SPF/Moisturizer
        // Separate products are better for skincare efficacy
        const shouldPrioritizeSeparate = ceil >= 80;

        if (shouldPrioritizeSeparate) {
            // High budget: ALWAYS prefer separate moisturizer + SPF
            // Step 2: Select separate moisturizer
            const bestMoisturizer = this.selectMoisturizer(buckets.moisturizers, aiQuiz, essentialCaps.moisturizer);
            if (bestMoisturizer) {
                essentials.push(bestMoisturizer);
            }

            // Step 3: Select separate SPF
            const bestSPF = this.selectSPF(buckets.protects, aiQuiz, essentialCaps.protect);
            if (bestSPF) {
                essentials.push(bestSPF);
            }

            // Fallback: Only if separate products not available, try combo
            if (!bestMoisturizer || !bestSPF) {
                const comboProducts = safeProducts.filter(p => {
                    const steps = ProductUtils.productSteps(p);
                    return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(p);
                });
                const bestCombo = this.selectMoisturizer(comboProducts, aiQuiz, essentialCaps.combo);
                if (bestCombo && essentials.length < 3) {
                    // Remove any partial moisturizer/SPF and add combo
                    const filtered = essentials.filter(p => {
                        const steps = ProductUtils.productSteps(p);
                        return !steps.includes("moisturize") && !steps.includes("protect");
                    });
                    filtered.push(bestCombo);
                    return filtered;
                }
            }
        } else {
            // Low budget (<$80): Prefer combo moisturizer-SPF for cost efficiency
            const comboProducts = safeProducts.filter(p => {
                const steps = ProductUtils.productSteps(p);
                return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(p);
            });
            const bestCombo = this.selectMoisturizer(comboProducts, aiQuiz, essentialCaps.combo);
            if (bestCombo) {
                essentials.push(bestCombo);
                return essentials; // Combo found, no need for separate SPF
            }

            // Fallback: If combo not found, use separate
            const bestMoisturizer = this.selectMoisturizer(buckets.moisturizers, aiQuiz, essentialCaps.moisturizer);
            if (bestMoisturizer) {
                essentials.push(bestMoisturizer);
            }

            const bestSPF = this.selectSPF(buckets.protects, aiQuiz, essentialCaps.protect);
            if (bestSPF) {
                essentials.push(bestSPF);
            }
        }

        return essentials;
    }

    private static selectCleanser(candidates: Product[], aiQuiz: AICompatibleQuizModel, priceCap?: number): Product | null {
        if (candidates.length === 0) {
            // console.log(`🚨 CRITICAL: No cleanser candidates available!`);
            return null;
        }

        const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
        const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();

        // PHASE 1: Match ALL conditions (primaryActiveIngredients, function, format, skinConcern)
        const phase1Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("cleanse")) return false;

            // Check skin type match
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check primary active ingredients exist
            const hasPrimaryActives = (p.primaryActiveIngredients || []).length > 0;
            if (!hasPrimaryActives) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check format exists
            const hasFormat = p.format && p.format.name;
            if (!hasFormat) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase1Matches.length > 0) {
            const scored = phase1Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "cleanser");
            if (picked) {
                // console.log(`✅ Cleanser Phase 1: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 2: Match skinConcern + function only (Phase 1 didn't find perfect match)
        const phase2Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("cleanse")) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase2Matches.length > 0) {
            this.addUserNote("We've selected a cleanser that matches your skin concerns and works well for your skin type.");
            const scored = phase2Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "cleanser");
            if (picked) {
                // console.log(`✅ Cleanser Phase 2: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 3: Match skinConcern only (Phase 1 & 2 didn't find matches)
        let phase3NoteAdded = false;
        const phase3Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("cleanse")) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase3Matches.length > 0) {
            if (!phase3NoteAdded) {
                this.addUserNote("We've selected a cleanser that addresses your skin concerns and is suitable for your skin type.");
                phase3NoteAdded = true;
            }
            const scored = phase3Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "cleanser");
            if (picked) {
                // console.log(`✅ Cleanser Phase 3: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // Fallback: No phase matches - select best available
        const fallback = this.selectBestProduct(candidates, aiQuiz, "cleanser", true, priceCap);
        if (!fallback) {
            this.addUserNote("We couldn't find a cleanser that perfectly matches all your criteria, but we've selected the best available option for your skin type.");
        } else {
            this.addUserNote("We've selected a cleanser that works well for your skin type, though it may not match all your specific concerns perfectly.");
        }
        return fallback;
    }

    private static selectMoisturizer(candidates: Product[], aiQuiz: AICompatibleQuizModel, priceCap?: number): Product | null {
        if (candidates.length === 0) {
            // console.log(`🚨 CRITICAL: No moisturizer candidates available!`);
            return null;
        }

        const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
        const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();

        // PHASE 1: Match ALL conditions (primaryActiveIngredients, function, format, skinConcern)
        const phase1Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("moisturize")) return false;

            // Check skin type match
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check primary active ingredients exist
            const hasPrimaryActives = (p.primaryActiveIngredients || []).length > 0;
            if (!hasPrimaryActives) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check format exists
            const hasFormat = p.format && p.format.name;
            if (!hasFormat) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase1Matches.length > 0) {
            const scored = phase1Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "moisturizer");
            if (picked) {
                // console.log(`✅ Moisturizer Phase 1: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 2: Match skinConcern + function only (Phase 1 didn't find perfect match)
        let phase2NoteAdded = false;
        const phase2Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("moisturize")) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase2Matches.length > 0) {
            if (!phase2NoteAdded) {
                this.addUserNote("We've selected a moisturizer that matches your skin concerns and works well for your skin type.");
                phase2NoteAdded = true;
            }
            const scored = phase2Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "moisturizer");
            if (picked) {
                // console.log(`✅ Moisturizer Phase 2: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 3: Match skinConcern only (Phase 1 & 2 didn't find matches)
        let phase3NoteAdded = false;
        const phase3Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.includes("moisturize")) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase3Matches.length > 0) {
            if (!phase3NoteAdded) {
                this.addUserNote("We've selected a moisturizer that addresses your skin concerns and is suitable for your skin type.");
                phase3NoteAdded = true;
            }
            const scored = phase3Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "moisturizer");
            if (picked) {
                // console.log(`✅ Moisturizer Phase 3: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // Fallback: No phase matches - select best available
        const fallback = this.selectBestProduct(candidates, aiQuiz, "moisturizer", true, priceCap);
        if (!fallback) {
            this.addUserNote("We couldn't find a moisturizer that perfectly matches all your criteria, but we've selected the best available option for your skin type.");
        } else {
            this.addUserNote("We've selected a moisturizer that works well for your skin type, though it may not match all your specific concerns perfectly.");
        }
        return fallback;
    }

    private static selectSPF(candidates: Product[], aiQuiz: AICompatibleQuizModel, priceCap?: number): Product | null {
        if (candidates.length === 0) {
            // console.log(`🚨 CRITICAL: No SPF candidates available!`);
            return null;
        }

        // Filter only standalone SPF (not combo with moisturizer)
        const standaloneSPF = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect") && !steps.includes("moisturize") && SPFUtils.passesSpfQuality(p);
        });

        if (standaloneSPF.length === 0) {
            // console.log(`⚠️ No standalone SPF available`);
            return null;
        }

        const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
        const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();

        // PHASE 1: Match ALL conditions (primaryActiveIngredients, function, format, skinConcern)
        const phase1Matches = standaloneSPF.filter(p => {
            // Check skin type match
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check primary active ingredients exist
            const hasPrimaryActives = (p.primaryActiveIngredients || []).length > 0;
            if (!hasPrimaryActives) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check format exists
            const hasFormat = p.format && p.format.name;
            if (!hasFormat) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase1Matches.length > 0) {
            const scored = phase1Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "sunscreen");
            if (picked) {
                // console.log(`✅ SPF Phase 1: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 2: Match skinConcern + function only (Phase 1 didn't find perfect match)
        let phase2NoteAdded = false;
        const phase2Matches = standaloneSPF.filter(p => {
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase2Matches.length > 0) {
            if (!phase2NoteAdded) {
                this.addUserNote("We've selected a sunscreen that matches your skin concerns and provides excellent protection for your skin type.");
                phase2NoteAdded = true;
            }
            const scored = phase2Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "sunscreen");
            if (picked) {
                // console.log(`✅ SPF Phase 2: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // PHASE 3: Match skinConcern only (Phase 1 & 2 didn't find matches)
        let phase3NoteAdded = false;
        const phase3Matches = standaloneSPF.filter(p => {
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check skinConcern matches user concerns
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );
            if (!concernMatch) return false;

            return true;
        });

        if (phase3Matches.length > 0) {
            if (!phase3NoteAdded) {
                this.addUserNote("We've selected a sunscreen that addresses your skin concerns and provides excellent protection for your skin type.");
                phase3NoteAdded = true;
            }
            const scored = phase3Matches
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, "sunscreen");
            if (picked) {
                // console.log(`✅ SPF Phase 3: Selected - ${picked.productName}`);
                return picked;
            }
        }

        // Fallback: No phase matches - select best available
        const fallback = this.selectBestProduct(standaloneSPF, aiQuiz, "SPF", true, priceCap);
        if (!fallback) {
            this.addUserNote("We couldn't find a sunscreen that perfectly matches all your criteria, but we've selected the best available option for your skin type.");
        } else {
            this.addUserNote("We've selected a sunscreen that works well for your skin type, though it may not match all your specific concerns perfectly.");
        }
        return fallback;
    }

    private static selectTreatment(candidates: Product[], aiQuiz: AICompatibleQuizModel, existingProducts: Product[]): Product | null {
        if (candidates.length === 0) {
            return null;
        }

        const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
        const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();
        const primaryConcernsCount = aiQuiz.concerns.primary.length;

        // Helper: Count how many user concerns match product concerns
        const countConcernMatches = (p: Product): number => {
            const productConcerns = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            let matches = 0;
            for (const uc of userConcerns) {
                if (productConcerns.some(pc => {
                    // Handle variations: "fine lines" matches "wrinkles", "dark circles" matches "dark circles"
                    if (uc.includes("fine line") && (pc.includes("wrinkle") || pc.includes("fine line"))) return true;
                    if (uc.includes("dark circle") && pc.includes("dark circle")) return true;
                    if (uc.includes("dry") && pc.includes("dry")) return true;
                    return pc.includes(uc) || uc.includes(pc);
                })) {
                    matches++;
                }
            }
            return matches;
        };

        // PHASE 1: Match ALL conditions + STRICT concern matching
        const phase1Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.some(s => s.includes("treat"))) return false;

            // Check skin type match
            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check primary active ingredients exist
            const hasPrimaryActives = (p.primaryActiveIngredients || []).length > 0;
            if (!hasPrimaryActives) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // Check format exists
            const hasFormat = p.format && p.format.name;
            if (!hasFormat) return false;

            // Check strengthRating exists
            const hasStrengthRating = (p.strengthRatingOfActives || []).length > 0;
            if (!hasStrengthRating) return false;

            // 🎯 CLIENT REQUIREMENT: Minimum relevance threshold check
            // Products must have ≥2.0 points from active ingredient relevance
            const relevanceScore = ConcernScorer.calculateConcernRelevanceScore(p, aiQuiz);
            if (relevanceScore < 2.0) return false;

            // STRICT: Check skinConcern matches - must match at least 2 concerns OR be best product
            const concernMatches = countConcernMatches(p);
            const isBestProduct = DbService.isBestProductForUser(p, aiQuiz);

            // Require at least 2 concern matches OR be a best product
            if (concernMatches < 2 && !isBestProduct) return false;

            return true;
        });

        if (phase1Matches.length > 0) {
            // Score and prioritize best products
            const scored = phase1Matches
                .map(p => {
                    const baseScore = ConcernScorer.scoreForTreatmentOnly(p, aiQuiz);
                    const concernMatches = countConcernMatches(p);
                    const isBestProduct = DbService.isBestProductForUser(p, aiQuiz);

                    // Boost score for multiple concern matches and best products
                    let bonus = 0;
                    if (concernMatches >= 2) bonus += 10; // Multiple concerns matched
                    if (concernMatches >= primaryConcernsCount) bonus += 20; // All primary concerns matched
                    if (isBestProduct) bonus += 15; // Best product bonus

                    return {
                        product: p,
                        score: baseScore + bonus,
                        concernMatches,
                        isBestProduct
                    };
                })
                .sort((a, b) => {
                    // First sort by best product status
                    if (a.isBestProduct && !b.isBestProduct) return -1;
                    if (!a.isBestProduct && b.isBestProduct) return 1;
                    // Then by concern matches
                    if (a.concernMatches !== b.concernMatches) return b.concernMatches - a.concernMatches;
                    // Finally by score
                    return b.score - a.score;
                });

            if (scored.length > 0 && scored[0]) {
                // console.log(`✅ Treatment Phase 1: Selected - ${scored[0].product.productName} (Concerns: ${scored[0].concernMatches}, Best: ${scored[0].isBestProduct})`);
                return scored[0].product;
            }
        }

        // PHASE 2: Match skinConcern + function only (Phase 1 didn't find perfect match)
        let phase2NoteAdded = false;
        const phase2Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.some(s => s.includes("treat"))) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // 🎯 CLIENT REQUIREMENT: Minimum relevance threshold check
            const relevanceScore = ConcernScorer.calculateConcernRelevanceScore(p, aiQuiz);
            if (relevanceScore < 2.0) return false;

            // Check skinConcern matches user concerns (at least 1 match)
            const concernMatches = countConcernMatches(p);
            if (concernMatches < 1) return false;

            return true;
        });

        if (phase2Matches.length > 0) {
            const scored = phase2Matches
                .map(p => {
                    const baseScore = ConcernScorer.scoreForTreatmentOnly(p, aiQuiz);
                    const concernMatches = countConcernMatches(p);
                    const isBestProduct = DbService.isBestProductForUser(p, aiQuiz);

                    let bonus = 0;
                    if (concernMatches >= 2) bonus += 10;
                    if (isBestProduct) bonus += 15;

                    return {
                        product: p,
                        score: baseScore + bonus,
                        concernMatches,
                        isBestProduct
                    };
                })
                .sort((a, b) => {
                    if (a.isBestProduct && !b.isBestProduct) return -1;
                    if (!a.isBestProduct && b.isBestProduct) return 1;
                    if (a.concernMatches !== b.concernMatches) return b.concernMatches - a.concernMatches;
                    return b.score - a.score;
                });

            if (scored.length > 0 && scored[0]) {
                if (!phase2NoteAdded) {
                    this.addUserNote("We've selected a treatment that matches your skin concerns and works well for your skin type.");
                    phase2NoteAdded = true;
                }
                // console.log(`✅ Treatment Phase 2: Selected - ${scored[0].product.productName} (Concerns: ${scored[0].concernMatches}, Best: ${scored[0].isBestProduct})`);
                return scored[0].product;
            }
        }

        // PHASE 3: Match function + skinConcern only (Phase 1 & 2 didn't find matches)
        let phase3NoteAdded = false;
        const phase3Matches = candidates.filter(p => {
            const steps = ProductUtils.productSteps(p);
            if (!steps.some(s => s.includes("treat"))) return false;

            const productSkinTypes = (p.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));
            if (!skinTypeMatch) return false;

            // Check function exists
            const hasFunction = (p.function || []).length > 0;
            if (!hasFunction) return false;

            // 🎯 CLIENT REQUIREMENT: Minimum relevance threshold check
            const relevanceScore = ConcernScorer.calculateConcernRelevanceScore(p, aiQuiz);
            if (relevanceScore < 2.0) return false;

            // Check skinConcern matches user concerns (at least 1 match)
            const concernMatches = countConcernMatches(p);
            if (concernMatches < 1) return false;

            return true;
        });

        if (phase3Matches.length > 0) {
            const scored = phase3Matches
                .map(p => {
                    const baseScore = ConcernScorer.scoreForTreatmentOnly(p, aiQuiz);
                    const concernMatches = countConcernMatches(p);
                    const isBestProduct = DbService.isBestProductForUser(p, aiQuiz);

                    let bonus = 0;
                    if (concernMatches >= 1) bonus += 5;
                    if (isBestProduct) bonus += 10;

                    return {
                        product: p,
                        score: baseScore + bonus,
                        concernMatches,
                        isBestProduct
                    };
                })
                .sort((a, b) => {
                    if (a.isBestProduct && !b.isBestProduct) return -1;
                    if (!a.isBestProduct && b.isBestProduct) return 1;
                    if (a.concernMatches !== b.concernMatches) return b.concernMatches - a.concernMatches;
                    return b.score - a.score;
                });

            if (scored.length > 0 && scored[0]) {
                if (!phase3NoteAdded) {
                    this.addUserNote("We've selected a treatment that addresses your skin concerns and is suitable for your skin type.");
                    phase3NoteAdded = true;
                }
                // console.log(`✅ Treatment Phase 3: Selected - ${scored[0].product.productName} (Concerns: ${scored[0].concernMatches}, Best: ${scored[0].isBestProduct})`);
                return scored[0].product;
            }
        }

        // Fallback: No phase matches - select best available
        const fallback = this.selectBestProduct(candidates, aiQuiz, "treatment", false, undefined);
        if (!fallback) {
            this.addUserNote("We couldn't find a treatment product that perfectly matches all your criteria. We've prioritized safety and compatibility over adding more products.");
        } else {
            this.addUserNote("We've selected a treatment that works well for your skin type, though it may not match all your specific concerns perfectly.");
        }
        return fallback;
    }

    private static addTreatments(aiQuiz: AICompatibleQuizModel, safeProducts: Product[], essentials: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        // User requirement: Treatments should add up to 20% of total budget
        const targetBudgetForTreatments = ceil * 0.20;
        const routineTime = aiQuiz.preferences.timeCommitment;

        const getTargetCount = (time: string): number => {
            if (time === "5_minute") return 3;
            if (time === "10_minute") return 4;
            if (time === "15+_minute") return 5;
            return 4;
        };

        const targetCount = getTargetCount(routineTime);
        const essentialsCost = ProductUtils.totalCost(essentials);

        // console.log(`\nADD TREATMENTS DEBUG:`);
        // console.log(`Full Budget: $${ceil}, Target for Treatments (20%): $${targetBudgetForTreatments.toFixed(2)}`);
        // console.log(`Essentials Cost: $${essentialsCost.toFixed(2)}`);
        // console.log(`Target Count: ${targetCount}, Current Count: ${essentials.length}`);

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
            // console.log(`CRITICAL: Essentials incomplete! Cleanser = ${hasCleanser}, Moisturizer = ${hasMoisturizer}, SPF = ${hasSPF}`);
            this.addMissingEssentialNotes(hasCleanser, hasMoisturizer, hasSPF, aiQuiz);
            return essentials;
        }

        if (essentials.length >= targetCount) {
            // console.log(`Already reached target count (${essentials.length} >= ${targetCount})`);
            return essentials;
        }

        // No budget cap for essentials - they can use whatever they need
        // But total cost (essentials + treatments) must not exceed full budget

        const buckets = ProductCategorizer.bucketByCategory(safeProducts);
        const existingIds = new Set(essentials.map(p => p.productId));

        let availableTreatments = buckets.treats.filter(t => !existingIds.has(t.productId));
        // console.log(`Available Treatments: ${availableTreatments.length}`);

        // Check if cleanser is exfoliating
        const cleanserIsExfoliating = essentials.some(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && ValidationUtils.isExfoliating(p);
        });
        // console.log(`Cleanser is exfoliating: ${cleanserIsExfoliating}`);

        let treatmentsCost = 0;
        const results = [...essentials];
        let attempts = 0;
        const maxAttempts = availableTreatments.length;
        let currentPhase = 1;
        let phaseChanged = false;

        // Add treatments up to 20% of budget, but ensure total doesn't exceed full budget
        while (results.length < targetCount && availableTreatments.length > 0 && attempts < maxAttempts) {
            attempts++;

            // Filter out products that violate safety rules
            let filteredTreatments = availableTreatments.filter(t => {
                const treatmentSteps = ProductUtils.productSteps(t);
                const isPrimaryEssential =
                    treatmentSteps.includes("cleanse") ||
                    treatmentSteps.includes("moisturize") ||
                    treatmentSteps.includes("protect");

                if (isPrimaryEssential) return false;

                // AI.DOC Rule R6: Exfoliation Safety Check
                if (!ValidationUtils.respectsExfoliationWith(results, t)) return false;

                // If cleanser is exfoliating, block all exfoliating treatments
                if (cleanserIsExfoliating && ValidationUtils.isExfoliating(t)) return false;

                return true;
            });

            if (filteredTreatments.length === 0) {
                // console.log(`No more safe treatments available`);
                if (!phaseChanged) {
                    phaseChanged = true;
                    this.addUserNote("We've carefully selected treatments that work safely with your routine. Some products couldn't be added due to ingredient compatibility and safety considerations.");
                }
                break;
            }

            const nextTreatment = this.selectTreatment(filteredTreatments, aiQuiz, results);

            if (!nextTreatment) {
                // console.log(`No more treatments available from selectTreatment`);
                if (!phaseChanged) {
                    phaseChanged = true;
                    this.addUserNote("We've prioritized finding the best treatments for your specific skin concerns. Some products weren't included to ensure optimal compatibility and effectiveness.");
                }
                break;
            }

            const treatmentPrice = nextTreatment.price || 0;
            const isBestProduct = DbService.isBestProductForUser(nextTreatment, aiQuiz);

            // Count concern matches for this treatment
            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
            const productConcerns = (nextTreatment.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            let concernMatches = 0;
            for (const uc of userConcerns) {
                if (productConcerns.some(pc => {
                    if (uc.includes("fine line") && (pc.includes("wrinkle") || pc.includes("fine line"))) return true;
                    if (uc.includes("dark circle") && pc.includes("dark circle")) return true;
                    if (uc.includes("dry") && pc.includes("dry")) return true;
                    return pc.includes(uc) || uc.includes(pc);
                })) {
                    concernMatches++;
                }
            }

            // Check: treatments should not exceed 20% of budget AND total should not exceed full budget
            const newTreatmentsCost = treatmentsCost + treatmentPrice;
            const newTotalCost = essentialsCost + newTreatmentsCost;

            // ✅ CLIENT CONCERN #2: RELEVANCE CHECK - Skip products with score < 2.0
            const relevanceScore = ConcernScorer.calculateConcernRelevanceScore(nextTreatment, aiQuiz);
            if (relevanceScore < 2.0) {
                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                continue; // Skip this irrelevant treatment
            }

            // If it's a best product OR matches 2+ concerns but exceeds 20% cap, still add it with a note
            const isHighQualityMatch = isBestProduct || concernMatches >= 2;

            // Check if we've already exceeded 20% cap with high quality products
            const alreadyExceededCap = treatmentsCost > targetBudgetForTreatments;

            // Check if we can add this treatment
            if (newTotalCost > ceil) {
                // Cannot exceed full budget - stop adding treatments
                // console.log(`Budget limit: Cannot add ${nextTreatment.productName} - total would exceed full budget ($${newTotalCost.toFixed(2)} > $${ceil})`);
                break;
            } else if (isHighQualityMatch && newTreatmentsCost > targetBudgetForTreatments) {
                // High quality match - add even if exceeds 20% cap (as long as within full budget)
                results.push(nextTreatment);
                treatmentsCost = newTreatmentsCost;
                // console.log(`Added HIGH QUALITY treatment (exceeds 20% cap): ${nextTreatment.productName} ($${treatmentPrice}) - Concerns: ${concernMatches}, Best: ${isBestProduct} - Treatments: $${treatmentsCost.toFixed(2)}/${targetBudgetForTreatments.toFixed(2)}, Total: $${newTotalCost.toFixed(2)}/${ceil}`);

                if (!phaseChanged) {
                    phaseChanged = true;
                    this.addUserNote("We've included premium treatment products that are specifically formulated for your skin concerns. While they use slightly more of your budget, they provide superior results for your needs.");
                }

                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                // Continue loop to try adding more treatments
            } else if (newTreatmentsCost <= targetBudgetForTreatments) {
                // Regular treatment within 20% cap - add it
                results.push(nextTreatment);
                treatmentsCost = newTreatmentsCost;
                // console.log(`Added treatment: ${nextTreatment.productName} ($${treatmentPrice}) - Concerns: ${concernMatches}, Best: ${isBestProduct} - Treatments: $${treatmentsCost.toFixed(2)}/${targetBudgetForTreatments.toFixed(2)}, Total: $${newTotalCost.toFixed(2)}/${ceil}`);

                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                // Continue loop to try adding more treatments
            } else if (alreadyExceededCap) {
                // We've already exceeded 20% cap with high quality products
                // Now allow adding more treatments as long as total stays within full budget
                results.push(nextTreatment);
                treatmentsCost = newTreatmentsCost;
                // console.log(`Added treatment (after exceeding 20% cap): ${nextTreatment.productName} ($${treatmentPrice}) - Concerns: ${concernMatches}, Best: ${isBestProduct} - Treatments: $${treatmentsCost.toFixed(2)}/${targetBudgetForTreatments.toFixed(2)}, Total: $${newTotalCost.toFixed(2)}/${ceil}`);

                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                // Continue loop to try adding more treatments
            } else {
                // Low quality match that exceeds 20% cap - skip it but continue trying others
                // console.log(`Skipping ${nextTreatment.productName} - exceeds 20% cap ($${newTreatmentsCost.toFixed(2)} > $${targetBudgetForTreatments.toFixed(2)}) and not high quality match`);
                const index = availableTreatments.findIndex(t => t.productId === nextTreatment.productId);
                if (index > -1) availableTreatments.splice(index, 1);
                // Continue loop to try other treatments
            }
        }

        const finalTotalCost = essentialsCost + treatmentsCost;
        const budgetUtilization = (finalTotalCost / ceil) * 100;
        const targetUtilization = 20;

        // Edge case: Budget exceeds due to best products
        if (finalTotalCost > ceil * 0.9 && !phaseChanged) {
            this.addUserNote("We've prioritized selecting the best quality products for your skin type and concerns. The recommended products are carefully chosen to provide optimal results, which is why we're utilizing more of your budget.");
        }

        // Edge case: Budget utilization is low
        if (budgetUtilization < targetUtilization && !phaseChanged) {
            this.addUserNote("We've carefully selected high-quality products that best match your skin type and concerns. While we could add more products to use your full budget, we've prioritized giving you the most effective routine with products that work well together. Quality over quantity ensures better results for your skin.");
        }

        // Edge case: Couldn't reach target count
        if (results.length < targetCount && !phaseChanged) {
            this.addUserNote("We've selected the best products available for your skin type and concerns. Some products weren't included to ensure safety, compatibility, and optimal results.");
        }

        // Edge case: No treatments added due to budget constraints
        if (treatmentsCost === 0 && results.length === essentials.length && !phaseChanged) {
            this.addUserNote("We've focused on selecting the best essential products for your routine. Additional treatments weren't included to stay within your budget while ensuring you have a complete and effective skincare routine.");
        }

        // console.log(`Final: ${results.length} products, Total Cost: $${finalTotalCost.toFixed(2)}/${ceil} (${budgetUtilization.toFixed(1)}%), Treatments: $${treatmentsCost.toFixed(2)}/${targetBudgetForTreatments.toFixed(2)}\n`);
        return results;
    }

    private static selectBestProduct(
        candidates: Product[],
        aiQuiz: AICompatibleQuizModel,
        category: string,
        isEssential: boolean = false,
        priceCap?: number
    ): Product | null {
        if (candidates.length === 0) {
            if (isEssential) {
                // console.log(`🚨 CRITICAL: No ${category} candidates available!`);
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

            const picked = this.pickAffordableProduct(scored, priceCap, category);
            if (picked) {
                // console.log(`✅ ${category}: Selected BEST quality - ${picked.productName}`);
                return picked;
            }
        }

        if (isEssential) {
            // console.log(`⚠️ ${category}: No premium available, selecting SAFE fallback`);

            const scored = candidates
                .map(p => ({
                    product: p,
                    score: ConcernScorer.scoreForConcerns(p, aiQuiz)
                }))
                .sort((a, b) => b.score - a.score);

            const picked = this.pickAffordableProduct(scored, priceCap, category);
            if (picked) {
                // console.log(`✅ ${category}: Safe fallback - ${picked.productName}`);
                return picked;
            }
        }

        const scored = candidates
            .map(p => ({
                product: p,
                score: ConcernScorer.scoreForConcerns(p, aiQuiz)
            }))
            .sort((a, b) => b.score - a.score);

        const fallbackPick = this.pickAffordableProduct(scored, priceCap, category);
        if (fallbackPick) {
            return fallbackPick;
        }

        // console.log(`ℹ️ ${category}: No suitable products found`);
        return null;
    }

    private static pickAffordableProduct(
        scored: { product: Product; score: number; }[],
        priceCap?: number,
        stepLabel?: string
    ): Product | null {
        if (scored.length === 0) return null;

        const withinCap = priceCap
            ? scored.filter(item => (item.product.price || 0) <= priceCap)
            : scored;

        const candidateList = withinCap.length > 0 ? withinCap : scored;
        const sorted = [...candidateList].sort((a, b) => {
            const priceA = a.product.price ?? Number.MAX_SAFE_INTEGER;
            const priceB = b.product.price ?? Number.MAX_SAFE_INTEGER;
            if (priceA !== priceB) {
                return priceA - priceB;
            }
            return b.score - a.score;
        });

        const chosen = sorted[0]?.product;
        if (!chosen) return null;

        if (priceCap && (chosen.price || 0) > priceCap && stepLabel) {
            this.addUserNote(`We selected a ${stepLabel} that slightly exceeds the cost target to keep performance high.`);
        }

        return chosen;
    }

    private static enforceExfoliationSafety(products: Product[]): Product[] {
        const cleansers = products.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && !steps.some(s => s.includes("treat"));
        });

        const treatments = products.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.some(s => s.includes("treat")) && !steps.includes("cleanse");
        });

        const exfoliatingCleansers = cleansers.filter(p => ValidationUtils.isExfoliating(p));
        const exfoliatingTreatments = treatments.filter(p => ValidationUtils.isExfoliating(p));

        const totalExfoliating = exfoliatingCleansers.length + exfoliatingTreatments.length;

        if (totalExfoliating <= 1) {
            return products; // Already compliant
        }

        // AI.DOC Rule R6: Prefer exfoliating treatment over exfoliating cleanser
        if (exfoliatingTreatments.length > 0) {
            // Keep treatments, remove exfoliating cleansers
            const nonExfoliatingCleansers = cleansers.filter(p => !ValidationUtils.isExfoliating(p));
            const otherProducts = products.filter(p => {
                const steps = ProductUtils.productSteps(p);
                return !steps.includes("cleanse") && !steps.some(s => s.includes("treat"));
            });
            return [...nonExfoliatingCleansers, ...treatments, ...otherProducts];
        } else {
            // Keep first exfoliating cleanser, remove others
            const firstExfoliatingCleanser = exfoliatingCleansers[0];
            const nonExfoliatingCleansers = cleansers.filter(p => !ValidationUtils.isExfoliating(p));
            const otherProducts = products.filter(p => {
                const steps = ProductUtils.productSteps(p);
                return !steps.includes("cleanse") && !steps.some(s => s.includes("treat"));
            });
            return firstExfoliatingCleanser
                ? [...nonExfoliatingCleansers, firstExfoliatingCleanser, ...treatments, ...otherProducts]
                : [...nonExfoliatingCleansers, ...treatments, ...otherProducts];
        }
    }

    private static optimizeBudget(aiQuiz: AICompatibleQuizModel, products: Product[]): Product[] {
        const { ceil } = BudgetManager.getBudgetBounds(aiQuiz);
        const totalCost = ProductUtils.totalCost(products);

        // Total cost should not exceed full budget
        if (totalCost <= ceil) {
            return products;
        }

        // Remove treatments until under full budget (essentials protected)
        const essentials = products.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
        });

        const treatments = products.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return !steps.includes("cleanse") && !steps.includes("moisturize") && !steps.includes("protect");
        });

        let essentialsCost = ProductUtils.totalCost(essentials);
        if (essentialsCost > ceil) {
            return essentials; // Even essentials exceed full budget, return essentials only
        }

        // Remove treatments starting with cheapest until under full budget
        const sortedTreatments = [...treatments].sort((a, b) => (a.price || 0) - (b.price || 0));
        const selectedTreatments: Product[] = [];
        let currentCost = essentialsCost;

        for (const treatment of sortedTreatments) {
            const treatmentPrice = treatment.price || 0;
            if (currentCost + treatmentPrice <= ceil) {
                selectedTreatments.push(treatment);
                currentCost += treatmentPrice;
            } else {
                break;
            }
        }

        return [...essentials, ...selectedTreatments];
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
            const formattedNote = note.startsWith("Note: ") ? note : `Note: ${note}`;
            this.userNotes.push(formattedNote);
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

            // console.log(`🎯 Found ${bestProducts.length} premium products for ${aiQuiz.demographics.name}`);

            // 🔍 DEBUG: Show breakdown by category
            const cleanserCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("cleanse")).length;
            const moisturizerCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("moisturize")).length;
            const spfCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("protect")).length;
            const treatmentCount = bestProducts.filter(p => ProductUtils.productSteps(p).includes("treat")).length;

            // console.log(`🎯 BALANCED PREMIUM PRODUCTS: Cleansers=${cleanserCount}, Moisturizers=${moisturizerCount}, SPF=${spfCount}, Treatments=${treatmentCount}`);

            return bestProducts;
        } catch (error) {
            // console.error('Error getting best products:', error);
            return [];
        }
    }

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
            // console.error('Error checking if product is best for user:', error);
            return false;
        }
    }

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
            // console.error('Error checking if product is relaxed best for user:', error);
            return false;
        }
    }

    static getBestProductsFromCache(aiQuiz: AICompatibleQuizModel): Product[] {
        try {
            const bestProducts = DbService.getBestProductsForProfile(aiQuiz);

            return bestProducts;
        } catch (error) {
            // console.error('Error getting best products from cache:', error);
            return [];
        }
    }
}

export default ProductFilter;
