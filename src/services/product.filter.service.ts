import { AICompatibleQuizModel } from "../models/quiz.model";
import Product from "../models/product.model";
import HelperService from "./helper.service";

class ProductFilterService {

    // ✅ NEW: Collect user-friendly notes during filtering process
    private static userNotes: string[] = [];

    private static readonly NON_COMPATIBLE_INGREDIENTS = [
        {
            "name": "Allantoin",
            "non-compatible": [
                "Bisabolol",
                "Niacinamide",
                "Retinol",
                "Sodium Hyaluronate"
            ]
        },
        {
            "name": "Ascorbyl Glucoside",
            "non-compatible": [
                "Ferulic Acid",
                "Niacinamide",
                "Sodium Hyaluronate"
            ]
        },
        {
            "name": "Niacinamide",
            "non-compatible": [
                "Allantoin",
                "Ascorbyl Glucoside",
                "Astaxanthin",
                "Azealic Acid",
                "Bisabolol",
                "Ceramides",
                "Retinol",
                "Sodium Hyaluronate",
                "Tranexamic Acid",
                "Vitamin C"
            ]
        },
        {
            "name": "Sodium Hyaluronate",
            "non-compatible": [
                "Allantoin",
                "Ascorbyl Glucoside",
                "Bisabolol",
                "Ceramides",
                "Niacinamide",
                "Ceramides",
                "Squalene",]
        },
        {
            "name": "Astaxanthin",
            "non-compatible": [
                "Niacinamide",
                "Squalene"
            ]
        },
        {
            "name": "Azealic Acid",
            "non-compatible": [
                "Tranexamic Acid"
            ]
        },
        {
            "name": "Ceramides",
            "non-compatible": [
                "Retinol",
                "Sodium Hyaluronate",
                "Squalene"
            ]
        },
        {
            "name": "Glycolic Acid (AHA)",
            "non-compatible": [
                "Salycilic Acid (BHA)"
            ]
        },
        {
            "name": "Lactic Acid (AHA)",
            "non-compatible": [
                "Salycilic Acid (BHA)"
            ]
        },
        {
            "name": "Retinol",
            "non-compatible": [
                "Peptides",
                "Squalene",
                "Allantoin",
                "Ceramides",
                "Niacinamide"
            ]
        },
        {
            "name": "Vitamin C",
            "non-compatible": [
                "Tranexamic Acid"
            ]
        }
    ]


    private static parseBudgetToNumber(budgetStr: string): number {
        const m = budgetStr.match(/\d+/);
        return m ? parseInt(m[0], 10) : 100;
    }

    private static textIncludesAny(text: string, keywords: string[]): boolean {
        const t = (text || "").toLowerCase();
        return keywords.some(k => t.includes(k.toLowerCase()));
    }

    private static getPrimaryActivesText(p: Product): string {
        try {
            const list = p.primaryActiveIngredients || [];
            return list.map(it => (it?.name || "")).join(" ");
        } catch {
            return "";
        }
    }

