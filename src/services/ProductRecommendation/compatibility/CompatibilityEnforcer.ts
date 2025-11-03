/**
 * Compatibility Enforcement Engine
 * Resolves active conflicts, protects essentials, and manages product replacements
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";
import { SPFUtils } from "../utils/SPFUtils";
import { ValidationUtils } from "../utils/ValidationUtils";
import { ConcernScorer } from "../scoring/ConcernScorer";
import { TreatmentScorer } from "../scoring/TreatmentScorer";
import { ConflictDetector } from "./ConflictDetector";

export class CompatibilityEnforcer {

    static enforceSinglePrimaryActive(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const primary = selection.filter(p => TreatmentScorer.getActiveFlags(p).isPrimaryActive);
        if (primary.length <= 1) return selection;

        const essentialPrimaries = primary.filter(p => ProductUtils.isEssential(p));
        const treatmentPrimaries = primary.filter(p => !ProductUtils.isEssential(p));

        if (essentialPrimaries.length === 0 || (essentialPrimaries.length === 1 && treatmentPrimaries.length >= 1)) {
            const ranked = treatmentPrimaries
                .map(p => ({ p, s: TreatmentScorer.scoreForDropDecision(p, aiQuiz) }))
                .sort((a, b) => b.s - a.s)
                .map(x => x.p);
            const keep = ranked[0];
            if (!keep) return selection;
            return selection.filter(p => {
                const flags = TreatmentScorer.getActiveFlags(p);
                if (!flags.isPrimaryActive) return true;
                if (ProductUtils.isEssential(p)) return true;
                return p.productId === keep.productId;
            });
        }

        const ranked = primary
            .map(p => ({ p, s: TreatmentScorer.scoreForDropDecision(p, aiQuiz) + (ProductUtils.isEssential(p) ? 100 : 0) + (TreatmentScorer.getActiveFlags(p).isTreatment ? 1 : 0) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);
        const keep = ranked[0];
        if (!keep) return selection;
        return selection.filter(p => !TreatmentScorer.getActiveFlags(p).isPrimaryActive || p.productId === keep.productId);
    }

    static resolvePairwiseConflicts(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        let changed = true;
        let current = selection.slice();
        while (changed) {
            changed = false;
            outer: for (let i = 0; i < current.length; i++) {
                for (let j = i + 1; j < current.length; j++) {
                    const a: Product = current[i] as Product, b: Product = current[j] as Product;
                    if (!ConflictDetector.conflicts(a, b)) continue;
                    if (!a || !b) continue;

                    const aEss = ProductUtils.isEssential(a);
                    const bEss = ProductUtils.isEssential(b);

                    const aIsSPF = ProductUtils.productSteps(a).includes("protect");
                    const bIsSPF = ProductUtils.productSteps(b).includes("protect");
                    const skinType = aiQuiz.skinAssessment.skinType;

                    const aSPFMatch = aIsSPF && ProductUtils.productHasSkinType(a, skinType);
                    const bSPFMatch = bIsSPF && ProductUtils.productHasSkinType(b, skinType);

                    let drop: Product | null;

                    if (aEss && !bEss) {
                        drop = b;
                    } else if (!aEss && bEss) {
                        drop = a;
                    }
                    else if (aEss && bEss && aSPFMatch && !bSPFMatch) {
                        drop = b;
                    } else if (aEss && bEss && !aSPFMatch && bSPFMatch) {
                        drop = a;
                    }
                    else {
                        const sa = TreatmentScorer.scoreForDropDecision(a, aiQuiz);
                        const sb = TreatmentScorer.scoreForDropDecision(b, aiQuiz);
                        drop = sa >= sb ? b : a;
                    }

                    if (!drop) continue;
                    current = current.filter(p => p.productId !== drop.productId);
                    changed = true;
                    break outer;
                }
            }
        }
        return current;
    }

    static enforceCompatibility(
        aiQuiz: AICompatibleQuizModel,
        selection: Product[],
        candidatePool: Product[] = [],
        validateEssentials: (s: Product[]) => { isValid: boolean; hasCleanser: boolean; hasMoisturizer: boolean; hasProtect: boolean; hasTreatment: boolean }
    ): Product[] {
        let current = this.enforceSinglePrimaryActive(aiQuiz, selection);
        current = this.resolvePairwiseConflicts(aiQuiz, current);

        const validation = validateEssentials(current);

        if (!validation.isValid && candidatePool.length > 0) {
            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            let safePool = candidatePool
                .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
                .filter(p => ValidationUtils.passesStrengthFilter(p, skinType))
                .filter(p => !current.some(existing => existing.productId === p.productId));

            if (isSensitive) {
                safePool = safePool.filter(p => ProductUtils.isSensitiveSafe(p));
            }

            const sortedSafe = safePool
                .filter(p => !current.some(existing => ConflictDetector.conflicts(p, existing)))
                .sort((a, b) => {
                    const aMatch = ProductUtils.productHasSkinType(a, skinType) ? 1 : 0;
                    const bMatch = ProductUtils.productHasSkinType(b, skinType) ? 1 : 0;
                    if (aMatch !== bMatch) return bMatch - aMatch;

                    const aScore = ConcernScorer.scoreForConcerns(a, aiQuiz);
                    const bScore = ConcernScorer.scoreForConcerns(b, aiQuiz);
                    return bScore - aScore;
                });

            const buckets = this.bucketByCategory(sortedSafe);

            if (!validation.hasCleanser && buckets.cleansers.length > 0) {
                const replacement = buckets.cleansers[0];
                if (replacement) {
                    current.push(replacement);
                }
            }

            if (!validation.hasMoisturizer && buckets.moisturizers.length > 0) {
                const noSpf = buckets.moisturizers.filter(m => !ProductUtils.productSteps(m).includes("protect"));
                const replacement = (noSpf.length > 0 ? noSpf[0] : buckets.moisturizers[0]);
                if (replacement) {
                    current.push(replacement);
                }
            }

            if (!validation.hasProtect && buckets.protects.length > 0) {
                const skinType = aiQuiz.skinAssessment.skinType;

                const compatibleSPF = buckets.protects.filter(p =>
                    SPFUtils.passesSpfQuality(p) &&
                    ProductUtils.productHasSkinType(p, skinType) &&
                    !current.some(existing => ConflictDetector.conflicts(p, existing))
                );

                let replacement = compatibleSPF.length > 0 ? compatibleSPF[0] : null;

                if (!replacement) {
                    const moisturizerSpfCombos = buckets.moisturizers.filter(m => {
                        const steps = ProductUtils.productSteps(m);
                        return steps.includes("moisturize") &&
                            steps.includes("protect") &&
                            SPFUtils.passesSpfQuality(m) &&
                            ProductUtils.productHasSkinType(m, skinType) &&
                            !current.some(existing => ConflictDetector.conflicts(m, existing));
                    });

                    if (moisturizerSpfCombos.length > 0) {
                        replacement = moisturizerSpfCombos[0];

                        current = current.filter(p => !ProductUtils.productSteps(p).includes("moisturize"));
                    }
                }

                if (!replacement) {
                    const anyCompatible = buckets.protects.filter(p =>
                        SPFUtils.passesSpfQuality(p) &&
                        !current.some(existing => ConflictDetector.conflicts(p, existing))
                    );
                    replacement = anyCompatible.length > 0 ? anyCompatible[0] : null;
                }

                if (replacement) {
                    current.push(replacement);
                }
            }

            if (!validation.hasTreatment && buckets.treats.length > 0) {
                const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
                const treatPool = buckets.treats.filter(t => allowEye ? true : !ProductUtils.isEyeProduct(t));

                if (treatPool.length > 0) {
                    const scored = treatPool
                        .map(t => ({ t, s: ConcernScorer.scoreForConcerns(t, aiQuiz) }))
                        .sort((a, b) => b.s - a.s);

                    const replacement = scored[0]?.t;
                    if (replacement) {
                        current.push(replacement);
                    }
                }
            }
        }

        return current;
    }

    static finalSort(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const skinType = aiQuiz.skinAssessment.skinType.toLowerCase();
        const skinTypeScore = (p: Product) => (p.skinType || []).some(s => (s.name || "").toLowerCase().includes(skinType)) ? 1 : 0;
        const concernScore = (p: Product) => ConcernScorer.scoreForConcerns(p, aiQuiz);
        const priceVal = (p: Product) => p.price || 0;
        const incompatCount = (p: Product) => {
            let c = 0;
            for (const q of selection) { if (q.productId !== p.productId && ConflictDetector.conflicts(p, q)) c++; }
            return c;
        };
        const stepOrder = (p: Product) => {
            const steps = ProductUtils.productSteps(p);
            if (steps.includes("cleanse")) return 1;
            if (steps.includes("treat")) return 2;
            if (steps.includes("moisturize")) return 3;
            if (steps.includes("protect")) return 4;
            return 5;
        };
        return selection.slice().sort((a, b) => {
            const st = skinTypeScore(b) - skinTypeScore(a);
            if (st !== 0) return st;
            const cs = concernScore(b) - concernScore(a);
            if (cs !== 0) return cs;
            const pr = priceVal(a) - priceVal(b);
            if (pr !== 0) return pr;
            const ic = incompatCount(a) - incompatCount(b);
            if (ic !== 0) return ic;
            return stepOrder(a) - stepOrder(b);
        });
    }

    private static bucketByCategory(products: Product[]): { cleansers: Product[]; moisturizers: Product[]; protects: Product[]; treats: Product[] } {
        const cleansers: Product[] = [];
        const moisturizers: Product[] = [];
        const protects: Product[] = [];
        const treats: Product[] = [];

        for (const p of products) {
            const steps = ProductUtils.productSteps(p);

            if (steps.some(s => s.includes("cleanse"))) {
                cleansers.push(p);
            } else if (steps.some(s => s.includes("moistur"))) {
                moisturizers.push(p);
            } else if (steps.some(s => s.includes("protect") || s.includes("spf"))) {
                protects.push(p);
            } else if (steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"))) {
                treats.push(p);
            }
        }

        return { cleansers, moisturizers, protects, treats };
    }
}
