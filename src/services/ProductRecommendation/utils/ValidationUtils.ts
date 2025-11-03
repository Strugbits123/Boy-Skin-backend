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

    static passesStrengthFilter(p: Product, skinType: AICompatibleQuizModel["skinAssessment"]["skinType"]): boolean {
        const s = this.parseStrength(p);
        if (s == null) return true;
        if (skinType === "normal") return true;

        const steps = ProductUtils.productSteps(p);
        const inRange = (val: number, min: number, max: number) => val >= min && val <= max;

        for (const stepRaw of steps) {
            const step = stepRaw.toLowerCase();
            if (step.includes("protect") || step.includes("spf")) continue;

            if (step.includes("cleanse")) {
                if (skinType === "oily" && !inRange(s, 2, 4)) return false;
                if (skinType === "dry" && !inRange(s, 1, 2)) return false;
                if (skinType === "combination" && !inRange(s, 1, 2)) return false;
            } else if (step.includes("moistur")) {
                if (skinType === "oily" && !inRange(s, 1, 2)) return false;
                if (skinType === "dry" && !inRange(s, 2, 4)) return false;
                if (skinType === "combination" && !inRange(s, 2, 4)) return false;
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

        const under25 = aiQuiz.demographics.age === "18-25";
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
        const actives = ProductUtils.extractActives(p);
        const exfoliants = [
            "aha", "bha", "glycolic", "salicylic", "lactic", "pha",
            "azelaic", "retinol", "retinal", "vitamin c", "ascorbic", "sulfur"
        ];
        if (actives.some(a => exfoliants.includes(a))) return true;

        const text = [
            p.productName || "",
            p.summary?.plain_text || "",
            ProductUtils.getPrimaryActivesText(p) || "",
            p.format?.name || ""
        ].join(" ").toLowerCase();

        return /exfoliat|peel|resurface|retino(i|l)|azelaic|vitamin\s*c|ascorbic|sulfur/.test(text);
    }

    static respectsExfoliationWith(selection: Product[], candidate?: Product): boolean {
        const list = candidate ? [...selection, candidate] : selection.slice();
        const cleanser = list.find(p => ProductUtils.productSteps(p).includes("cleanse"));
        const cleanserEx = cleanser ? this.isExfoliating(cleanser) : false;
        const exTreats = list.filter(p => ProductUtils.productSteps(p).some(s => s.includes("treat")) && this.isExfoliating(p));
        if (cleanserEx) return exTreats.length === 0;
        return exTreats.length <= 1;
    }
}
