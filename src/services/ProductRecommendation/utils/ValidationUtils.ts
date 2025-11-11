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
        const functions = p.function || [];
        const hasExfoliateFunction = functions.some((f: any) => {
            const funcName = (f.name || "").toLowerCase();
            return funcName.includes("exfoliate") || funcName.includes("spot treatment");
        });
        if (hasExfoliateFunction) return true;

        const actives = ProductUtils.extractActives(p);
        const exfoliatingActives = [
            "aha", "bha", "glycolic", "lactic", "mandelic", "citric", "malic",
            "salicylic", "betaine salicylate", "pha", "gluconolactone",
            "azelaic", "azelaic acid", "kojic", "kojic acid", "arbutin",
            "retinol", "retinal", "retinyl", "retinoate", "granactive retinoid"
        ];
        if (actives.some(a => exfoliatingActives.includes(a))) return true;

        const searchableText = [
            p.productName || "",
            p.summary?.plain_text || "",
            ProductUtils.getPrimaryActivesText(p) || "",
            p.ingredientList?.plain_text || ""
        ].join(" ").toLowerCase();

        const hasExfoliantInText = exfoliatingActives.some(ingredient =>
            searchableText.includes(ingredient)
        );
        if (hasExfoliantInText) return true;

        return /exfoliat|peel|resurface/i.test(searchableText);
    }

    static respectsExfoliationWith(selection: Product[], candidate?: Product): boolean {
        const list = candidate ? [...selection, candidate] : selection.slice();

        // 🔧 FIX: Separate cleanser and treatment identification
        const cleansers = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && !steps.some(s => s.includes("treat"));
        });

        const treatments = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.some(s => s.includes("treat")) && !steps.includes("cleanse");
        });

        // 🔧 FIX: Handle products with multiple steps (cleanse + treat)
        const multiStepProducts = list.filter(p => {
            const steps = ProductUtils.productSteps(p);
            return steps.includes("cleanse") && steps.some(s => s.includes("treat"));
        });

        // Count exfoliating products by category
        const exfoliatingCleansers = cleansers.filter(p => this.isExfoliating(p));
        const exfoliatingTreatments = treatments.filter(p => this.isExfoliating(p));
        const exfoliatingMultiStep = multiStepProducts.filter(p => this.isExfoliating(p));

        const totalExfoliating = exfoliatingCleansers.length + exfoliatingTreatments.length + exfoliatingMultiStep.length;

        const candidateName = candidate?.productName || 'Unknown';
        // console.log(`📋 AI.DOC RULE R6 CHECK: ${candidateName}`);
        // console.log(`   📊 Cleansers Exfoliating: ${exfoliatingCleansers.length} (${exfoliatingCleansers.map(p => p.productName).join(', ') || 'None'})`);
        // console.log(`   📊 Treatments Exfoliating: ${exfoliatingTreatments.length} (${exfoliatingTreatments.map(p => p.productName).join(', ') || 'None'})`);
        // console.log(`   📊 Multi-Step Exfoliating: ${exfoliatingMultiStep.length} (${exfoliatingMultiStep.map(p => p.productName).join(', ') || 'None'})`);
        // console.log(`   📊 Total Exfoliating: ${totalExfoliating}/1 (AI.DOC Rule R6: MAX 1)`);

        // AI.DOC RULE R6: STRICT - Only ONE exfoliating product in entire routine
        if (totalExfoliating > 1) {
            // console.log(`   ❌ RULE R6 VIOLATION: Multiple exfoliating products (${totalExfoliating} > 1)`);
            return false;
        }

        // console.log(`   ✅ RULE R6 COMPLIANT: Single exfoliant rule respected`);
        return true;
    }
}
