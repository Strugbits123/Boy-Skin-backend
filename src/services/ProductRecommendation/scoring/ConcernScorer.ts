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
                "niacinamide": 8, "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5, "lactic": 4
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
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "centella": 5, "zinc oxide": 4
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "glycolic": 6, "aha": 6, "lactic": 5
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7, "squalane": 6, "urea": 6
            }
        };

        const weightPrimary = 0.9;
        const weightAll = 0.1;

        // AI.DOC compliant scoring with ingredient effectiveness weights
        const scoreIngredients = (source: string, ingredientScores: Record<string, number>): number => {
            let totalScore = 0;
            for (const [ingredient, effectivenessScore] of Object.entries(ingredientScores)) {
                if (source.includes(ingredient)) {
                    totalScore += effectivenessScore;
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
                "niacinamide": 8, "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5, "lactic": 4
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
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "centella": 5, "zinc oxide": 4
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "glycolic": 6, "aha": 6, "lactic": 5
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7, "squalane": 6, "urea": 6
            }
        };

        // Treatment-focused scoring with AI.DOC effectiveness weights
        const scoreIngredients = (source: string, ingredientScores: Record<string, number>): number => {
            let totalScore = 0;
            for (const [ingredient, effectivenessScore] of Object.entries(ingredientScores)) {
                if (source.includes(ingredient)) {
                    totalScore += effectivenessScore;
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
                "niacinamide": 8, "glycolic": 7, "aha": 7, "retinal": 6, "retinol": 5, "lactic": 4
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
                "azelaic": 9, "niacinamide": 8, "allantoin": 6, "centella": 5, "zinc oxide": 4
            },
            "dark circles": {
                "retinal": 8, "retinol": 7, "vitamin c": 6, "niacinamide": 5, "caffeine": 5
            },
            dullness: {
                "vitamin c": 8, "niacinamide": 7, "glycolic": 6, "aha": 6, "lactic": 5
            },
            dryness: {
                "hyaluronic": 8, "ceramides": 8, "ceramide": 8, "glycerin": 7, "squalane": 6, "urea": 6
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

        // Check primary concerns - 1.0 point per match
        for (const concern of primary) {
            const mappedConcern = mapAcneConcern(concern);
            const ingredientMatrix = concernToActives[mappedConcern] || {};
            let concernMatched = false;

            for (const ingredient of Object.keys(ingredientMatrix)) {
                if (txtPrimary.includes(ingredient) || txtAll.includes(ingredient)) {
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
                if (txtPrimary.includes(ingredient) || txtAll.includes(ingredient)) {
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
