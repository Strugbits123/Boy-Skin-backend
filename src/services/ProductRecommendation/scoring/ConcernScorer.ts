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

        const concernToActives: Record<string, string[]> = {
            acne: ["salicylic", "bha", "benzoyl peroxide", "retinal", "azelaic"],
            texture: ["glycolic", "aha", "salicylic", "bha", "retinal"],
            hyperpigmentation: ["vitamin c", "ascorbic", "kojic", "azelaic", "niacinamide"],
            pores: ["niacinamide", "retinal"],
            wrinkles: ["retinal", "retinol", "glycolic", "niacinamide"],
            redness: ["niacinamide", "zinc oxide", "azelaic", "centella"],
            "dark circles": ["retinal", "retinol", "vitamin c", "niacinamide", "caffeine"],
            dullness: ["vitamin c", "niacinamide"],
            dryness: ["ceramide", "ceramides", "hyaluronic", "glycerin", "squalane", "urea"]
        };

        const weightPrimary = 0.9;
        const weightAll = 0.1;

        const scoreList = (source: string, c: string[]): number => c.reduce((acc, ing) => acc + (source.includes(ing) ? 1 : 0), 0);

        let score = 0;
        const allConcerns = [...primary, ...secondary];
        const dedup = Array.from(new Set(allConcerns));
        for (const c of dedup) {
            const acts = concernToActives[c] || [];
            const s1 = scoreList(txtPrimary, acts) * weightPrimary;
            const s2 = scoreList(txtAll, acts) * weightAll;
            const base = s1 + s2;
            const boost = primary.includes(c) ? 1 : 0;
            score += base + boost;
        }
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && ProductUtils.isSensitiveSafe(p)) score += 0.5;
        return score;
    }

    static scoreForTreatmentOnly(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (ProductUtils.getPrimaryActivesText(p) || "").toLowerCase();

        const concernToActives: Record<string, string[]> = {
            acne: ["salicylic", "bha", "benzoyl peroxide", "retinal", "azelaic"],
            texture: ["glycolic", "aha", "salicylic", "bha", "retinal"],
            hyperpigmentation: ["vitamin c", "ascorbic", "kojic", "azelaic", "niacinamide"],
            pores: ["niacinamide", "retinal"],
            wrinkles: ["retinal", "retinol", "glycolic", "niacinamide"],
            redness: ["niacinamide", "zinc oxide", "azelaic", "centella"],
            "dark circles": ["retinal", "retinol", "vitamin c", "niacinamide", "caffeine"],
            dullness: ["vitamin c", "niacinamide"],
            dryness: ["ceramide", "ceramides", "hyaluronic", "glycerin", "squalane", "urea"]
        };

        const scoreList = (source: string, c: string[]): number => c.reduce((acc, ing) => acc + (source.includes(ing) ? 1 : 0), 0);

        let score = 0;
        const allConcerns = [...primary, ...secondary];
        const dedup = Array.from(new Set(allConcerns));
        for (const c of dedup) {
            const acts = concernToActives[c] || [];
            const s1 = scoreList(txtPrimary, acts) * 1.0;
            const boost = primary.includes(c) ? 1 : 0;
            score += s1 + boost;
        }
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && ProductUtils.isSensitiveSafe(p)) score += 0.5;
        return score;
    }
}
