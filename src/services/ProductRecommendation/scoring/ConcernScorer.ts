/**
 * Concern-based Product Scoring
 * Matches products to user concerns using active ingredient mappings
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";

export class ConcernScorer {

    static scoreForConcerns(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (ProductUtils.getPrimaryActivesText(p) || "").toLowerCase();
        const txtAll = (p.ingredientList?.plain_text || "").toLowerCase();

        // AI.DOC Phase 4: Ingredient Effectiveness Matrix with actual effectiveness scores
        const concernToActives: Record<string, Record<string, number>> = {
            "active acne": {
                "salicylic": 10, "bha": 10, "benzoyl peroxide": 10,
                "retinal": 8, "azelaic": 8, "retinol": 7, "sulfur": 7,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 6, "lactic": 4
            },
            "acne-prone": {
                "salicylic": 10, "bha": 10, "retinal": 9,
                "azelaic": 8, "retinol": 8,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 5, "lactic": 4
            },
            texture: {
                "glycolic": 10, "aha": 10, "salicylic": 9, "bha": 9,
                "retinal": 8, "retinol": 7, "lactic": 6, "azelaic": 6, "pha": 5
            },
            hyperpigmentation: {
                "vitamin c": 10, "ascorbic": 10, "kojic": 9, "azelaic": 9,
                "niacinamide": 8, "tranexamic": 8, "tranexamic acid": 8,
                "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5,
                "dimethoxytolyl propylresorcinol": 6, "dimethoxytolyl": 6,
                "astaxanthin": 6, "lactic": 4
            },
            pores: {
                "salicylic": 9, "bha": 9, "niacinamide": 8, "retinal": 7, "retinol": 6
            },
            "fine lines": {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            wrinkles: {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            redness: {
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "bisabolol": 6,
                "centella": 5, "chamomile": 5, "zinc oxide": 4, "witch hazel": 3
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "alpha arbutin": 7, "arbutin": 7,
                "glycolic": 6, "aha": 6, "lactic": 5,
                "meshima mushroom": 4, "meshima": 4
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7,
                "petrolatum": 9, "dimethicone": 8,
                "caprylic capric triglyceride": 8, "caprylic/capric triglyceride": 8, "caprylic": 8, "capric": 8,
                "urea": 7, "squalane": 7,
                "ginseng": 5, "panax ginseng": 5,
                "galactomyces ferment filtrate": 5, "galactomyces": 5
            }
        };

        // AI-DOC Rule I3: 80% weight to Primary Active Ingredients, 20% weight to total Ingredient List
        const weightPrimary = 0.8;
        const weightAll = 0.2;

        // AI.DOC compliant scoring with ingredient effectiveness weights
        const scoreIngredients = (source: string, ingredientScores: Record<string, number>): number => {
            let totalScore = 0;
            for (const [ingredient, effectivenessScore] of Object.entries(ingredientScores)) {
                // Dynamic ingredient matching: Handle multi-word ingredients (e.g., "benzoyl peroxide")
                // Match both full phrase and key component (e.g., "benzoyl peroxide" OR "benzoyl")
                if (ingredient.includes(" ")) {
                    // Multi-word ingredient: Match full phrase OR key component with word boundary
                    const words = ingredient.split(" ");
                    const keyComponent = words[0]; // First word (e.g., "benzoyl" from "benzoyl peroxide")
                    const fullPhrase = ingredient;

                    if (keyComponent) {
                        // Use word boundary regex for accurate matching
                        const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        const keyRegex = new RegExp(`\\b${keyComponent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

                        if (fullRegex.test(source) || keyRegex.test(source)) {
                            totalScore += effectivenessScore;
                        }
                    } else {
                        // Fallback: Match full phrase only
                        const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        if (fullRegex.test(source)) {
                            totalScore += effectivenessScore;
                        }
                    }
                } else {
                    // Single-word ingredient: Use word boundary for exact match
                    const regex = new RegExp(`\\b${ingredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (regex.test(source)) {
                        totalScore += effectivenessScore;
                    }
                }
            }
            return totalScore;
        };

        // Helper: Map "acne" to correct category based on user's acne status
        const mapAcneConcern = (concern: string): string => {
            const concernLower = concern.toLowerCase();
            if (concernLower === "acne") {
                return aiQuiz.skinAssessment.currentAcneStatus === "active acne" ? "active acne" : "acne-prone";
            }
            return concernLower;
        };

        let score = 0;
        const allConcerns = [...primary, ...secondary];
        const dedup = Array.from(new Set(allConcerns));

        // DEBUG: Log acne status for active acne debugging
        const isActiveAcneUser = aiQuiz.skinAssessment.currentAcneStatus === "active acne";
        const userHasAcneConcern = allConcerns.some(c => c.toLowerCase() === "acne");

        if (isActiveAcneUser && userHasAcneConcern) {
            const productName = (p.productName || "").toLowerCase();
            const hasBP = txtPrimary.includes("benzoyl") || txtAll.includes("benzoyl");
            const hasSulfur = txtPrimary.includes("sulfur") || txtAll.includes("sulfur");

            if (hasBP || hasSulfur) {
                console.log(`\n🔍 ACTIVE ACNE PRODUCT: ${p.productName}`);
                console.log(`Primary Concerns: ${primary.join(", ")}`);
                console.log(`Has BP: ${hasBP}, Has Sulfur: ${hasSulfur}`);
            }
        }

        for (const concern of dedup) {
            const mappedConcern = mapAcneConcern(concern);
            const ingredientMatrix = concernToActives[mappedConcern] || {};
            const s1 = scoreIngredients(txtPrimary, ingredientMatrix) * weightPrimary;
            const s2 = scoreIngredients(txtAll, ingredientMatrix) * weightAll;
            const base = s1 + s2;
            const boost = primary.includes(concern) ? 2.5 : 1.8; // 🎯 FIXED: Secondary concerns get proper priority (1.8x vs 2.5x)
            score += base * boost;
        }

        // Sensitivity bonus for safe products
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && ProductUtils.isSensitiveSafe(p)) {
            score += 1;
        }

        // AI.doc Age-appropriate active boost (ONLY for anti-aging concerns)
        const age = aiQuiz.demographics.age;
        const productText = [txtPrimary, txtAll].join(" ");

        // Check if user has anti-aging related concerns
        const antiAgingConcerns = ["wrinkles", "fine lines", "dark circles", "aging", "anti-aging", "age spots"];
        const hasAntiAgingConcern = allConcerns.some(concern =>
            antiAgingConcerns.some(ac => concern.toLowerCase().includes(ac))
        );

        // Only apply age boosts if user has anti-aging concerns AND is 25+
        if (hasAntiAgingConcern && (age === "25-34" || age === "35-44" || age === "45-54" || age === "55+")) {
            // Anti-aging actives boost for 25+ users with anti-aging concerns
            if (productText.includes("retinol") || productText.includes("retinal")) {
                score += 8; // Strong boost for retinoids in appropriate age
            }
            if (productText.includes("glycolic") || productText.includes("aha")) {
                score += 6; // Boost for exfoliating actives
            }
            if (productText.includes("vitamin c") || productText.includes("niacinamide")) {
                score += 4; // Boost for preventative actives
            }
        }

        // 🎯 ACTIVE ACNE PRIORITY BOOST: BP/Sulfur products get extra boost for Active Acne users
        // AI-DOC: Benzoyl Peroxide (Score 10) and Sulfur (Score 7) are PRIMARY/SECONDARY actives for Active Acne
        if (isActiveAcneUser && userHasAcneConcern) {
            const hasBP = /\bbenzoyl\b/i.test(productText);
            const hasSulfur = /\bsulfur\b/i.test(productText);

            if (hasBP) {
                score += 15; // Strong boost for BP (primary active for Active Acne)
            }
            if (hasSulfur) {
                score += 10; // Boost for Sulfur (secondary active for Active Acne)
            }
        }

        // Premium brand/quality boost for clinically proven products
        const productName = (p.productName || "").toLowerCase();
        const premiumKeywords = [
            "cosmic dew", "redness relief", "azelaic acid", "salmon dna", "uv clear",
            "cerave", "iope retinol", "ordinary niacinamide", "eclipse hyaluronic",
            "supergoop", "hydrating gel", "strive anti-aging", "peach lily",
            "first aid beauty", "isntree hyaluronic"
        ];

        if (premiumKeywords.some(keyword => productName.includes(keyword))) {
            score += 5; // Boost for recognized quality products
        }

        // DEBUG: Log final score for active acne products
        if (isActiveAcneUser && userHasAcneConcern) {
            const hasBP = productText.includes("benzoyl");
            const hasSulfur = productText.includes("sulfur");
            if (hasBP || hasSulfur) {
                console.log(`Final Score: ${score}\n`);
            }
        }

        return score;
    }

    static scoreForTreatmentOnly(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (ProductUtils.getPrimaryActivesText(p) || "").toLowerCase();

        // Same AI.DOC ingredient effectiveness matrix as main scoring
        const concernToActives: Record<string, Record<string, number>> = {
            "active acne": {
                "salicylic": 10, "bha": 10, "benzoyl peroxide": 10,
                "retinal": 8, "azelaic": 8, "retinol": 7, "sulfur": 7,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 6, "lactic": 4
            },
            "acne-prone": {
                "salicylic": 10, "bha": 10, "retinal": 9,
                "azelaic": 8, "retinol": 8,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 5, "lactic": 4
            },
            texture: {
                "glycolic": 10, "aha": 10, "salicylic": 9, "bha": 9,
                "retinal": 8, "retinol": 7, "lactic": 6, "azelaic": 6, "pha": 5
            },
            hyperpigmentation: {
                "vitamin c": 10, "ascorbic": 10, "kojic": 9, "azelaic": 9,
                "niacinamide": 8, "tranexamic": 8, "tranexamic acid": 8,
                "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5,
                "dimethoxytolyl propylresorcinol": 6, "dimethoxytolyl": 6,
                "astaxanthin": 6, "lactic": 4
            },
            pores: {
                "salicylic": 9, "bha": 9, "niacinamide": 8, "retinal": 7, "retinol": 6
            },
            "fine lines": {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            wrinkles: {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            redness: {
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "bisabolol": 6,
                "centella": 5, "chamomile": 5, "zinc oxide": 4, "witch hazel": 3
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "alpha arbutin": 7, "arbutin": 7,
                "glycolic": 6, "aha": 6, "lactic": 5,
                "meshima mushroom": 4, "meshima": 4
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7,
                "petrolatum": 9, "dimethicone": 8,
                "caprylic capric triglyceride": 8, "caprylic/capric triglyceride": 8, "caprylic": 8, "capric": 8,
                "urea": 7, "squalane": 7,
                "ginseng": 5, "panax ginseng": 5,
                "galactomyces ferment filtrate": 5, "galactomyces": 5
            }
        };

        // AI-DOC Rule I3: TREATMENT OVERRIDE - 100% Primary Active Ingredients for treatments
        // Use same dynamic ingredient matching as scoreForConcerns() for consistency
        const scoreIngredients = (source: string, ingredientScores: Record<string, number>): number => {
            let totalScore = 0;
            for (const [ingredient, effectivenessScore] of Object.entries(ingredientScores)) {
                // Dynamic ingredient matching: Handle multi-word ingredients (e.g., "benzoyl peroxide")
                // Match both full phrase and key component (e.g., "benzoyl peroxide" OR "benzoyl")
                if (ingredient.includes(" ")) {
                    // Multi-word ingredient: Match full phrase OR key component with word boundary
                    const words = ingredient.split(" ");
                    const keyComponent = words[0];
                    const fullPhrase = ingredient;

                    if (keyComponent) {
                        // Use word boundary regex for accurate matching
                        const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        const keyRegex = new RegExp(`\\b${keyComponent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

                        if (fullRegex.test(source) || keyRegex.test(source)) {
                            totalScore += effectivenessScore;
                        }
                    } else {
                        // Fallback: Match full phrase only
                        const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        if (fullRegex.test(source)) {
                            totalScore += effectivenessScore;
                        }
                    }
                } else {
                    // Single-word ingredient: Use word boundary for exact match
                    const regex = new RegExp(`\\b${ingredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (regex.test(source)) {
                        totalScore += effectivenessScore;
                    }
                }
            }
            return totalScore;
        };

        // Helper: Map "acne" to correct category based on user's acne status
        const mapAcneConcern = (concern: string): string => {
            const concernLower = concern.toLowerCase();
            if (concernLower === "acne") {
                return aiQuiz.skinAssessment.currentAcneStatus === "active acne" ? "active acne" : "acne-prone";
            }
            return concernLower;
        };

        let score = 0;
        const allConcerns = [...primary, ...secondary];
        const dedup = Array.from(new Set(allConcerns));

        for (const concern of dedup) {
            const mappedConcern = mapAcneConcern(concern);
            const ingredientMatrix = concernToActives[mappedConcern] || {};
            const ingredientScore = scoreIngredients(txtPrimary, ingredientMatrix);
            const boost = primary.includes(concern) ? 1.5 : 1; // Primary concerns weighted
            score += ingredientScore * boost;
        }

        // Sensitivity bonus
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && ProductUtils.isSensitiveSafe(p)) {
            score += 1;
        }

        return score;
    }

    /**
     * Calculate raw concern relevance score for minimum threshold check
     * Primary concern match = 1.0 point per ingredient
     * Secondary concern match = 0.5 point per ingredient
     * Used to filter out irrelevant products (<2 points total)
     */
    static calculateConcernRelevanceScore(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const allUserConcerns = [...primary, ...secondary].map(c => c.toLowerCase());

        // 🎯 CLIENT REQUIREMENT: Product must be DESIGNED FOR user's concerns
        // Check if product's skinConcern tags overlap with user concerns
        const productConcernTags = (p.skinConcern || []).map(sc => (sc.name || "").toLowerCase());

        const hasTagOverlap = allUserConcerns.some(userConcern => {
            return productConcernTags.some(productTag => {
                // Handle variations: "fine lines" ↔ "wrinkles", etc.
                if (userConcern.includes("fine line") && (productTag.includes("wrinkle") || productTag.includes("fine line") || productTag.includes("anti-aging") || productTag.includes("aging"))) return true;
                if (userConcern.includes("wrinkle") && (productTag.includes("fine line") || productTag.includes("anti-aging") || productTag.includes("aging"))) return true;
                if (userConcern.includes("dark circle") && productTag.includes("dark circle")) return true;
                if (userConcern.includes("dry") && productTag.includes("dry")) return true;
                return productTag.includes(userConcern) || userConcern.includes(productTag);
            });
        });

        // 🚫 If product tags DON'T match ANY user concern → IRRELEVANT → REJECT
        if (!hasTagOverlap) {
            return 0;
        }

        const txtPrimary = (ProductUtils.getPrimaryActivesText(p) || "").toLowerCase();
        const txtAll = (p.ingredientList?.plain_text || "").toLowerCase();

        // Same ingredient effectiveness matrix
        const concernToActives: Record<string, Record<string, number>> = {
            "active acne": {
                "salicylic": 10, "bha": 10, "benzoyl peroxide": 10,
                "retinal": 8, "azelaic": 8, "retinol": 7, "sulfur": 7,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 6, "lactic": 4
            },
            "acne-prone": {
                "salicylic": 10, "bha": 10, "retinal": 9,
                "azelaic": 8, "retinol": 8,
                "glycolic": 6, "aha": 6, "hydroxypinacolone retinoate": 6, "hydroxypinacolone": 6,
                "hypochlorous": 5, "pha": 5, "zinc pca": 5, "lactic": 4
            },
            texture: {
                "glycolic": 10, "aha": 10, "salicylic": 9, "bha": 9,
                "retinal": 8, "retinol": 7, "lactic": 6, "azelaic": 6, "pha": 5
            },
            hyperpigmentation: {
                "vitamin c": 10, "ascorbic": 10, "kojic": 9, "azelaic": 9,
                "niacinamide": 8, "tranexamic": 8, "tranexamic acid": 8,
                "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5,
                "dimethoxytolyl propylresorcinol": 6, "dimethoxytolyl": 6,
                "astaxanthin": 6, "lactic": 4
            },
            pores: {
                "salicylic": 9, "bha": 9, "niacinamide": 8, "retinal": 7, "retinol": 6
            },
            "fine lines": {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            wrinkles: {
                "retinal": 10, "retinol": 9, "glycolic": 6, "aha": 6,
                "niacinamide": 6, "vitamin c": 5, "lactic": 5, "peptides": 5
            },
            redness: {
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "bisabolol": 6,
                "centella": 5, "chamomile": 5, "zinc oxide": 4, "witch hazel": 3
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "alpha arbutin": 7, "arbutin": 7,
                "glycolic": 6, "aha": 6, "lactic": 5,
                "meshima mushroom": 4, "meshima": 4
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7,
                "petrolatum": 9, "dimethicone": 8,
                "caprylic capric triglyceride": 8, "caprylic/capric triglyceride": 8, "caprylic": 8, "capric": 8,
                "urea": 7, "squalane": 7,
                "ginseng": 5, "panax ginseng": 5,
                "galactomyces ferment filtrate": 5, "galactomyces": 5
            }
        };

        // Helper: Map "acne" to correct category based on user's acne status
        const mapAcneConcern = (concern: string): string => {
            const concernLower = concern.toLowerCase();
            if (concernLower === "acne") {
                return aiQuiz.skinAssessment.currentAcneStatus === "active acne" ? "active acne" : "acne-prone";
            }
            return concernLower;
        };

        let relevanceScore = 0;

        // Dynamic ingredient matching helper (same as scoreIngredients)
        const matchesIngredient = (source: string, ingredient: string): boolean => {
            if (ingredient.includes(" ")) {
                // Multi-word ingredient: Match full phrase OR key component with word boundary
                const words = ingredient.split(" ");
                const keyComponent = words[0];
                const fullPhrase = ingredient;

                if (keyComponent) {
                    const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    const keyRegex = new RegExp(`\\b${keyComponent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

                    return fullRegex.test(source) || keyRegex.test(source);
                } else {
                    // Fallback: Match full phrase only
                    const fullRegex = new RegExp(`\\b${fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    return fullRegex.test(source);
                }
            } else {
                // Single-word ingredient: Use word boundary for exact match
                const regex = new RegExp(`\\b${ingredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return regex.test(source);
            }
        };

        // Check primary concerns - 1.0 point per match
        for (const concern of primary) {
            const mappedConcern = mapAcneConcern(concern);
            const ingredientMatrix = concernToActives[mappedConcern] || {};
            let concernMatched = false;

            for (const ingredient of Object.keys(ingredientMatrix)) {
                if (matchesIngredient(txtPrimary, ingredient) || matchesIngredient(txtAll, ingredient)) {
                    concernMatched = true;
                    break;
                }
            }

            if (concernMatched) {
                relevanceScore += 1.0;
            }
        }

        // Check secondary concerns - 0.5 point per match
        for (const concern of secondary) {
            const mappedConcern = mapAcneConcern(concern);
            const ingredientMatrix = concernToActives[mappedConcern] || {};
            let concernMatched = false;

            for (const ingredient of Object.keys(ingredientMatrix)) {
                if (matchesIngredient(txtPrimary, ingredient) || matchesIngredient(txtAll, ingredient)) {
                    concernMatched = true;
                    break;
                }
            }

            if (concernMatched) {
                relevanceScore += 0.5;
            }
        }

        if ((p.productName || "").toLowerCase().includes("glycolic")) {
            console.log(`✅ PASSED Tag Check - Final Score:`, relevanceScore);
            console.log(`Threshold: 2.0`);
            console.log(`Result:`, relevanceScore >= 2.0 ? 'ACCEPT ✅' : 'REJECT ❌');
            console.log(`================================================\n`);
        }

        return relevanceScore;
    }
}
