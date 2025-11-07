/**
 * Product Utility Functions
 * Core utilities for product validation, text matching, and property extraction
 */

import Product from "../../../models/product.model";
import HelperService from "../../helper.service";
import { INGREDIENT_CONFLICTS } from "../data/IngredientConflicts";

export class ProductUtils {

    static parseBudgetToNumber(budgetStr: string): number {
        const m = budgetStr.match(/\d+/);
        return m ? parseInt(m[0], 10) : 100;
    }

    static textIncludesAny(text: string, keywords: string[]): boolean {
        const t = (text || "").toLowerCase();
        return keywords.some(k => t.includes(k.toLowerCase()));
    }

    static getPrimaryActivesText(p: Product): string {
        try {
            const list = p.primaryActiveIngredients || [];
            return list.map(it => (it?.name || "")).join(" ");
        } catch {
            return "";
        }
    }

    static expandIngredientVariants(term: string): string[] {
        const base = term.trim();
        const t = base.toLowerCase();
        const variants = new Set<string>([base]);

        const add = (v: string) => variants.add(v);

        if (t === "salycilic acid (bha)" || t === "salicylic acid" || t === "bha" || t.includes("salicylic")) {
            add("salicylic acid"); add("bha"); add("salicylic");
        }
        if (t === "azealic acid" || t === "azelaic acid" || t.includes("azelaic")) {
            add("azelaic acid"); add("azelaic");
        }
        if (t === "squalene" || t === "squalane") {
            add("squalane"); add("squalene");
        }
        if (t === "vitamin c" || t === "ascorbic acid" || t.includes("ascor")) {
            add("vitamin c"); add("ascorbic acid"); add("ascorbic");
        }
        if (t === "sodium hyaluronate" || t.includes("hyaluronic")) {
            add("sodium hyaluronate"); add("hyaluronic acid"); add("hyaluronic");
        }
        if (t === "niacinamide" || t === "nicotinamide") {
            add("niacinamide"); add("nicotinamide");
        }
        if (t === "retinol" || t === "retinoid" || t === "retinal") {
            add("retinol"); add("retinoid"); add("retinal");
        }
        if (t.includes("glycolic")) { add("glycolic acid"); add("glycolic"); }
        if (t.includes("lactic")) { add("lactic acid"); add("lactic"); }
        if (t.includes("ceramide")) { add("ceramide"); add("ceramides"); }
        if (t.includes("peptide")) { add("peptide"); add("peptides"); }

        return Array.from(variants);
    }

    static textContainsAnyTerm(textNorm: string, term: string): boolean {
        const candidates = this.expandIngredientVariants(term).map(x => HelperService.parseIngredientsPlainText(x).normalized);
        return candidates.some(c => c && textNorm.includes(c));
    }

    static hasNonCompatibleConflict(p: Product): boolean {
        const primary = this.getPrimaryActivesText(p) || "";
        const full = p.ingredientList?.plain_text || "";
        const corpusNorm = HelperService.parseIngredientsPlainText([primary, full].join(" ")).normalized;

        for (const rule of INGREDIENT_CONFLICTS) {
            const leftHit = this.textContainsAnyTerm(corpusNorm, rule.name);
            if (!leftHit) continue;
            for (const other of rule["non-compatible"]) {
                if (this.textContainsAnyTerm(corpusNorm, other)) {
                    return true;
                }
            }
        }
        return false;
    }

    static extractActives(p: Product): string[] {
        const primary = this.getPrimaryActivesText(p) || "";
        const full = p.ingredientList?.plain_text || "";
        const base = (primary + "\n" + full).toLowerCase();

        // 🔧 EXACT INGREDIENT MATCHING: Use word boundaries to prevent false positives
        const tokens = [
            "retinol", "retinal", "retinoid",
            "benzoyl peroxide", "salicylic acid", "bha", "glycolic acid", "aha", "lactic acid", "pha",
            "azelaic acid", "sulfur", "vitamin c", "ascorbic acid",
            "niacinamide", "hyaluronic acid", "ceramide", "ceramides", "peptide", "zinc oxide",
            "fragrance", "alcohol"
        ];

        return tokens.filter(token => {
            // Create word boundary regex for exact matching
            const regex = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(base);
        });
    }

