/**
 * AI.DOC Compliant Ingredient Effectiveness Scoring
 * Implements Phase 4: Concern-Based Ingredient Targeting from AI.doc.txt
 */

export class IngredientScorer {

    // AI.DOC Phase 4: Ingredient Effectiveness Matrix
    private static readonly INGREDIENT_SCORES = {
        // Acne Concern Scoring
        acne: {
            // PRIMARY ACTIVES (Scores 8-10)
            "salicylic acid": 10,
            "bha": 10,
            "benzoyl peroxide": 9,
            "retinal": 8,
            "azelaic acid": 8,

            // SECONDARY ACTIVES (Scores 5-7)
            "retinol": 7,
            "sulfur": 7,
            "glycolic acid": 6,
            "aha": 6,

            // SUPPORTIVE (Scores 3-5)
            "hypochlorous acid": 5,
            "pha": 5,
            "lactic acid": 4
        },

        // Texture/Smoothness Concern Scoring  
        texture: {
            // PRIMARY ACTIVES (Scores 8-10)
            "glycolic acid": 10,
            "aha": 10,
            "salicylic acid": 9,
            "bha": 9,
            "retinal": 8,

            // SECONDARY ACTIVES (Scores 5-7)
            "retinol": 7,
            "lactic acid": 6,
            "azelaic acid": 6,

            // SUPPORTIVE (Scores 3-5)
            "pha": 5
        },

        // Hyperpigmentation Concern Scoring
        hyperpigmentation: {
            // PRIMARY ACTIVES (Scores 8-10)
            "vitamin c": 10,
            "kojic acid": 9,
            "azelaic acid": 9,
            "niacinamide": 8,

            // SECONDARY ACTIVES (Scores 5-7)
            "glycolic acid": 7,
            "aha": 7,
            "retinal": 6,

            // SUPPORTIVE (Scores 3-5)
            "retinol": 5,
            "lactic acid": 4
        },

        // Aging/Fine Lines Concern Scoring
        "fine lines": {
            // PRIMARY ACTIVES (Scores 8-10)
            "retinal": 10,
            "retinol": 9,

            // SECONDARY ACTIVES (Scores 5-7)
            "glycolic acid": 6,
            "aha": 6,
            "niacinamide": 6,

            // SUPPORTIVE (Scores 3-5)
            "vitamin c": 5,
            "lactic acid": 5,
            "peptides": 5
        },

        // Redness Concern (AI.DOC derived)
        redness: {
            "azelaic acid": 9,
            "niacinamide": 8,
            "allantoin": 6,
            "centella asiatica": 5,
            "green tea": 4
        },

        // Pores Concern (AI.DOC derived)  
        pores: {
            "salicylic acid": 9,
            "bha": 9,
            "niacinamide": 8,
            "retinal": 7,
            "retinol": 6
        }
    };

    /**
     * Calculate ingredient effectiveness score for product based on concerns
     * AI.DOC Phase 4 Implementation
     */
    static scoreProductForConcerns(product: any, concerns: string[]): number {
        if (!concerns.length) return 0;

        const actives = this.extractProductActives(product);
        let totalScore = 0;
        let scoreCount = 0;

        for (const concern of concerns) {
            const concernKey = concern.toLowerCase().trim();
            const concernMatrix = this.INGREDIENT_SCORES[concernKey as keyof typeof this.INGREDIENT_SCORES];

            if (!concernMatrix) continue;

            let concernScore = 0;
            let concernMatches = 0;

            for (const active of actives) {
                const activeKey = active.toLowerCase().trim();
                const score = (concernMatrix as any)?.[activeKey];
                if (score) {
                    concernScore += score;
                    concernMatches++;
                }
            }

            if (concernMatches > 0) {
                totalScore += concernScore / concernMatches; // Average for concern
                scoreCount++;
            }
        }

        return scoreCount > 0 ? totalScore / scoreCount : 0;
    }

    /**
     * Extract active ingredients from product (AI.DOC compliant)
     */
    private static extractProductActives(product: any): string[] {
        const actives: string[] = [];

        // Check primaryActiveIngredients
        if (product.primaryActiveIngredients?.length) {
            for (const active of product.primaryActiveIngredients) {
                if (active?.name) {
                    actives.push(active.name.toLowerCase());
                }
            }
        }

        // Check ingredient list for common actives
        const ingredientText = (product.ingredientList?.plain_text || "").toLowerCase();
        const commonActives = [
            "salicylic acid", "glycolic acid", "lactic acid", "azelaic acid",
            "retinol", "retinal", "niacinamide", "vitamin c", "benzoyl peroxide",
            "kojic acid", "sulfur", "peptides", "hyaluronic acid"
        ];

        for (const active of commonActives) {
            if (ingredientText.includes(active)) {
                actives.push(active);
            }
        }

        return [...new Set(actives)]; // Remove duplicates
    }
}