    private static expandIngredientVariants(term: string): string[] {
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

    private static textContainsAnyTerm(textNorm: string, term: string): boolean {
        const candidates = this.expandIngredientVariants(term).map(x => HelperService.parseIngredientsPlainText(x).normalized);
        return candidates.some(c => c && textNorm.includes(c));
    }

    private static hasNonCompatibleConflict(p: Product): boolean {
        const primary = this.getPrimaryActivesText(p) || "";
        const full = p.ingredientList?.plain_text || "";
        const corpusNorm = HelperService.parseIngredientsPlainText([primary, full].join(" ")).normalized;

        for (const rule of this.NON_COMPATIBLE_INGREDIENTS as Array<{ name: string; "non-compatible": string[] }>) {
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

    private static extractActives(p: Product): string[] {
        const primary = this.getPrimaryActivesText(p) || "";
        const full = p.ingredientList?.plain_text || "";
        const base = (primary + "\n" + full).toLowerCase();
        const tokens = [
            "retinol", "retinal", "retinoid",
            "benzoyl peroxide", "salicylic", "bha", "glycolic", "aha", "lactic", "pha",
            "azelaic", "sulfur", "vitamin c", "ascorbic",
            "niacinamide", "hyaluronic", "ceramide", "ceramides", "peptide", "zinc oxide",
            "fragrance", "alcohol"
        ];
        return tokens.filter(t => base.includes(t));
    }

    private static isSensitiveSafe(p: Product): boolean {
        const name = p.sensitiveSkinFriendly?.name?.toLowerCase() || "";
        return ["yes", "true", "y", "safe"].some(v => name.includes(v));
    }

    private static productHasSkinType(p: Product, skinType: string): boolean {
        const st = (skinType || "").toLowerCase();
        return (p.skinType || []).some(s => (s.name || "").toLowerCase().includes(st));
    }

    // 🔥 ADVANCED: Normalize step categories from database
    // Handles: "step 1: cleanse", "cleanse", "Cleanse", "CLEANSE", etc.
    private static normalizeStepCategory(rawStep: string): string[] {
        const normalized: string[] = [];
        const lower = rawStep.toLowerCase().trim();

        // Extract pure category from "step X: category" format
        const stepMatch = lower.match(/step\s*\d+\s*:\s*(.+)/);
        const cleanValue = stepMatch ? (stepMatch[1] || '').trim() : lower;

        // Map variations to standard categories
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

    private static productSteps(p: Product): string[] {
        // 🔥 STEP 1: Extract from explicit step field with normalization
        const explicit = (p.step || []).map(s => (s.name || "")).filter(Boolean);
        if (explicit.length > 0) {
            const normalized = explicit.flatMap(step => this.normalizeStepCategory(step));
            if (normalized.length > 0) {
                return Array.from(new Set(normalized)); // Remove duplicates
            }
        }

        // 🔥 STEP 2: Infer from strength rating field
        const strengthText = (p.strengthRatingOfActives || []).map(s => (s.name || '')).join(' ').toLowerCase();
        const inferredFromStrength: string[] = [];
        if (/\bcleanse\b/.test(strengthText)) inferredFromStrength.push('cleanse');
        if (/\bmoistur/i.test(strengthText)) inferredFromStrength.push('moisturize');
        if (/\btreat\b|\bserum\b|\bactive\b/.test(strengthText)) inferredFromStrength.push('treat');
        if (/\bprotect\b|\bspf\b/.test(strengthText)) inferredFromStrength.push('protect');
        if (inferredFromStrength.length > 0) return Array.from(new Set(inferredFromStrength));

        // 🔥 STEP 3: Infer from product name, format, function, summary
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

        // 🔥 STEP 4: Infer from actives
        const actives = this.extractActives(p);
        if (actives.length > 0) return ["treat"];
        if ((p.skinConcern || []).length > 0 || funcTags.length > 0) return ["treat"];

        return [];
    }

    private static extractSpfValueText(p: Product): string {
        const text = [
            p.productName || "",
            p.summary?.plain_text || "",
            this.getPrimaryActivesText(p) || "",
            p.format?.name || ""
        ].join(" ").toLowerCase();
        return text;
    }

    private static getSPFValue(p: Product): number | null {
        const text = this.extractSpfValueText(p);
        const m = text.match(/spf\s*(\d{1,3})/i);
        if (m) {
            const n = parseInt(m[1] || "0", 10);
            return isNaN(n) ? null : n;
        }
        return null;
    }

    private static isBroadSpectrum(p: Product): boolean {
        const text = this.extractSpfValueText(p);
        return /(broad\s*spectrum|pa\+|uva\/?uvb|uv\s*protection)/i.test(text);
    }

    private static passesSpfQuality(p: Product): boolean {
        const steps = this.productSteps(p);
        if (!steps.includes("protect")) return true;
        const spf = this.getSPFValue(p);
        const text = this.extractSpfValueText(p);
        const hasSpfKeyword = /\bspf\b/.test(text);
        const meetsValue = spf !== null && spf >= 30;
        const meetsSpectrum = this.isBroadSpectrum(p);
        return meetsValue || meetsSpectrum || hasSpfKeyword;
    }

    private static isEyeProduct(p: Product): boolean {
        const names = [
            p.productName || "",
            p.summary?.plain_text || "",
            ...(p.function || []).map(f => f.name || "")
        ].join(" ").toLowerCase();
        return /(eye\s*cream|under\s*eye|eye\s*serum|dark\s*circle)/.test(names);
    }

    private static parseStrength(p: Product): number | null {
        const items = p.strengthRatingOfActives || [];
        for (const it of items) {
            const m = (it.name || "").match(/(\d)\s*\/\s*4/);
            if (m) return parseInt((m[1] ?? "0"), 10);
        }
        return null;
    }

    private static passesStrengthFilter(p: Product, skinType: AICompatibleQuizModel["skinAssessment"]["skinType"]): boolean {
        const s = this.parseStrength(p);
        if (s == null) return true;
        if (skinType === "normal") return true;

        const steps = this.productSteps(p);
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

    private static violatesSafety(p: Product, aiQuiz: AICompatibleQuizModel): boolean {
        const actives = this.extractActives(p);

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
            if (this.textIncludesAny(this.getPrimaryActivesText(p) || "", [allergen]) ||
                this.textIncludesAny(p.ingredientList?.plain_text || "", [allergen])) {
                return true;
            }
        }

        return false;
    }

    private static scoreForConcerns(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (this.getPrimaryActivesText(p) || "").toLowerCase();
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
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && this.isSensitiveSafe(p)) score += 0.5;
        return score;
    }

    private static scoreForTreatmentOnly(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (this.getPrimaryActivesText(p) || "").toLowerCase();

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
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && this.isSensitiveSafe(p)) score += 0.5;
        return score;
    }

    private static selectConcernTreatments(aiQuiz: AICompatibleQuizModel, pool: Product[], currentSelection: Product[]): Product[] {
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
            if (!this.respectsExfoliationWith([...currentSelection, ...pick], cand)) continue;
            pick.push(cand);
            if (pick.length >= 3) break;
        }
        return pick;
    }

    private static getActiveFlags(p: Product) {
        const acts = this.extractActives(p);
        const lower = new Set(acts);
        const isRetinoid = lower.has("retinol") || lower.has("retinal") || lower.has("retinoid");
        const isBP = lower.has("benzoyl peroxide");
        const isAHA = lower.has("aha") || lower.has("glycolic") || lower.has("lactic");
        const isBHA = lower.has("bha") || lower.has("salicylic");
        const isAcid = isAHA || isBHA;
        const isVitC = lower.has("vitamin c") || lower.has("ascorbic");
        const isSulfur = lower.has("sulfur");
        const isPrimaryActive = isRetinoid || isBP || isAcid;
        const isTreatment = this.productSteps(p).some(s => s.includes("treat"));
        const isEssential = this.isEssential(p);
        return { isRetinoid, isBP, isAHA, isBHA, isAcid, isVitC, isSulfur, isPrimaryActive, isTreatment, isEssential };
    }

    private static scoreForDropDecision(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const flags = this.getActiveFlags(p);
        const base = flags.isTreatment ? this.scoreForTreatmentOnly(p, aiQuiz) : this.scoreForConcerns(p, aiQuiz);
        const essentialBoost = flags.isEssential ? 1000 : 0;
        const pricePenalty = (p.price || 0) / 1000;
        return base + essentialBoost - pricePenalty;
    }

    /**
     * ✅ CRITICAL: Validate product is safe to add to current selection
     * Step 1: Check product's own ingredients for internal conflicts
     * Step 2: Check product's ingredients against already selected products
     */
    private static isSafeToAdd(candidate: Product, currentSelection: Product[]): boolean {
        // ✅ STEP 1: Check candidate's own ingredients for self-conflicts
        if (this.hasNonCompatibleConflict(candidate)) {
            return false;
        }

        // ✅ STEP 2: Check candidate against each already selected product
        for (const existing of currentSelection) {
            // Check ingredient-level conflicts between candidate and existing
            if (this.hasIngredientConflict(candidate, existing)) {
                return false;
            }
            // Check active-level conflicts (existing logic)
            if (this.conflicts(candidate, existing)) {
                return false;
            }
        }

        return true; // Safe to add
    }

    /**
     * ✅ NEW: Check ingredient-level conflicts between two products
     * Compares ingredients in product A against product B using NON_COMPATIBLE_INGREDIENTS rules
     */
    private static hasIngredientConflict(a: Product, b: Product): boolean {
        // Get ingredient text from both products
        const aPrimary = this.getPrimaryActivesText(a) || "";
        const aFull = a.ingredientList?.plain_text || "";
        const aCorpus = HelperService.parseIngredientsPlainText([aPrimary, aFull].join(" ")).normalized;

        const bPrimary = this.getPrimaryActivesText(b) || "";
        const bFull = b.ingredientList?.plain_text || "";
        const bCorpus = HelperService.parseIngredientsPlainText([bPrimary, bFull].join(" ")).normalized;

        // Check each NON_COMPATIBLE rule
        for (const rule of this.NON_COMPATIBLE_INGREDIENTS as Array<{ name: string; "non-compatible": string[] }>) {
            const ingredientInA = this.textContainsAnyTerm(aCorpus, rule.name);
            const ingredientInB = this.textContainsAnyTerm(bCorpus, rule.name);

            // If ingredient found in product A, check if any incompatible ingredient exists in product B
            if (ingredientInA) {
                for (const incompatible of rule["non-compatible"]) {
                    if (this.textContainsAnyTerm(bCorpus, incompatible)) {
                        return true; // Conflict found: A has ingredient, B has incompatible ingredient
                    }
                }
            }

            // If ingredient found in product B, check if any incompatible ingredient exists in product A
            if (ingredientInB) {
                for (const incompatible of rule["non-compatible"]) {
                    if (this.textContainsAnyTerm(aCorpus, incompatible)) {
                        return true; // Conflict found: B has ingredient, A has incompatible ingredient
                    }
                }
            }
        }

        return false; // No ingredient-level conflicts
    }

    private static conflicts(a: Product, b: Product): boolean {
        // ✅ PRIORITY 1: Check active-level conflicts (existing logic - preserved)
        const A = this.getActiveFlags(a);
        const B = this.getActiveFlags(b);
        if ((A.isRetinoid && B.isBP) || (B.isRetinoid && A.isBP)) return true;
        if ((A.isRetinoid && B.isAcid) || (B.isRetinoid && A.isAcid)) return true;
        if ((A.isRetinoid && B.isVitC) || (B.isRetinoid && A.isVitC)) return true;
        if ((A.isVitC && B.isAcid) || (B.isVitC && A.isAcid)) return true;
        if ((A.isVitC && B.isBP) || (B.isVitC && A.isBP)) return true;
        if ((A.isSulfur && (B.isRetinoid || B.isBP || B.isAcid)) || (B.isSulfur && (A.isRetinoid || A.isBP || A.isAcid))) return true;

        // ✅ PRIORITY 2: Check ingredient-level conflicts (NEW - enhanced protection)
        if (this.hasIngredientConflict(a, b)) return true;

        return false;
    }

    private static enforceSinglePrimaryActive(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const primary = selection.filter(p => this.getActiveFlags(p).isPrimaryActive);
        if (primary.length <= 1) return selection;

        // ✅ ENHANCED: Protect essentials during primary active enforcement
        const essentialPrimaries = primary.filter(p => this.isEssential(p));
        const treatmentPrimaries = primary.filter(p => !this.isEssential(p));

        // If conflict is only in treatments, remove lowest priority treatment
        if (essentialPrimaries.length === 0 || (essentialPrimaries.length === 1 && treatmentPrimaries.length >= 1)) {
            const ranked = treatmentPrimaries
                .map(p => ({ p, s: this.scoreForDropDecision(p, aiQuiz) }))
                .sort((a, b) => b.s - a.s)
                .map(x => x.p);
            const keep = ranked[0];
            if (!keep) return selection;
            return selection.filter(p => {
                const flags = this.getActiveFlags(p);
                if (!flags.isPrimaryActive) return true;
                if (this.isEssential(p)) return true; // Always keep essential
                return p.productId === keep.productId;
            });
        }

        // If conflict involves essentials, rank ALL and keep highest
        const ranked = primary
            .map(p => ({ p, s: this.scoreForDropDecision(p, aiQuiz) + (this.isEssential(p) ? 100 : 0) + (this.getActiveFlags(p).isTreatment ? 1 : 0) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);
        const keep = ranked[0];
        if (!keep) return selection;
        return selection.filter(p => !this.getActiveFlags(p).isPrimaryActive || p.productId === keep.productId);
    }

    private static resolvePairwiseConflicts(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        let changed = true;
        let current = selection.slice();
        while (changed) {
            changed = false;
            outer: for (let i = 0; i < current.length; i++) {
                for (let j = i + 1; j < current.length; j++) {
                    const a: Product = current[i] as Product, b: Product = current[j] as Product;
                    if (!this.conflicts(a, b)) continue;
                    if (!a || !b) continue;

                    // ✅ ENHANCED: Essentials have immunity during conflict resolution
                    const aEss = this.isEssential(a);
                    const bEss = this.isEssential(b);

                    // ✅ NEW: Extra protection for SPF - check if it's well-matched
                    const aIsSPF = this.productSteps(a).includes("protect");
                    const bIsSPF = this.productSteps(b).includes("protect");
                    const skinType = aiQuiz.skinAssessment.skinType;

                    const aSPFMatch = aIsSPF && this.productHasSkinType(a, skinType);
                    const bSPFMatch = bIsSPF && this.productHasSkinType(b, skinType);

                    // If both essential, prefer higher score (rare case)
                    // If one essential, ALWAYS keep essential
                    // Special case: If one is well-matched SPF, prefer keeping it
                    // If neither essential, prefer higher score
                    let drop: Product | null;

                    if (aEss && !bEss) {
                        drop = b;
                        console.log(`🛡️ Conflict: Kept essential ${a.productName}, removed ${b.productName}`);
                    } else if (!aEss && bEss) {
                        drop = a;
                        console.log(`🛡️ Conflict: Kept essential ${b.productName}, removed ${a.productName}`);
                    }
                    // ✅ NEW: Both essential but one is well-matched SPF
                    else if (aEss && bEss && aSPFMatch && !bSPFMatch) {
                        drop = b;
                        console.log(`🛡️ Conflict: Kept well-matched SPF ${a.productName}, removed ${b.productName}`);
                    } else if (aEss && bEss && !aSPFMatch && bSPFMatch) {
                        drop = a;
                        console.log(`🛡️ Conflict: Kept well-matched SPF ${b.productName}, removed ${a.productName}`);
                    }
                    else {
                        const sa = this.scoreForDropDecision(a, aiQuiz);
                        const sb = this.scoreForDropDecision(b, aiQuiz);
                        drop = sa >= sb ? b : a;
                        const keep = drop === a ? b : a;
                        console.log(`⚖️ Conflict: Kept ${keep.productName}, removed ${drop.productName}`);
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

    private static enforceCompatibility(
        aiQuiz: AICompatibleQuizModel,
        selection: Product[],
        candidatePool: Product[] = []
    ): Product[] {
        let current = this.enforceSinglePrimaryActive(aiQuiz, selection);
        current = this.resolvePairwiseConflicts(aiQuiz, current);

        // ✅ NEW: If essential missing after conflict resolution, try to find replacement
        const validation = this.validateEssentials(current);

        if (!validation.isValid && candidatePool.length > 0) {
            console.log('⚠️ Essential missing after compatibility, searching for replacement...');

            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            // Filter candidate pool for safe, compatible products
            let safePool = candidatePool
                .filter(p => !this.violatesSafety(p, aiQuiz))
                .filter(p => this.passesStrengthFilter(p, skinType))
                .filter(p => !current.some(existing => existing.productId === p.productId));

            if (isSensitive) {
                safePool = safePool.filter(p => this.isSensitiveSafe(p));
            }

            // Sort by skin type match + no conflicts with current selection
            const sortedSafe = safePool
                .filter(p => !current.some(existing => this.conflicts(p, existing)))
                .sort((a, b) => {
                    const aMatch = this.productHasSkinType(a, skinType) ? 1 : 0;
                    const bMatch = this.productHasSkinType(b, skinType) ? 1 : 0;
                    if (aMatch !== bMatch) return bMatch - aMatch;

                    const aScore = this.scoreForConcerns(a, aiQuiz);
                    const bScore = this.scoreForConcerns(b, aiQuiz);
                    return bScore - aScore;
                });

            const buckets = this.bucketByCategory(sortedSafe);

            // Try to add missing essentials
            if (!validation.hasCleanser && buckets.cleansers.length > 0) {
                const replacement = buckets.cleansers[0];
                if (replacement) {
                    current.push(replacement);
                    console.log(`✅ Replaced cleanser: ${replacement.productName}`);
                }
            }

            if (!validation.hasMoisturizer && buckets.moisturizers.length > 0) {
                const noSpf = buckets.moisturizers.filter(m => !this.productSteps(m).includes("protect"));
                const replacement = (noSpf.length > 0 ? noSpf[0] : buckets.moisturizers[0]);
                if (replacement) {
                    current.push(replacement);
                    console.log(`✅ Replaced moisturizer: ${replacement.productName}`);
                }
            }

            if (!validation.hasProtect && buckets.protects.length > 0) {
                // ✅ ENHANCED: Check skin type + compatibility before replacing SPF
                const skinType = aiQuiz.skinAssessment.skinType;

                // Filter SPF by: quality + skin type match + no conflicts with current selection
                const compatibleSPF = buckets.protects.filter(p =>
                    this.passesSpfQuality(p) &&
                    this.productHasSkinType(p, skinType) &&
                    !current.some(existing => this.conflicts(p, existing))
                );

                // If skin-type matching SPF found, use it
                let replacement = compatibleSPF.length > 0 ? compatibleSPF[0] : null;

                // If no perfect match, try Moisturizer+SPF combo
                if (!replacement) {
                    const moisturizerSpfCombos = buckets.moisturizers.filter(m => {
                        const steps = this.productSteps(m);
                        return steps.includes("moisturize") &&
                            steps.includes("protect") &&
                            this.passesSpfQuality(m) &&
                            this.productHasSkinType(m, skinType) &&
                            !current.some(existing => this.conflicts(m, existing));
                    });

                    if (moisturizerSpfCombos.length > 0) {
                        replacement = moisturizerSpfCombos[0];
                        console.log(`✅ Replaced SPF with Moisturizer+SPF combo: ${replacement?.productName}`);

                        // Also update moisturizer in current selection if using combo
                        current = current.filter(p => !this.productSteps(p).includes("moisturize"));
                    }
                }

                // Last resort: any SPF that doesn't conflict
                if (!replacement) {
                    const anyCompatible = buckets.protects.filter(p =>
                        this.passesSpfQuality(p) &&
                        !current.some(existing => this.conflicts(p, existing))
                    );
                    replacement = anyCompatible.length > 0 ? anyCompatible[0] : null;
                }

                if (replacement) {
                    current.push(replacement);
                    console.log(`✅ Replaced SPF: ${replacement.productName}`);
                } else {
                    console.warn('⚠️ No compatible SPF replacement found - keeping routine without SPF protection!');
                }
            }

            if (!validation.hasTreatment && buckets.treats.length > 0) {
                const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
                const treatPool = buckets.treats.filter(t => allowEye ? true : !this.isEyeProduct(t));

                if (treatPool.length > 0) {
                    const scored = treatPool
                        .map(t => ({ t, s: this.scoreForConcerns(t, aiQuiz) }))
                        .sort((a, b) => b.s - a.s);

                    const replacement = scored[0]?.t;
                    if (replacement) {
                        current.push(replacement);
                        console.log(`✅ Replaced treatment: ${replacement.productName}`);
                    }
                }
            }
        }

        return current;
    }

    private static finalSort(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const skinType = aiQuiz.skinAssessment.skinType.toLowerCase();
        const skinTypeScore = (p: Product) => (p.skinType || []).some(s => (s.name || "").toLowerCase().includes(skinType)) ? 1 : 0;
        const concernScore = (p: Product) => this.scoreForConcerns(p, aiQuiz);
        const priceVal = (p: Product) => p.price || 0;
        const incompatCount = (p: Product) => {
            let c = 0;
            for (const q of selection) { if (q.productId !== p.productId && this.conflicts(p, q)) c++; }
            return c;
        };
        const stepOrder = (p: Product) => {
            const steps = this.productSteps(p);
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

    private static isExfoliating(p: Product): boolean {
        const actives = this.extractActives(p);
        const exfoliants = [
            "aha", "bha", "glycolic", "salicylic", "lactic", "pha",
            "azelaic", "retinol", "retinal", "vitamin c", "ascorbic", "sulfur"
        ];
        if (actives.some(a => exfoliants.includes(a))) return true;

        const text = [
            p.productName || "",
            p.summary?.plain_text || "",
            this.getPrimaryActivesText(p) || "",
            p.format?.name || ""
        ].join(" ").toLowerCase();

        return /exfoliat|peel|resurface|retino(i|l)|azelaic|vitamin\s*c|ascorbic|sulfur/.test(text);
    }

    /**
     * ✅ ENHANCED: Bucket products by PRIMARY function to avoid duplicates
     * Logic: Product goes into ONE bucket based on its FIRST/PRIMARY step
     * - Multi-function products (e.g., Cleanser with treatment) counted once
     * - Moisturizer+SPF combos go to moisturizers bucket
     */
    private static bucketByCategory(products: Product[]): { cleansers: Product[]; moisturizers: Product[]; protects: Product[]; treats: Product[] } {
        const cleansers: Product[] = [];
        const moisturizers: Product[] = [];
        const protects: Product[] = [];
        const treats: Product[] = [];

        for (const p of products) {
            const steps = this.productSteps(p);

            // ✅ PRIMARY FUNCTION PRIORITY (prevent duplicate categorization)
            // Check in order of routine steps: Cleanse → Treat → Moisturize → Protect

            if (steps.some(s => s.includes("cleanse"))) {
                cleansers.push(p);
                // ✅ STOP: Don't add to other buckets even if has "treat" step
            } else if (steps.some(s => s.includes("moistur"))) {
                moisturizers.push(p);
                // ✅ Can also be SPF combo, but primary bucket is moisturizer
            } else if (steps.some(s => s.includes("protect") || s.includes("spf"))) {
                protects.push(p);
                // ✅ Standalone SPF products
            } else if (steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"))) {
                treats.push(p);
                // ✅ Pure treatment products
            }
        }

        return { cleansers, moisturizers, protects, treats };
    }

    // ✅ ENHANCED: Essential Products ko GUARANTEE karna with MULTI-TIER fallback
    // ✅ NEW: Treatment product is now 4th ESSENTIAL (minimum 1 required)
    private static ensureEssentials(
        aiQuiz: AICompatibleQuizModel,
        filtered: Product[],
        allProducts: Product[]
    ): { cleanser: Product | null; moisturizer: Product | null; protect: Product | null; treatment: Product | null } {
        const buckets = this.bucketByCategory(filtered);

        // ✅ STEP 1: Try from filtered pool first
        let cleanser: Product | null = null;
        let moisturizer: Product | null = null;
        let protect: Product | null = null;

        // Cleanser selection from filtered
        if (buckets.cleansers.length > 0) {
            // ✅ NEW: Validate cleanser is safe (no self-conflicts, no conflicts with empty selection)
            for (const c of buckets.cleansers) {
                if (this.isSafeToAdd(c, [])) {
                    cleanser = c;
                    break;
                }
            }
        }

        // ✅ NEW STRATEGY: Prioritize Moisturizer+SPF combo FIRST for efficiency
        const skinType = aiQuiz.skinAssessment.skinType;

        const moisturizersNoSPF = buckets.moisturizers.filter(m => {
            const steps = this.productSteps(m);
            return steps.includes("moisturize") && !steps.includes("protect");
        });

        const moisturizersWithSPF = buckets.moisturizers.filter(m => {
            const steps = this.productSteps(m);
            return steps.includes("moisturize") &&
                steps.includes("protect") &&
                this.passesSpfQuality(m);
        });

        // Score Moisturizer+SPF combos by skin type match + concern score
        const scoredCombos = moisturizersWithSPF
            .map(m => ({
                m,
                skinMatch: this.productHasSkinType(m, skinType) ? 1 : 0,
                concernScore: this.scoreForConcerns(m, aiQuiz)
            }))
            .sort((a, b) => {
                if (a.skinMatch !== b.skinMatch) return b.skinMatch - a.skinMatch;
                return b.concernScore - a.concernScore;
            });

        const protectsStandalone = buckets.protects.filter(p => {
            const steps = this.productSteps(p);
            return steps.includes("protect") &&
                !steps.includes("moisturize") &&
                this.passesSpfQuality(p);
        });

        // Score standalone SPF by skin type match
        const scoredSPF = protectsStandalone
            .map(p => ({
                p,
                skinMatch: this.productHasSkinType(p, skinType) ? 1 : 0,
                concernScore: this.scoreForConcerns(p, aiQuiz)
            }))
            .sort((a, b) => {
                if (a.skinMatch !== b.skinMatch) return b.skinMatch - a.skinMatch;
                return b.concernScore - a.concernScore;
            });

        // ✅ PRIORITY 1: Try best Moisturizer+SPF combo (covers both needs)
        if (scoredCombos.length > 0) {
            // Build current selection for validation
            const currentSelection = cleanser ? [cleanser] : [];

            // Find first combo that's safe to add
            for (const combo of scoredCombos) {
                if (this.isSafeToAdd(combo.m, currentSelection)) {
                    moisturizer = combo.m;
                    protect = combo.m;
                    console.log(`✅ Selected Moisturizer+SPF combo: ${combo.m.productName}`);
                    break;
                }
            }
        }
        // PRIORITY 2: Separate moisturizer + best SPF
        if (!moisturizer && !protect && moisturizersNoSPF.length > 0 && scoredSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];

            // Try to find safe moisturizer
            for (const m of moisturizersNoSPF) {
                if (this.isSafeToAdd(m, currentSelection)) {
                    moisturizer = m;
                    break;
                }
            }

            // Try to find safe SPF
            if (moisturizer) {
                currentSelection.push(moisturizer);
            }
            for (const spfItem of scoredSPF) {
                if (this.isSafeToAdd(spfItem.p, currentSelection)) {
                    protect = spfItem.p;
                    break;
                }
            }
        }
        // PRIORITY 3: Just moisturizer (SPF will be handled in fallback)
        else if (!moisturizer && moisturizersNoSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];
            for (const m of moisturizersNoSPF) {
                if (this.isSafeToAdd(m, currentSelection)) {
                    moisturizer = m;
                    break;
                }
            }
        }
        // PRIORITY 4: Just SPF (moisturizer will be handled in fallback)
        else if (!protect && scoredSPF.length > 0) {
            const currentSelection = cleanser ? [cleanser] : [];
            if (moisturizer) currentSelection.push(moisturizer);

            for (const spfItem of scoredSPF) {
                if (this.isSafeToAdd(spfItem.p, currentSelection)) {
                    protect = spfItem.p;
                    break;
                }
            }
        }

        // ✅ STEP 2: Relaxed backfill (safety + strength + PREFER skin type + SENSITIVE CHECK)
        if (!cleanser || !moisturizer || !protect) {
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            let relaxedPool = allProducts
                .filter(p => !this.violatesSafety(p, aiQuiz))
                .filter(p => this.passesStrengthFilter(p, skinType));

            // ✅ CRITICAL: Apply sensitive filter if user is sensitive
            if (isSensitive) {
                relaxedPool = relaxedPool.filter(p => this.isSensitiveSafe(p));
            }

            // ✅ FIX: Sort by skin type match (perfect match first, then others)
            const sortedPool = relaxedPool.sort((a, b) => {
                const aMatch = this.productHasSkinType(a, skinType) ? 1 : 0;
                const bMatch = this.productHasSkinType(b, skinType) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;

                // Secondary: prefer higher concern score
                const aScore = this.scoreForConcerns(a, aiQuiz);
                const bScore = this.scoreForConcerns(b, aiQuiz);
                return bScore - aScore;
            });

            const relaxedBuckets = this.bucketByCategory(sortedPool);

            if (!cleanser && relaxedBuckets.cleansers.length > 0) {
                const currentSelection: Product[] = [];
                if (moisturizer) currentSelection.push(moisturizer);
                if (protect && protect !== moisturizer) currentSelection.push(protect);

                const scored = relaxedBuckets.cleansers
                    .map(c => ({ c, s: this.scoreForConcerns(c, aiQuiz) }))
                    .sort((a, b) => b.s - a.s);

                // Find first cleanser that's safe to add
                for (const item of scored) {
                    if (this.isSafeToAdd(item.c, currentSelection)) {
                        cleanser = item.c;
                        break;
                    }
                }
            }

            if (!moisturizer || !protect) {
                const relMoistNoSpf = relaxedBuckets.moisturizers.filter(m => {
                    const steps = this.productSteps(m);
                    return steps.includes("moisturize") && !steps.includes("protect");
                });
                const relMoistWithSpf = relaxedBuckets.moisturizers.filter(m => {
                    const steps = this.productSteps(m);
                    return steps.includes("moisturize") && steps.includes("protect") && this.passesSpfQuality(m);
                });
                const relProtects = relaxedBuckets.protects.filter(p => {
                    const steps = this.productSteps(p);
                    return steps.includes("protect") && this.passesSpfQuality(p);
                });

                // Build current selection for validation
                const currentSelection: Product[] = [];
                if (cleanser) currentSelection.push(cleanser);

                if (!moisturizer && !protect) {
                    // Try combo first
                    for (const combo of relMoistWithSpf) {
                        if (this.isSafeToAdd(combo, currentSelection)) {
                            moisturizer = combo;
                            protect = combo;
                            break;
                        }
                    }

                    // If combo failed, try separate
                    if (!moisturizer && !protect && relMoistNoSpf.length > 0 && relProtects.length > 0) {
                        for (const m of relMoistNoSpf) {
                            if (this.isSafeToAdd(m, currentSelection)) {
                                moisturizer = m;
                                break;
                            }
                        }
                        if (moisturizer) currentSelection.push(moisturizer);

                        for (const p of relProtects) {
                            if (this.isSafeToAdd(p, currentSelection)) {
                                protect = p;
                                break;
                            }
                        }
                    }
                } else if (!moisturizer) {
                    if (protect) currentSelection.push(protect);

                    for (const m of relMoistNoSpf) {
                        if (this.isSafeToAdd(m, currentSelection)) {
                            moisturizer = m;
                            break;
                        }
                    }
                } else if (!protect) {
                    if (moisturizer) currentSelection.push(moisturizer);

                    for (const p of relProtects) {
                        if (this.isSafeToAdd(p, currentSelection)) {
                            protect = p;
                            break;
                        }
                    }
                }
            }
        }

        // ✅ STEP 3: EMERGENCY fallback - Safety-only BUT PREFER skin type + SENSITIVE CHECK// ✅ STEP 3: EMERGENCY fallback - Safety-only BUT PREFER skin type + SENSITIVE CHECK
        if (!cleanser || !moisturizer || !protect) {
            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            let emergencyPool = allProducts.filter(p => !this.violatesSafety(p, aiQuiz));

            // ✅ CRITICAL: Apply sensitive filter if user is sensitive
            if (isSensitive) {
                emergencyPool = emergencyPool.filter(p => this.isSensitiveSafe(p));
            }

            // ✅ FIX: Sort by skin type match before picking
            const sortedEmergency = emergencyPool.sort((a, b) => {
                const aMatch = this.productHasSkinType(a, skinType) ? 1 : 0;
                const bMatch = this.productHasSkinType(b, skinType) ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch; // Skin type match priority

                // Secondary: prefer higher concern score
                const aScore = this.scoreForConcerns(a, aiQuiz);
                const bScore = this.scoreForConcerns(b, aiQuiz);
                return bScore - aScore;
            });

            const emergencyBuckets = this.bucketByCategory(sortedEmergency); if (!cleanser && emergencyBuckets.cleansers.length > 0) {
                cleanser = emergencyBuckets.cleansers[0] as Product;
                console.warn('⚠️ EMERGENCY: Using safety-only cleanser fallback');
            }

            if (!moisturizer || !protect) {
                const emMoistNoSpf = emergencyBuckets.moisturizers.filter(m => {
                    const steps = this.productSteps(m);
                    return steps.includes("moisturize") && !steps.includes("protect");
                });
                const emMoistWithSpf = emergencyBuckets.moisturizers.filter(m => {
                    const steps = this.productSteps(m);
                    return steps.includes("moisturize") && steps.includes("protect") && this.passesSpfQuality(m);
                });
                const emProtects = emergencyBuckets.protects.filter(p => this.passesSpfQuality(p));

                if (!moisturizer && !protect && emMoistWithSpf.length > 0) {
                    moisturizer = emMoistWithSpf[0] as Product;
                    protect = emMoistWithSpf[0] as Product;
                    console.warn('⚠️ EMERGENCY: Using safety-only moisturizer+SPF combo');
                } else {
                    if (!moisturizer && emMoistNoSpf.length > 0) {
                        moisturizer = emMoistNoSpf[0] as Product;
                        console.warn('⚠️ EMERGENCY: Using safety-only moisturizer');
                    }
                    if (!protect && emProtects.length > 0) {
                        protect = emProtects[0] as Product;
                        console.warn('⚠️ EMERGENCY: Using safety-only SPF');
                    }
                }
            }
        }

        // ✅ NEW ESSENTIAL: Treatment Product Selection (MINIMUM 1 REQUIRED)
        let treatment: Product | null = null;
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
        let treatPool = buckets.treats.filter(t => allowEye ? true : !this.isEyeProduct(t));

        // Build current selection for validation
        const currentSelectionForTreatment: Product[] = [];
        if (cleanser) currentSelectionForTreatment.push(cleanser);
        if (moisturizer) currentSelectionForTreatment.push(moisturizer);
        if (protect && protect !== moisturizer) currentSelectionForTreatment.push(protect);

        if (treatPool.length > 0) {
            // Score by concern match + exfoliation check + MANDATORY SKIN TYPE MATCH
            const cleanserIsExfoliating = cleanser ? this.isExfoliating(cleanser) : false;
            const skinType = aiQuiz.skinAssessment.skinType;

            const scored = treatPool
                .filter(t => {
                    // Skip if cleanser already exfoliating and this is also exfoliating
                    if (cleanserIsExfoliating && this.isExfoliating(t)) return false;
                    // ✅ Validate safety with current selection
                    if (!this.isSafeToAdd(t, currentSelectionForTreatment)) return false;
                    // ✅ CRITICAL: MANDATORY skin type match for treatments
                    if (!this.productHasSkinType(t, skinType)) return false;
                    return true;
                })
                .map(t => {
                    const concernScore = this.scoreForConcerns(t, aiQuiz);
                    // Skin type already validated in filter, so all products here match
                    return { t, s: concernScore };
                })
                .sort((a, b) => b.s - a.s);

            if (scored.length > 0) {
                treatment = scored[0]?.t || null;
                console.log(`✅ TREATMENT: Selected "${treatment?.productName}" (Skin Type + Concern Matched)`);
            } else {
                const skinType = aiQuiz.skinAssessment.skinType;
                console.warn(`⚠️ TREATMENT: No suitable treatment found matching skin type (${skinType}) + concerns. Treatment will be optional.`);
            }
        }

        // ✅ NO TIER 2/3 FALLBACKS - If no proper match found, treatment stays null
        // Treatment is OPTIONAL - User gets 3 core essentials (Cleanser + Moisturizer + SPF)
        if (!treatment) {
            console.warn('📝 NOTE: Treatment product skipped - no suitable match found for user requirements.');
        }

        // ✅ CRITICAL: SPF FALLBACK with Moisturizer+SPF combo if skin type mismatch
        if (protect && !this.productHasSkinType(protect, skinType)) {
            console.warn(`⚠️ SPF (${protect.productName}) doesn't match skin type (${skinType}). Searching for Moisturizer+SPF combo...`);

            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";
            let searchPool = allProducts
                .filter(p => !this.violatesSafety(p, aiQuiz))
                .filter(p => this.passesStrengthFilter(p, skinType));

            if (isSensitive) {
                searchPool = searchPool.filter(p => this.isSensitiveSafe(p));
            }

            const moisturizerSpfCombos = searchPool.filter(p => {
                const steps = this.productSteps(p);
                return steps.includes("moisturize") &&
                    steps.includes("protect") &&
                    this.productHasSkinType(p, skinType) &&
                    this.passesSpfQuality(p);
            });

            if (moisturizerSpfCombos.length > 0) {
                const scored = moisturizerSpfCombos
                    .map(m => ({ m, s: this.scoreForConcerns(m, aiQuiz) }))
                    .sort((a, b) => b.s - a.s);

                const bestCombo = scored[0]?.m;
                if (bestCombo) {
                    console.log(`✅ SPF FALLBACK: Replacing with ${bestCombo.productName} (Moisturizer+SPF combo matching ${skinType})`);
                    moisturizer = bestCombo;
                    protect = bestCombo;
                }
            }
        }

        return { cleanser, moisturizer, protect, treatment };
    }

    private static buildRoutineBasics(aiQuiz: AICompatibleQuizModel, filtered: Product[], allProducts: Product[]): Product[] {
        // ✅ STEP 1: First ensure essentials are locked in (NOW INCLUDES TREATMENT)
        const essentials = this.ensureEssentials(aiQuiz, filtered, allProducts);

        const essentialProducts: Product[] = [];
        if (essentials.cleanser) essentialProducts.push(essentials.cleanser);
        if (essentials.moisturizer) essentialProducts.push(essentials.moisturizer);
        if (essentials.protect) essentialProducts.push(essentials.protect);
        // ✅ NEW: Treatment is now essential - ALWAYS include if found
        if (essentials.treatment) essentialProducts.push(essentials.treatment);

        // ✅ STEP 2: Now add ADDITIONAL treatments (beyond the 1 essential treatment)
        const buckets = this.bucketByCategory(filtered);
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
        const treatPool = buckets.treats.filter(t => allowEye ? true : !this.isEyeProduct(t));

        // ✅ Filter out the essential treatment to avoid duplicates
        const essentialTreatmentId = essentials.treatment?.productId;
        const additionalTreatPool = treatPool.filter(t => t.productId !== essentialTreatmentId);

        let pickTreats = this.selectConcernTreatments(aiQuiz, additionalTreatPool, essentialProducts);

        // ✅ Exfoliation safety check
        const chosenCleanser = essentials.cleanser;
        if (chosenCleanser && this.isExfoliating(chosenCleanser)) {
            pickTreats = pickTreats.filter(t => !this.isExfoliating(t));
        } else {
            const exfoliatingTreatments = pickTreats.filter(t => this.isExfoliating(t));
            if (exfoliatingTreatments.length > 1) {
                const firstEx = exfoliatingTreatments[0];
                if (firstEx) {
                    pickTreats = pickTreats.filter(t => !this.isExfoliating(t) || t.productId === firstEx.productId);
                }
            }
        }

        const finalPick: Product[] = [];
        for (const p of [...essentialProducts, ...pickTreats]) {
            if (!finalPick.find(x => x.productId === p.productId)) finalPick.push(p);
        }
        return finalPick;
    }

    private static getBudgetBounds(aiQuiz: AICompatibleQuizModel): { ceil: number; floor: number } {
        const raw = this.parseBudgetToNumber(aiQuiz.preferences.budget);
        const ceil = Math.min(raw, 200);
        // ✅ CONSERVATIVE: Reduce floor from 75% → 65% → 55% for better reliability
        // Prevents over-optimization that causes compatibility issues
        const floor = Math.round((ceil * 0.55) * 100) / 100;
        return { ceil, floor };
    }

    private static totalCost(products: Product[]): number {
        return Math.round((products.reduce((a, p) => a + (p.price || 0), 0)) * 100) / 100;
    }

    private static isEssential(p: Product): boolean {
        const steps = this.productSteps(p);
        // ✅ Core essentials: cleanser, moisturizer, SPF
        // Note: Treatments are handled separately in splitEssentialsAndTreats
        return steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
    }

    private static splitEssentialsAndTreats(products: Product[]): { essentials: Product[]; treats: Product[] } {
        const essentials: Product[] = [];
        const treats: Product[] = [];

        // ✅ NEW LOGIC: Keep at least 1 treatment in essentials, rest in treats
        let treatmentCount = 0;

        for (const p of products) {
            const steps = this.productSteps(p);
            const isCorEssential = steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
            const isTreatment = steps.includes("treat") || steps.includes("serum") || steps.includes("active");

            if (isCorEssential) {
                essentials.push(p);
            } else if (isTreatment) {
                // ✅ CRITICAL: First treatment goes to essentials, rest to treats
                if (treatmentCount === 0) {
                    essentials.push(p);
                    treatmentCount++;
                } else {
                    treats.push(p);
                }
            } else {
                treats.push(p);
            }
        }

        return { essentials, treats };
    }

    private static respectsExfoliationWith(selection: Product[], candidate?: Product): boolean {
        const list = candidate ? [...selection, candidate] : selection.slice();
        const cleanser = list.find(p => this.productSteps(p).includes("cleanse"));
        const cleanserEx = cleanser ? this.isExfoliating(cleanser) : false;
        const exTreats = list.filter(p => this.productSteps(p).some(s => s.includes("treat")) && this.isExfoliating(p));
        if (cleanserEx) return exTreats.length === 0;
        return exTreats.length <= 1;
    }

    // ✅ ENHANCED: Budget enforcement with ABSOLUTE ESSENTIAL PROTECTION
    private static enforceBudget(aiQuiz: AICompatibleQuizModel, current: Product[], candidatePool: Product[]): Product[] {
        const { ceil, floor } = this.getBudgetBounds(aiQuiz);
        const uniqueById = (arr: Product[]) => {
            const seen = new Set<string>();
            const out: Product[] = [];
            for (const p of arr) {
                if (!seen.has(p.productId)) {
                    seen.add(p.productId);
                    out.push(p);
                }
            }
            return out;
        };

        let selection = uniqueById(current);
        let total = this.totalCost(selection);

        // ✅ CRITICAL: Separate essentials and treatments
        let { essentials, treats } = this.splitEssentialsAndTreats(selection);

        // ✅ STEP 1: GUARANTEE core essentials presence (TREATMENT NOW OPTIONAL)
        const hasCleanser = essentials.some(p => this.productSteps(p).includes("cleanse"));
        const hasMoisturizer = essentials.some(p => this.productSteps(p).includes("moisturize"));
        const hasProtect = essentials.some(p => this.productSteps(p).includes("protect"));
        // ✅ UPDATED: Treatment is OPTIONAL (nice to have, not mandatory)
        const hasTreatment = essentials.some(p => {
            const steps = this.productSteps(p);
            return steps.includes("treat") || steps.includes("serum") || steps.includes("active");
        });

        if (!hasCleanser || !hasMoisturizer || !hasProtect) {
            console.warn('⚠️ BUDGET: Missing core essentials (Cleanser/Moisturizer/SPF), forcing backfill...');
            const backupEssentials = this.ensureEssentials(aiQuiz, candidatePool, candidatePool);

            if (!hasCleanser && backupEssentials.cleanser) {
                essentials.push(backupEssentials.cleanser);
            }
            if (!hasMoisturizer && backupEssentials.moisturizer) {
                essentials.push(backupEssentials.moisturizer);
            }
            if (!hasProtect && backupEssentials.protect) {
                const alreadyAdded = essentials.some(e => e.productId === backupEssentials.protect?.productId);
                if (!alreadyAdded) {
                    essentials.push(backupEssentials.protect);
                }
            }
            // ✅ Treatment backfill is OPTIONAL - only add if available and properly matched
            if (!hasTreatment && backupEssentials.treatment) {
                console.log('✅ BUDGET: Adding treatment from backup (optional essential)');
                essentials.push(backupEssentials.treatment);
            }

            selection = [...essentials, ...treats];
            total = this.totalCost(selection);
        }

        // ✅ STEP 2: If over budget - Try to find cheaper alternatives BEFORE removing
        if (total > ceil) {
            console.warn(`⚠️ BUDGET: Over budget (${total}/${ceil}), searching for budget-friendly alternatives...`);

            const skinType = aiQuiz.skinAssessment.skinType;
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";
            let replacementAttempted = false;
            let replacementSuccessful = false;

            // Try to replace expensive treatments with cheaper concern-matched alternatives
            for (const treatment of treats) {
                if (total <= ceil) break;

                const budgetRemaining = ceil - this.totalCost(essentials);
                const maxPriceForTreatment = budgetRemaining - this.totalCost(treats.filter(t => t.productId !== treatment.productId));

                // Search for cheaper alternative that matches concerns + skin type + safety
                const alternativePool = candidatePool.filter((p: Product) => {
                    if (p.productId === treatment.productId) return false; // Skip same product
                    if ((p.price || 0) >= (treatment.price || 0)) return false; // Must be cheaper
                    if ((p.price || 0) > maxPriceForTreatment) return false; // Must fit budget
                    if (this.violatesSafety(p, aiQuiz)) return false; // Safety check
                    if (!this.productHasSkinType(p, skinType)) return false; // Skin type match
                    if (isSensitive && !this.isSensitiveSafe(p)) return false; // Sensitive-safe check
                    return true;
                });

                const alternativeBuckets = this.bucketByCategory(alternativePool);
                const alternativeTreats = alternativeBuckets.treats;

                if (alternativeTreats.length > 0) {
                    replacementAttempted = true;

                    // Score alternatives by concern match + skin type match
                    const scoredAlternatives = alternativeTreats
                        .filter(alt => {
                            // Check compatibility with existing essentials + other treatments
                            const currentSelection = [...essentials, ...treats.filter(t => t.productId !== treatment.productId)];
                            return this.isSafeToAdd(alt, currentSelection);
                        })
                        .map(alt => {
                            const concernScore = this.scoreForConcerns(alt, aiQuiz);
                            const skinTypeMatch = this.productHasSkinType(alt, skinType) ? 2.0 : 0;
                            const totalScore = concernScore + skinTypeMatch;
                            return { alt, s: totalScore, price: alt.price || 0 };
                        })
                        .sort((a, b) => {
                            // Prioritize: Higher score first, then cheaper price
                            if (b.s !== a.s) return b.s - a.s;
                            return a.price - b.price;
                        });

                    if (scoredAlternatives.length > 0 && scoredAlternatives[0]) {
                        const bestAlternative = scoredAlternatives[0].alt;

                        // Replace expensive treatment with cheaper alternative
                        treats = treats.map(t => t.productId === treatment.productId ? bestAlternative : t);
                        selection = [...essentials, ...treats];
                        total = this.totalCost(selection);
                        replacementSuccessful = true;

                        console.log(`✅ BUDGET OPTIMIZATION: Replaced "${treatment.productName}" ($${treatment.price}) with "${bestAlternative.productName}" ($${bestAlternative.price})`);
                    }
                }
            }

            // ❌ If NO suitable cheaper alternatives found - Keep current selection + Add note
            if (total > ceil) {
                if (replacementAttempted && !replacementSuccessful) {
                    console.warn(`⚠️ BUDGET: No suitable cheaper alternatives found that match your skin needs. Keeping best-match products.`);

                    // Add user-friendly note explaining the situation
                    const budgetNote = `Your personalized routine ($${total}) slightly exceeds your budget ($${ceil}) because we prioritized products that best match your skin type (${skinType}) and concerns. We couldn't find cheaper alternatives that would provide the same quality results while maintaining safety and effectiveness. Consider adjusting your budget or we can remove treatment products (not recommended for optimal results).`;

                    // Store note for response (you can add this to return object)
                    (selection as any).budgetNote = budgetNote;

                    console.log(`📝 USER NOTE: ${budgetNote}`);
                } else {
                    console.warn(`⚠️ BUDGET: Over budget (${total}/${ceil}) - keeping all essentials for best results!`);
                }
            }

            return selection;
        }

        // ✅ If under floor - try to add treatments (WITH COMPATIBILITY CHECK)
        if (total < floor) {

            const inSel = new Set(selection.map(p => p.productId));
            const candidatesTreats = this.bucketByCategory(candidatePool).treats
                .filter(t => !inSel.has(t.productId));

            const ranked = candidatesTreats
                .map(t => ({ t, s: this.scoreForConcerns(t, aiQuiz) }))
                .sort((a, b) => b.s - a.s)
                .map(x => x.t);

            let addedAny = false;
            let skippedDueToConflicts = 0;

            for (const cand of ranked) {
                // ✅ ENHANCED: Check exfoliation + compatibility before adding
                if (!this.respectsExfoliationWith(selection, cand)) {
                    continue;
                }

                const hasConflict = selection.some(existing => this.conflicts(cand, existing));
                if (hasConflict) {
                    skippedDueToConflicts++;
                    continue;
                }

                const newTotal = this.totalCost([...selection, cand]);
                if (newTotal <= ceil) {
                    selection.push(cand);
                    total = newTotal;
                    addedAny = true;
                    if (total >= floor) break;
                }
            }

            // ✅ NEW: Add user-friendly note if we couldn't optimize budget due to safety
            if (!addedAny && skippedDueToConflicts > 0 && total < floor) {
                const note = `Note: We've carefully selected this routine to ensure all products work safely together for your ${aiQuiz.skinAssessment.skinType.toLowerCase()} ${aiQuiz.skinAssessment.skinSensitivity === 'sensitive' ? 'sensitive' : ''} skin. While we could add more products to use your full budget, we've prioritized ingredient compatibility and safety over maximizing spending. This routine gives you the best results without risking skin irritation or product conflicts.`;
                this.addUserNote(note);
            }
        }

        console.log(`✅ BUDGET: Final $${total}/$${ceil} (${Math.round((total / ceil) * 100)}%)`);
        return selection;
    }

    // ✅ ADVANCED: Validation with comprehensive category checking (NOW INCLUDES TREATMENT)
    private static validateEssentials(selection: Product[]): {
        isValid: boolean;
        hasCleanser: boolean;
        hasMoisturizer: boolean;
        hasProtect: boolean;
        hasTreatment: boolean;
    } {
        // 🔥 BULLETPROOF: Check using normalized steps
        const hasCleanser = selection.some(p => {
            const steps = this.productSteps(p);
            const match = steps.includes("cleanse");
            return match;
        });

        const hasMoisturizer = selection.some(p => {
            const steps = this.productSteps(p);
            const match = steps.includes("moisturize");
            return match;
        });

        const hasProtect = selection.some(p => {
            const steps = this.productSteps(p);
            const match = steps.includes("protect");
            return match;
        });

        // ✅ UPDATED: Treatment validation (OPTIONAL - Nice to have, not mandatory)
        const hasTreatment = selection.some(p => {
            const steps = this.productSteps(p);
            const match = steps.includes("treat") || steps.includes("serum") || steps.includes("active");
            return match;
        });

        return {
            isValid: hasCleanser && hasMoisturizer && hasProtect, // Treatment is OPTIONAL
            hasCleanser,
            hasMoisturizer,
            hasProtect,
            hasTreatment
        };
    }

    // ✅ MAIN ENTRY POINT with BULLETPROOF ESSENTIAL GUARANTEE
    static prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        // ✅ Clear notes from previous filtering runs
        this.clearUserNotes();

        console.log('\n🚀 === PRODUCT FILTERING PIPELINE START ===\n');

        let filtered = allProducts.filter(p => !this.hasNonCompatibleConflict(p));

        filtered = filtered.filter(p => !this.violatesSafety(p, aiQuiz));

        const skinType = aiQuiz.skinAssessment.skinType;
        filtered = filtered.filter(p => this.productHasSkinType(p, skinType));

        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => this.isSensitiveSafe(p));
        }

        filtered = filtered.filter(p => this.passesStrengthFilter(p, skinType));

        // ✅ CRITICAL: Ensure 4 essentials (Cleanser, Moisturizer, SPF, Treatment)
        console.log('\n🔒 === ENSURING 4 ESSENTIAL PRODUCTS ===');
        const preEssentials = this.ensureEssentials(aiQuiz, filtered, allProducts);
        console.log(`Cleanser: ${preEssentials.cleanser?.productName || '❌ MISSING'}`);
        console.log(`Moisturizer: ${preEssentials.moisturizer?.productName || '❌ MISSING'}`);
        console.log(`SPF: ${preEssentials.protect?.productName || '❌ MISSING'}`);
        console.log(`Treatment: ${preEssentials.treatment?.productName || '❌ MISSING'}`);

        const finalPick = this.buildRoutineBasics(aiQuiz, filtered, allProducts);

        const adjusted = this.enforceBudget(aiQuiz, finalPick, filtered);

        console.log('\n🔗 === COMPATIBILITY ENFORCEMENT ===');
        const compatible = this.enforceCompatibility(aiQuiz, adjusted, filtered);

        const validation = this.validateEssentials(compatible);

        let final = compatible;

        // ✅ If core essentials missing after all steps, FORCE add them back
        if (!validation.isValid) {
            console.error('❌ CRITICAL: Core essentials missing after pipeline!');
            console.error(`Missing: Cleanser=${!validation.hasCleanser}, Moisturizer=${!validation.hasMoisturizer}, SPF=${!validation.hasProtect}`);
            if (!validation.hasTreatment) {
                console.warn(`⚠️ Note: Treatment is optional and was not included (no suitable match found)`);
            }

            const backupEssentials = this.ensureEssentials(aiQuiz, allProducts, allProducts);

            if (!validation.hasCleanser && backupEssentials.cleanser) {
                final.push(backupEssentials.cleanser);
            }
            if (!validation.hasMoisturizer && backupEssentials.moisturizer) {
                final.push(backupEssentials.moisturizer);
            }
            if (!validation.hasProtect && backupEssentials.protect) {
                const alreadyAdded = final.some(p => p.productId === backupEssentials.protect?.productId);
                if (!alreadyAdded) {
                    final.push(backupEssentials.protect);
                }
            }
            // ✅ Treatment is OPTIONAL - Only add if available and matched user requirements
            if (!validation.hasTreatment && backupEssentials.treatment) {
                console.log('✅ Adding optional treatment from backup');
                final.push(backupEssentials.treatment);
            }

            // Remove duplicates
            const seen = new Set<string>();
            final = final.filter(p => {
                if (seen.has(p.productId)) return false;
                seen.add(p.productId);
                return true;
            });

            // If budget exceeded due to forced essentials, remove lowest-priority treatments
            const totalCost = this.totalCost(final);
            const { ceil } = this.getBudgetBounds(aiQuiz);
            if (totalCost > ceil) {
                console.warn(`⚠️ Budget exceeded after forced adds (${totalCost}/${ceil}), adjusting...`);
                const { essentials, treats } = this.splitEssentialsAndTreats(final);
                const scored = treats
                    .map(t => ({ t, s: this.scoreForConcerns(t, aiQuiz) }))
                    .sort((a, b) => a.s - b.s);

                let adjusted = [...essentials];
                let cost = this.totalCost(adjusted);

                for (const item of scored.reverse()) {
                    const newCost = cost + (item.t.price || 0);
                    if (newCost <= ceil) {
                        adjusted.push(item.t);
                        cost = newCost;
                    }
                }
                final = adjusted;
                console.log(`✅ Budget balanced: ${this.totalCost(final)}/${ceil}`);
            }
        }

        // ✅ STEP 10: Final minimum count check (at least 3 products)
        if (final.length < 3) {
            console.warn(`⚠️ Less than 3 products (${final.length}), adding fillers...`);
            const safePool = allProducts
                .filter(p => !this.violatesSafety(p, aiQuiz))
                .filter(p => this.passesStrengthFilter(p, skinType));
            const need = 3 - final.length;
            const existingIds = new Set(final.map(p => p.productId));
            const byCat = this.bucketByCategory(safePool.filter(p => !existingIds.has(p.productId)));
            const addables: Product[] = [];

            for (const p of byCat.protects) {
                if (addables.length >= need) break;
                if (!this.passesSpfQuality(p)) continue;
                addables.push(p);
            }
            for (const m of byCat.moisturizers) {
                if (addables.length >= need) break;
                addables.push(m);
            }
            for (const t of byCat.treats) {
                if (addables.length >= need) break;
                if (this.respectsExfoliationWith(final, t)) addables.push(t);
            }
            final = [...final, ...addables.slice(0, need)];
        }

        // ✅ STEP 11: Final sort
        const ordered = this.finalSort(aiQuiz, final);

        // ✅ FINAL VALIDATION CHECK
        console.log('\n📋 === FINAL PRODUCT LIST ===');
        const finalValidation = this.validateEssentials(ordered);

        ordered.forEach((p, idx) => {
            const steps = this.productSteps(p);
            const rawSteps = (p.step || []).map(s => s.name || '');
            console.log(`${idx + 1}. ${p.productName} (${p.price || 0})`);
            console.log(`   📝 Raw steps: [${rawSteps.join(', ')}]`);
            console.log(`   ✅ Normalized: [${steps.join(', ')}]`);
        });

        console.log(`\n💰 Total Cost: $${this.totalCost(ordered)}`);
        console.log(`✅ Essentials Check: Cleanser=${finalValidation.hasCleanser}, Moisturizer=${finalValidation.hasMoisturizer}, SPF=${finalValidation.hasProtect}`);

        if (finalValidation.hasTreatment) {
            console.log(`✅ Treatment: Included (properly matched to user requirements)`);
        } else {
            console.warn(`⚠️ Treatment: Not included (no suitable product matched user's skin type + concerns)`);
        }

        if (!finalValidation.isValid) {
            console.error('\n❌❌❌ CRITICAL ERROR: Core essential products missing after all steps!');
            console.error('Missing:', {
                cleanser: !finalValidation.hasCleanser,
                moisturizer: !finalValidation.hasMoisturizer,
                protect: !finalValidation.hasProtect
            });
            console.error('THIS SHOULD NEVER HAPPEN - INVESTIGATE IMMEDIATELY!');
        } else {
            console.log('\n✅✅✅ ALL CORE ESSENTIALS PRESENT - PIPELINE SUCCESS!\n');
        }

        console.log('🏁 === PRODUCT FILTERING PIPELINE END ===\n');

        return ordered;
    }

    // ✅ NEW: Helper methods for user notes
    static getUserNotes(): string[] {
        return [...this.userNotes]; // Return copy
    }

    static clearUserNotes(): void {
        this.userNotes = [];
    }

    static addUserNote(note: string): void {
        if (note && !this.userNotes.includes(note)) {
            this.userNotes.push(note);
        }
    }
}

export default ProductFilterService;