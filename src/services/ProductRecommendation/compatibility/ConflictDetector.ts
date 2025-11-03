/**
 * Ingredient Conflict Detection
 * Validates product safety through ingredient and active-level conflict checks
 */

import Product from "../../../models/product.model";
import HelperService from "../../helper.service";
import { INGREDIENT_CONFLICTS } from "../data/IngredientConflicts";
import { ProductUtils } from "../utils/ProductUtils";
import { TreatmentScorer } from "../scoring/TreatmentScorer";

export class ConflictDetector {

    static isSafeToAdd(candidate: Product, currentSelection: Product[]): boolean {
        if (ProductUtils.hasNonCompatibleConflict(candidate)) {
            return false;
        }

        for (const existing of currentSelection) {
            if (this.hasIngredientConflict(candidate, existing)) {
                return false;
            }
            if (this.conflicts(candidate, existing)) {
                return false;
            }
        }

        return true;
    }

    static hasIngredientConflict(a: Product, b: Product): boolean {
        const aPrimary = ProductUtils.getPrimaryActivesText(a) || "";
        const aFull = a.ingredientList?.plain_text || "";
        const aCorpus = HelperService.parseIngredientsPlainText([aPrimary, aFull].join(" ")).normalized;

        const bPrimary = ProductUtils.getPrimaryActivesText(b) || "";
        const bFull = b.ingredientList?.plain_text || "";
        const bCorpus = HelperService.parseIngredientsPlainText([bPrimary, bFull].join(" ")).normalized;

        for (const rule of INGREDIENT_CONFLICTS as Array<{ name: string; "non-compatible": string[] }>) {
            const ingredientInA = ProductUtils.textContainsAnyTerm(aCorpus, rule.name);
            const ingredientInB = ProductUtils.textContainsAnyTerm(bCorpus, rule.name);

            if (ingredientInA) {
                for (const incompatible of rule["non-compatible"]) {
                    if (ProductUtils.textContainsAnyTerm(bCorpus, incompatible)) {
                        return true;
                    }
                }
            }

            if (ingredientInB) {
                for (const incompatible of rule["non-compatible"]) {
                    if (ProductUtils.textContainsAnyTerm(aCorpus, incompatible)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    static conflicts(a: Product, b: Product): boolean {
        const A = TreatmentScorer.getActiveFlags(a);
        const B = TreatmentScorer.getActiveFlags(b);
        if ((A.isRetinoid && B.isBP) || (B.isRetinoid && A.isBP)) return true;
        if ((A.isRetinoid && B.isAcid) || (B.isRetinoid && A.isAcid)) return true;
        if ((A.isRetinoid && B.isVitC) || (B.isRetinoid && A.isVitC)) return true;
        if ((A.isVitC && B.isAcid) || (B.isVitC && A.isAcid)) return true;
        if ((A.isVitC && B.isBP) || (B.isVitC && A.isBP)) return true;
        if ((A.isSulfur && (B.isRetinoid || B.isBP || B.isAcid)) || (B.isSulfur && (A.isRetinoid || A.isBP || A.isAcid))) return true;

        if (this.hasIngredientConflict(a, b)) return true;

        return false;
    }
}
