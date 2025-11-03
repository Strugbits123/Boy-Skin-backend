/**
 * Essential Product Selection Engine
 * Guarantees cleanser, moisturizer, SPF, and treatment through multi-tier fallback system
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "../utils/ProductUtils";
import { SPFUtils } from "../utils/SPFUtils";
import { ValidationUtils } from "../utils/ValidationUtils";
import { ConcernScorer } from "../scoring/ConcernScorer";
import { ConflictDetector } from "../compatibility/ConflictDetector";
import { ProductCategorizer } from "./ProductCategorizer";

export class EssentialSelector {

    private static userNotes: string[] = [];

    static addUserNote(note: string): void {
        if (note && !this.userNotes.includes(note)) {
            this.userNotes.push(note);
        }
    }

    static getUserNotes(): string[] {
        return this.userNotes.slice();
    }

    static clearUserNotes(): void {
        this.userNotes = [];
    }

    static ensureEssentials(
        aiQuiz: AICompatibleQuizModel,
        filtered: Product[],
        allProducts: Product[]
    ): { cleanser: Product | null; moisturizer: Product | null; protect: Product | null; treatment: Product | null } {
        const buckets = ProductCategorizer.bucketByCategory(filtered);

        let cleanser: Product | null = null;
        let moisturizer: Product | null = null;
        let protect: Product | null = null;

        if (buckets.cleansers.length > 0) {
            for (const c of buckets.cleansers) {
                if (ConflictDetector.isSafeToAdd(c, [])) {
                    cleanser = c;
                    break;
                }
            }
        }

        const skinType = aiQuiz.skinAssessment.skinType;

        const moisturizersNoSPF = buckets.moisturizers.filter(m => {
            const steps = ProductUtils.productSteps(m);
            return steps.includes("moisturize") && !steps.includes("protect");
        });

        const moisturizersWithSPF = buckets.moisturizers.filter(m => {
            const steps = ProductUtils.productSteps(m);
            return steps.includes("moisturize") &&
                steps.includes("protect") &&
                SPFUtils.passesSpfQuality(m);
        });

        const scoredCombos = moisturizersWithSPF
            .map(m => ({
                m,
                skinMatch: ProductUtils.productHasSkinType(m, skinType) ? 1 : 0,
                concernScore: ConcernScorer.scoreForConcerns(m, aiQuiz)
            }))
            .sort((a, b) => {
                if (a.skinMatch !== b.skinMatch) return b.skinMatch - a.skinMatch;
                return b.concernScore - a.concernScore;
            });

        const protectsStandalone = buckets.protects.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("protect") &&
                !steps.includes("moisturize") &&
                SPFUtils.passesSpfQuality(p);
        });

        const scoredSPF = protectsStandalone
            .map(p => ({
                p,
                skinMatch: ProductUtils.productHasSkinType(p, skinType) ? 1 : 0,
                concernScore: ConcernScorer.scoreForConcerns(p, aiQuiz)
            }))
            .sort((a, b) => {
                if (a.skinMatch !== b.skinMatch) return b.skinMatch - a.skinMatch;
                return b.concernScore - a.concernScore;
            });

        if (scoredCombos.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];

            for (const combo of scoredCombos) {
                if (ConflictDetector.isSafeToAdd(combo.m, currentSelection)) {
                    moisturizer = combo.m;
                    protect = combo.m;
                    break;
                }
            }
        }

        if (!moisturizer && !protect && moisturizersNoSPF.length > 0 && scoredSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];

            for (const m of moisturizersNoSPF) {
                if (ConflictDetector.isSafeToAdd(m, currentSelection)) {
                    moisturizer = m;
                    break;
                }
            }

            if (moisturizer) {
                currentSelection.push(moisturizer);
            }
            for (const spfItem of scoredSPF) {
                if (ConflictDetector.isSafeToAdd(spfItem.p, currentSelection)) {
                    protect = spfItem.p;
                    break;
                }
            }
        }
        else if (!moisturizer && moisturizersNoSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];
            for (const m of moisturizersNoSPF) {
                if (ConflictDetector.isSafeToAdd(m, currentSelection)) {
                    moisturizer = m;
                    break;
                }
            }
        }
        else if (!protect && scoredSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];
            if (moisturizer) currentSelection.push(moisturizer);

            for (const spfItem of scoredSPF) {
                if (ConflictDetector.isSafeToAdd(spfItem.p, currentSelection)) {
                    protect = spfItem.p;
                    break;
                }
            }
        }

        if (!cleanser || !moisturizer || !protect) {
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            let relaxedPool = allProducts
                .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
                .filter(p => ValidationUtils.passesStrengthFilter(p, skinType));

            if (isSensitive) {
                relaxedPool = relaxedPool.filter(p => ProductUtils.isSensitiveSafe(p));
            }

            const sortedPool = relaxedPool.sort((a, b) => {
                const aMatch = ProductUtils.productHasSkinType(a, skinType) ? 1 : 0;
                const bMatch = ProductUtils.productHasSkinType(b, skinType) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;

                const aScore = ConcernScorer.scoreForConcerns(a, aiQuiz);
                const bScore = ConcernScorer.scoreForConcerns(b, aiQuiz);
                return bScore - aScore;
            });

            const relaxedBuckets = ProductCategorizer.bucketByCategory(sortedPool);

            if (!cleanser && relaxedBuckets.cleansers.length > 0) {
                const currentSelection: Product[] = [];
                if (moisturizer) currentSelection.push(moisturizer);
                if (protect && protect !== moisturizer) currentSelection.push(protect);

                const scored = relaxedBuckets.cleansers
                    .map(c => ({ c, s: ConcernScorer.scoreForConcerns(c, aiQuiz) }))
                    .sort((a, b) => b.s - a.s);

                for (const item of scored) {
                    if (ConflictDetector.isSafeToAdd(item.c, currentSelection)) {
                        cleanser = item.c;
                        break;
                    }
                }
            }

            if (!moisturizer || !protect) {
                const relMoistNoSpf = relaxedBuckets.moisturizers.filter(m => {
                    const steps = ProductUtils.productSteps(m);
                    return steps.includes("moisturize") && !steps.includes("protect");
                });
                const relMoistWithSpf = relaxedBuckets.moisturizers.filter(m => {
                    const steps = ProductUtils.productSteps(m);
                    return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(m);
                });
                const relProtects = relaxedBuckets.protects.filter(p => {
                    const steps = ProductUtils.productSteps(p);
                    return steps.includes("protect") && SPFUtils.passesSpfQuality(p);
                });

                const currentSelection: Product[] = [];
                if (cleanser) currentSelection.push(cleanser);

                if (!moisturizer && !protect) {
                    for (const combo of relMoistWithSpf) {
                        if (ConflictDetector.isSafeToAdd(combo, currentSelection)) {
                            moisturizer = combo;
                            protect = combo;
                            break;
                        }
                    }

                    if (!moisturizer && !protect && relMoistNoSpf.length > 0 && relProtects.length > 0) {
                        for (const m of relMoistNoSpf) {
                            if (ConflictDetector.isSafeToAdd(m, currentSelection)) {
                                moisturizer = m;
                                break;
                            }
                        }
                        if (moisturizer) currentSelection.push(moisturizer);

                        for (const p of relProtects) {
                            if (ConflictDetector.isSafeToAdd(p, currentSelection)) {
                                protect = p;
                                break;
                            }
                        }
                    }
                } else if (!moisturizer) {
                    if (protect) currentSelection.push(protect);

                    for (const m of relMoistNoSpf) {
                        if (ConflictDetector.isSafeToAdd(m, currentSelection)) {
                            moisturizer = m;
                            break;
                        }
                    }
                } else if (!protect) {
                    if (moisturizer) currentSelection.push(moisturizer);

                    for (const p of relProtects) {
                        if (ConflictDetector.isSafeToAdd(p, currentSelection)) {
                            protect = p;
                            break;
                        }
                    }
                }
            }
        }

        if (!cleanser || !moisturizer || !protect) {
            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            let emergencyPool = allProducts.filter(p => !ValidationUtils.violatesSafety(p, aiQuiz));

            if (isSensitive) {
                emergencyPool = emergencyPool.filter(p => ProductUtils.isSensitiveSafe(p));
            }

            const sortedEmergency = emergencyPool.sort((a, b) => {
                const aMatch = ProductUtils.productHasSkinType(a, skinType) ? 1 : 0;
                const bMatch = ProductUtils.productHasSkinType(b, skinType) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;

                const aScore = ConcernScorer.scoreForConcerns(a, aiQuiz);
                const bScore = ConcernScorer.scoreForConcerns(b, aiQuiz);
                return bScore - aScore;
            });

            const emergencyBuckets = ProductCategorizer.bucketByCategory(sortedEmergency);

            if (!cleanser && emergencyBuckets.cleansers.length > 0) {
                cleanser = emergencyBuckets.cleansers[0] as Product;
            }

            if (!moisturizer || !protect) {
                const emMoistNoSpf = emergencyBuckets.moisturizers.filter(m => {
                    const steps = ProductUtils.productSteps(m);
                    return steps.includes("moisturize") && !steps.includes("protect");
                });
                const emMoistWithSpf = emergencyBuckets.moisturizers.filter(m => {
                    const steps = ProductUtils.productSteps(m);
                    return steps.includes("moisturize") && steps.includes("protect") && SPFUtils.passesSpfQuality(m);
                });
                const emProtects = emergencyBuckets.protects.filter(p => SPFUtils.passesSpfQuality(p));

                if (!moisturizer && !protect && emMoistWithSpf.length > 0) {
                    moisturizer = emMoistWithSpf[0] as Product;
                    protect = emMoistWithSpf[0] as Product;
                } else {
                    if (!moisturizer && emMoistNoSpf.length > 0) {
                        moisturizer = emMoistNoSpf[0] as Product;
                    }
                    if (!protect && emProtects.length > 0) {
                        protect = emProtects[0] as Product;
                    }
                }
            }
        }

        let treatment: Product | null = null;
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
        let treatPool = buckets.treats.filter(t => allowEye ? true : !ProductUtils.isEyeProduct(t));

        const currentSelectionForTreatment: Product[] = [];
        if (cleanser) currentSelectionForTreatment.push(cleanser);
        if (moisturizer) currentSelectionForTreatment.push(moisturizer);
        if (protect && protect !== moisturizer) currentSelectionForTreatment.push(protect);

        if (treatPool.length > 0) {
            const cleanserIsExfoliating = cleanser ? ValidationUtils.isExfoliating(cleanser) : false;
            const skinType = aiQuiz.skinAssessment.skinType;

            const scored = treatPool
                .filter(t => {
                    if (cleanserIsExfoliating && ValidationUtils.isExfoliating(t)) return false;
                    if (!ConflictDetector.isSafeToAdd(t, currentSelectionForTreatment)) return false;
                    if (!ProductUtils.productHasSkinType(t, skinType)) return false;
                    return true;
                })
                .map(t => {
                    const concernScore = ConcernScorer.scoreForConcerns(t, aiQuiz);
                    return { t, s: concernScore };
                })
                .sort((a, b) => b.s - a.s);

            if (scored.length > 0) {
                treatment = scored[0]?.t || null;
            } else {
                const skinType = aiQuiz.skinAssessment.skinType;

                const treatmentNote = `Note: We couldn't include a treatment product in your routine because we couldn't find one that matches your ${skinType.toLowerCase()} skin type and addresses your specific concerns safely. We've prioritized your core essentials (cleanser, moisturizer, and SPF) to ensure the best results without compromising on quality or safety.`;
                this.addUserNote(treatmentNote);
            }
        }

        if (protect && !ProductUtils.productHasSkinType(protect, skinType)) {

            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";
            let searchPool = allProducts
                .filter(p => !ValidationUtils.violatesSafety(p, aiQuiz))
                .filter(p => ValidationUtils.passesStrengthFilter(p, skinType));

            if (isSensitive) {
                searchPool = searchPool.filter(p => ProductUtils.isSensitiveSafe(p));
            }

            const moisturizerSpfCombos = searchPool.filter(p => {
                const steps = ProductUtils.productSteps(p);
                return steps.includes("moisturize") &&
                    steps.includes("protect") &&
                    ProductUtils.productHasSkinType(p, skinType) &&
                    SPFUtils.passesSpfQuality(p);
            });

            if (moisturizerSpfCombos.length > 0) {
                const scored = moisturizerSpfCombos
                    .map(m => ({ m, s: ConcernScorer.scoreForConcerns(m, aiQuiz) }))
                    .sort((a, b) => b.s - a.s);

                const bestCombo = scored[0]?.m;
                if (bestCombo) {
                    moisturizer = bestCombo;
                    protect = bestCombo;
                }
            }
        }

        return { cleanser, moisturizer, protect, treatment };
    }
}