    static isSensitiveSafe(p: Product): boolean {
        const name = p.sensitiveSkinFriendly?.name?.toLowerCase() || "";
        return ["yes", "true", "y", "safe"].some(v => name.includes(v));
    }

    static productHasSkinType(p: Product, skinType: string): boolean {
        const st = (skinType || "").toLowerCase();
        return (p.skinType || []).some(s => (s.name || "").toLowerCase().includes(st));
    }

    static normalizeStepCategory(rawStep: string): string[] {
        const normalized: string[] = [];
        const lower = rawStep.toLowerCase().trim();

        const stepMatch = lower.match(/step\s*\d+\s*:\s*(.+)/);
        const cleanValue = stepMatch ? (stepMatch[1] || '').trim() : lower;

        if (/cleanse|cleanser|cleansing|wash/.test(cleanValue)) {
            normalized.push('cleanse');
        }
        if (/moistur|hydrat|cream|lotion/.test(cleanValue)) {
            normalized.push('moisturize');
        }
        if (/protect|spf|sunscreen|sun\s*screen/.test(cleanValue)) {
            normalized.push('protect');
        }
        if (/treat|serum|active|target/.test(cleanValue)) {
            normalized.push('treat');
        }
        if (/tone|toner/.test(cleanValue)) {
            normalized.push('tone');
        }
        if (/exfoliat/.test(cleanValue)) {
            normalized.push('exfoliate');
        }

        return normalized;
    }

    static productSteps(p: Product): string[] {
        const explicit = (p.step || []).map(s => (s.name || "")).filter(Boolean);
        if (explicit.length > 0) {
            const normalized = explicit.flatMap(step => this.normalizeStepCategory(step));
            if (normalized.length > 0) {
                return Array.from(new Set(normalized));
            }
        }

        const strengthText = (p.strengthRatingOfActives || []).map(s => (s.name || '')).join(' ').toLowerCase();
        const inferredFromStrength: string[] = [];
        if (/\bcleanse\b/.test(strengthText)) inferredFromStrength.push('cleanse');
        if (/\bmoistur/i.test(strengthText)) inferredFromStrength.push('moisturize');
        if (/\btreat\b|\bserum\b|\bactive\b/.test(strengthText)) inferredFromStrength.push('treat');
        if (/\bprotect\b|\bspf\b/.test(strengthText)) inferredFromStrength.push('protect');
        if (inferredFromStrength.length > 0) return Array.from(new Set(inferredFromStrength));

        const name = (p.productName || "").toLowerCase();
        const format = p.format?.name?.toLowerCase() || "";
        const funcTags = (p.function || []).map(f => (f.name || "").toLowerCase());
        const summary = p.summary?.plain_text?.toLowerCase() || "";
        const ingredientText = p.ingredientList?.plain_text?.toLowerCase() || "";

        const text = [name, format, summary, funcTags.join(" "), ingredientText].join(" ").toLowerCase();

        const isCleanser = /cleanser|face\s*wash|cleansing|wash|foam(ing)?\s*cleanser|gel\s*cleanser/.test(text);
        const isMoisturizer = /moisturi[sz]e|moisturi[sz]er|lotion|cream|hydrating|hydrate\b/.test(text);
        const hasSPF = /\bspf\b|sunscreen|sun\s*screen|broad\s*spectrum|pa\+/.test(text);

        if (isMoisturizer && hasSPF) return ["moisturize", "protect"];
        if (hasSPF) return ["protect"];
        if (isCleanser) return ["cleanse"];
        if (isMoisturizer) return ["moisturize"];

        const actives = this.extractActives(p);
        if (actives.length > 0) return ["treat"];
        if ((p.skinConcern || []).length > 0 || funcTags.length > 0) return ["treat"];

        return [];
    }

    static totalCost(products: Product[]): number {
        return Math.round((products.reduce((a, p) => a + (p.price || 0), 0)) * 100) / 100;
    }

    static isEssential(p: Product): boolean {
        const steps = this.productSteps(p);
        return steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
    }

    static isEyeProduct(p: Product): boolean {
        const names = [
            p.productName || "",
            p.summary?.plain_text || "",
            ...(p.function || []).map(f => f.name || "")
        ].join(" ").toLowerCase();
        return /(eye\s*cream|under\s*eye|eye\s*serum|dark\s*circle)/.test(names);
    }
}
