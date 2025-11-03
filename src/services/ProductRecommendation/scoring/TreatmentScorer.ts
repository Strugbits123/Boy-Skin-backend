/**
 * Treatment Product Scoring & Selection
 * Handles treatment-specific scoring and concern-based treatment selection
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";
import { ValidationUtils } from "../utils/ValidationUtils";
import { ConcernScorer } from "./ConcernScorer";

export class TreatmentScorer {

    static selectConcernTreatments(aiQuiz: AICompatibleQuizModel, pool: Product[], currentSelection: Product[]): Product[] {
        const ranked = pool
            .map(t => ({ t, s: this.scoreForTreatmentOnly(t, aiQuiz) }))
            .sort((a, b) => {
                if (b.s !== a.s) return b.s - a.s;
                const pa = a.t.price || 0, pb = b.t.price || 0;
                if (pa !== pb) return pa - pb;
                return (a.t.productName || "").localeCompare(b.t.productName || "");
            })
            .map(x => x.t);

        const pick: Product[] = [];
        for (const cand of ranked) {
            if (!ValidationUtils.respectsExfoliationWith([...currentSelection, ...pick], cand)) continue;
            pick.push(cand);
            if (pick.length >= 3) break;
        }
        return pick;
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

    static getActiveFlags(p: Product) {
        const acts = ProductUtils.extractActives(p);
        const lower = new Set(acts);
        const isRetinoid = lower.has("retinol") || lower.has("retinal") || lower.has("retinoid");
        const isBP = lower.has("benzoyl peroxide");
        const isAHA = lower.has("aha") || lower.has("glycolic") || lower.has("lactic");
        const isBHA = lower.has("bha") || lower.has("salicylic");
        const isAcid = isAHA || isBHA;
        const isVitC = lower.has("vitamin c") || lower.has("ascorbic");
        const isSulfur = lower.has("sulfur");
        const isPrimaryActive = isRetinoid || isBP || isAcid;
        const isTreatment = ProductUtils.productSteps(p).some(s => s.includes("treat"));
        const isEssential = ProductUtils.isEssential(p);
        return { isRetinoid, isBP, isAHA, isBHA, isAcid, isVitC, isSulfur, isPrimaryActive, isTreatment, isEssential };
    }

    static scoreForDropDecision(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const flags = this.getActiveFlags(p);
        const base = flags.isTreatment ? this.scoreForTreatmentOnly(p, aiQuiz) : ConcernScorer.scoreForConcerns(p, aiQuiz);
        const essentialBoost = flags.isEssential ? 1000 : 0;
        const pricePenalty = (p.price || 0) / 1000;
        return base + essentialBoost - pricePenalty;
    }
}
