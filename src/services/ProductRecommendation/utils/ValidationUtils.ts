/**
 * Product Validation Utilities
 * Safety checks, strength filtering, and compatibility validations
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";
import { ProductUtils } from "./ProductUtils";

export class ValidationUtils {

    static parseStrength(p: Product): number | null {
        const items = p.strengthRatingOfActives || [];
        for (const it of items) {
            const m = (it.name || "").match(/(\d)\s*\/\s*4/);
            if (m) return parseInt((m[1] ?? "0"), 10);
        }
        return null;
    }

    static parseStrengthForStep(p: Product, targetStep: string): number | null {
        const items = p.strengthRatingOfActives || [];
        const normalized = targetStep.toLowerCase().trim();

        const stepKeywords: { [key: string]: string[] } = {
            "cleanse": ["cleanse"],
            "moistur": ["moistur"],
            "protect": ["protect"],
            "treat": ["treat"],
            "serum": ["treat", "serum"],
            "active": ["treat", "active"]
        };

        let matchKeywords: string[] = [];
        for (const [key, keywords] of Object.entries(stepKeywords)) {
            if (normalized.includes(key)) {
                matchKeywords = keywords;
                break;
            }
        }

        if (matchKeywords.length === 0) return null;

        for (const it of items) {
            const name = (it.name || "").toLowerCase();
            if (matchKeywords.some(kw => name.includes(kw))) {
                const m = name.match(/(\d)\s*\/\s*4/);
                if (m) return parseInt((m[1] ?? "0"), 10);
            }
        }

        return null;
    }

    static passesStrengthFilter(p: Product, skinType: AICompatibleQuizModel["skinAssessment"]["skinType"]): boolean {
        if (skinType === "normal") return true;

        const steps = ProductUtils.productSteps(p);
        const inRange = (val: number, min: number, max: number) => val >= min && val <= max;

        const isComboProduct = steps.some(s => s.includes("moistur")) && steps.some(s => s.includes("protect") || s.includes("spf"));

        for (const stepRaw of steps) {
            const step = stepRaw.toLowerCase();

            const s = this.parseStrengthForStep(p, step);
            if (s == null) continue;

            if (step.includes("protect") || step.includes("spf")) continue;

            if (step.includes("cleanse")) {
                if (skinType === "oily" && !inRange(s, 2, 4)) return false;
                if (skinType === "dry" && !inRange(s, 1, 2)) return false;
                if (skinType === "combination" && !inRange(s, 1, 2)) return false;
            } else if (step.includes("moistur")) {
                if (isComboProduct) {
                    continue;
                }

                if (skinType === "oily" && !inRange(s, 1, 3)) return false;
                if (skinType === "dry" && !inRange(s, 2, 4)) return false;
                if (skinType === "combination" && !inRange(s, 1, 4)) return false;
            } else if (step.includes("treat") || step.includes("serum") || step.includes("active")) {
                if (skinType === "oily" && !inRange(s, 2, 4)) return false;
                if (skinType === "dry" && !inRange(s, 1, 4)) return false;
                if (skinType === "combination" && !inRange(s, 2, 4)) return false;
            }
        }
        return true;
    }

    static violatesSafety(p: Product, aiQuiz: AICompatibleQuizModel): boolean {
        const actives = ProductUtils.extractActives(p);

        const under25 = aiQuiz.demographics.age === "18-24" || aiQuiz.demographics.age === "13-17";
        if (under25 && (actives.includes("retinol") || actives.includes("retinal") || actives.includes("retinoid"))) return true;

        const hasPreg = aiQuiz.safetyInformation.medicalConditions.includes("pregnant");
        if (hasPreg) {
            if (actives.includes("retinol") || actives.includes("retinal") || actives.includes("retinoid")) return true;
        }

        const hasRosacea = aiQuiz.safetyInformation.medicalConditions.includes("rosacea");
        const hasEczema = aiQuiz.safetyInformation.medicalConditions.includes("eczema");
        if (hasRosacea || hasEczema) {
            const bad = ["alcohol", "fragrance", "retinol", "retinal", "retinoid", "aha", "bha", "glycolic", "salicylic", "benzoyl peroxide"];
            if (actives.some(a => bad.includes(a))) return true;
        }

        const meds = aiQuiz.safetyInformation.currentMedications;
        if (meds.includes("tretinoin") || meds.includes("adapalene") || meds.includes("accutane")) {
            if (["retinol", "retinal", "retinoid", "aha", "bha", "glycolic", "salicylic"].some(a => actives.includes(a))) return true;
        }
        if (meds.includes("benzoyl peroxide")) {
            if (actives.includes("benzoyl peroxide")) return true;
        }
        if (meds.includes("clindamycin")) {
            if (actives.includes("sulfur")) return true;
        }

        for (const allergen of aiQuiz.safetyInformation.knownAllergies) {
            if (ProductUtils.textIncludesAny(ProductUtils.getPrimaryActivesText(p) || "", [allergen]) ||
                ProductUtils.textIncludesAny(p.ingredientList?.plain_text || "", [allergen])) {
                return true;
            }
        }

        return false;
    }

    static isExfoliating(p: Product): boolean {
        // Only check function field for exfoliation detection
        const functions = p.function || [];
        const hasExfoliateFunction = functions.some((f: any) => {
            const funcName = (f.name || "").toLowerCase();
            return funcName.includes("exfoliate") || funcName.includes("spot treatment");
        });
        return hasExfoliateFunction;
    }

    static respectsExfoliationWith(selection: Product[], candidate?: Product): boolean {
        const list = candidate ? [...selection, candidate] : selection.slice();

        const cleansers = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && !steps.some(s => s.includes("treat"));
        });

        const treatments = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.some(s => s.includes("treat")) && !steps.includes("cleanse");
        });

        const multiStepProducts = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && steps.some(s => s.includes("treat"));
        });

        const exfoliatingCleansers = cleansers.filter(p => this.isExfoliating(p));
        const exfoliatingTreatments = treatments.filter(p => this.isExfoliating(p));
        const exfoliatingMultiStep = multiStepProducts.filter(p => this.isExfoliating(p));

        const totalExfoliating = exfoliatingCleansers.length + exfoliatingTreatments.length + exfoliatingMultiStep.length;

        if (totalExfoliating > 1) {
            return false;
        }

        return true;
    }
}
