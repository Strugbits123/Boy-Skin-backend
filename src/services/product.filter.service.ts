import { AICompatibleQuizModel } from "../models/quiz.model";
import Product from "../models/product.model";
import HelperService from "./helper.service";

class ProductFilterService {

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

    // (Removed local normalizer; using HelperService.parseIngredientsPlainText().normalized)

    // Expand common synonyms/typos to improve matching robustness
    private static expandIngredientVariants(term: string): string[] {
        const base = term.trim();
        const t = base.toLowerCase();
        const variants = new Set<string>([base]);

        const add = (v: string) => variants.add(v);

        // Common families
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

    // Returns true if product contains a non-compatible pair from chemist rules
    private static hasNonCompatibleConflict(p: Product): boolean {
        const primary = this.getPrimaryActivesText(p) || "";
        const full = p.ingredientList?.plain_text || "";
        const corpusNorm = HelperService.parseIngredientsPlainText([primary, full].join(" ")).normalized;

        for (const rule of this.NON_COMPATIBLE_INGREDIENTS as Array<{ name: string; "non-compatible": string[] }>) {
            const leftHit = this.textContainsAnyTerm(corpusNorm, rule.name);
            if (!leftHit) continue;
            for (const other of rule["non-compatible"]) {
                if (this.textContainsAnyTerm(corpusNorm, other)) {
                    return true; // conflict detected within single product
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

    private static productSteps(p: Product): string[] {
        const explicit = (p.step || []).map(s => (s.name || "").toLowerCase());
        if (explicit.length > 0) return explicit;

        const strengthText = (p.strengthRatingOfActives || []).map(s => (s.name || '')).join(' ').toLowerCase();
        const inferredFromStrength: string[] = [];
        if (/\bcleanse\b/.test(strengthText)) inferredFromStrength.push('cleanse');
        if (/\bmoistur/i.test(strengthText)) inferredFromStrength.push('moisturize');
        if (/\btreat\b|\bserum\b|\bactive\b/.test(strengthText)) inferredFromStrength.push('treat');
        if (/\bprotect\b|\bspf\b/.test(strengthText)) inferredFromStrength.push('protect');
        if (inferredFromStrength.length > 0) return Array.from(new Set(inferredFromStrength));

        // 3) Fallback to name/format/summary/flags
        const name = (p.productName || "").toLowerCase();
        const format = p.format?.name?.toLowerCase() || "";
        const funcTags = (p.function || []).map(f => (f.name || "").toLowerCase());
        const summary = p.summary?.plain_text?.toLowerCase() || "";
        const ingredientText = p.ingredientList?.plain_text?.toLowerCase() || "";

        // Build a text corpus WITHOUT using requiresSPF for SPF detection
        const text = [name, format, summary, funcTags.join(" "), ingredientText].join(" ").toLowerCase();

        const isCleanser = /cleanser|face\s*wash|cleansing|wash|foam(ing)?\s*cleanser|gel\s*cleanser/.test(text);
        const isMoisturizer = /moisturi[sz]e|moisturi[sz]er|lotion|cream|hydrating|hydrate\b/.test(text);
        const hasSPF = /\bspf\b|sunscreen|sun\s*screen|broad\s*spectrum|pa\+/.test(text);

        // Moisturizer with SPF should count as both moisturize and protect
        if (isMoisturizer && hasSPF) return ["moisturize", "protect"];
        if (hasSPF) return ["protect"];
        if (isCleanser) return ["cleanse"];
        if (isMoisturizer) return ["moisturize"];

        const actives = this.extractActives(p);
        if (actives.length > 0) return ["treat"];
        if ((p.skinConcern || []).length > 0 || funcTags.length > 0) return ["treat"];

        return [];
    }

    // ---- SPF Quality Helpers ----
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
        if (!steps.includes("protect")) return true; // only enforce for protect products (incl. moisturizer+SPF)
        const spf = this.getSPFValue(p);
        // Relaxed: pass if SPF value ≥ 30 OR broad-spectrum keywords present
        // If SPF value missing but any 'spf' keyword exists, tentatively allow
        const text = this.extractSpfValueText(p);
        const hasSpfKeyword = /\bspf\b/.test(text);
        const meetsValue = spf !== null && spf >= 30;
        const meetsSpectrum = this.isBroadSpectrum(p);
        return meetsValue || meetsSpectrum || hasSpfKeyword;
    }

    // ---- Eye cream detection ----
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
    // Strength filter per AI.doc + client note: apply after skin-type filter; ignore protect/SPF
    private static passesStrengthFilter(p: Product, skinType: AICompatibleQuizModel["skinAssessment"]["skinType"]): boolean {
        const s = this.parseStrength(p);
        if (s == null) return true; // if unknown, don't exclude
        if (skinType === "normal") return true; // all fine

        const steps = this.productSteps(p);
        const inRange = (val: number, min: number, max: number) => val >= min && val <= max;

        for (const stepRaw of steps) {
            const step = stepRaw.toLowerCase();
            if (step.includes("protect") || step.includes("spf")) continue; // no SPF constraint in spec

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
            // Client note: salicylic/BHA are allowed during pregnancy → do not block
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

        // Client note: weighting changed to 90/10
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

    // Treatments override: score using 100% Primary Active Ingredients per AI.doc (I3 treatment override)
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
            const s1 = scoreList(txtPrimary, acts) * 1.0; // 100% primary actives
            const boost = primary.includes(c) ? 1 : 0;
            score += s1 + boost;
        }
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && this.isSensitiveSafe(p)) score += 0.5;
        return score;
    }

    // Select concern-relevant treatments respecting exfoliation and existing selection
    private static selectConcernTreatments(aiQuiz: AICompatibleQuizModel, pool: Product[], currentSelection: Product[]): Product[] {
        const ranked = pool
            .map(t => ({ t, s: this.scoreForTreatmentOnly(t, aiQuiz) }))
            .sort((a, b) => {
                if (b.s !== a.s) return b.s - a.s; // higher concern score first
                const pa = a.t.price || 0, pb = b.t.price || 0;
                if (pa !== pb) return pa - pb; // cheaper preferred
                return (a.t.productName || "").localeCompare(b.t.productName || "");
            })
            .map(x => x.t);

        const pick: Product[] = [];
        for (const cand of ranked) {
            if (!this.respectsExfoliationWith([...currentSelection, ...pick], cand)) continue;
            pick.push(cand);
            // Keep treatments unbounded here; budget step will trim. If needed, cap to 3:
            if (pick.length >= 3) break;
        }
        return pick;
    }

    // ---- Cross-product Compatibility (AI.doc Phase 5) ----
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
        const isPrimaryActive = isRetinoid || isBP || isAcid; // as per doc single-primary set
        const isTreatment = this.productSteps(p).some(s => s.includes("treat"));
        const isEssential = this.isEssential(p);
        return { isRetinoid, isBP, isAHA, isBHA, isAcid, isVitC, isSulfur, isPrimaryActive, isTreatment, isEssential };
    }

    private static scoreForDropDecision(p: Product, aiQuiz: AICompatibleQuizModel): number {
        // Higher is better to KEEP. We'll drop the lower one.
        const flags = this.getActiveFlags(p);
        const base = flags.isTreatment ? this.scoreForTreatmentOnly(p, aiQuiz) : this.scoreForConcerns(p, aiQuiz);
        const essentialBoost = flags.isEssential ? 1000 : 0; // hard-prefer essentials to never drop
        const pricePenalty = (p.price || 0) / 1000; // tiny influence to keep cheaper ones when equal
        return base + essentialBoost - pricePenalty;
    }

    private static conflicts(a: Product, b: Product): boolean {
        const A = this.getActiveFlags(a);
        const B = this.getActiveFlags(b);
        // Group 1: retinoids conflicts
        if ((A.isRetinoid && B.isBP) || (B.isRetinoid && A.isBP)) return true;
        if ((A.isRetinoid && B.isAcid) || (B.isRetinoid && A.isAcid)) return true;
        if ((A.isRetinoid && B.isVitC) || (B.isRetinoid && A.isVitC)) return true;
        // Group 2: Vitamin C conflicts
        if ((A.isVitC && B.isAcid) || (B.isVitC && A.isAcid)) return true;
        if ((A.isVitC && B.isBP) || (B.isVitC && A.isBP)) return true;
        // Group 3: Sulfur conflicts
        if ((A.isSulfur && (B.isRetinoid || B.isBP || B.isAcid)) || (B.isSulfur && (A.isRetinoid || A.isBP || A.isAcid))) return true;
        return false;
    }

    private static enforceSinglePrimaryActive(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const primary = selection.filter(p => this.getActiveFlags(p).isPrimaryActive);
        if (primary.length <= 1) return selection;
        // Keep only one with highest keep-score; prefer treatments
        const ranked = primary
            .map(p => ({ p, s: this.scoreForDropDecision(p, aiQuiz) + (this.getActiveFlags(p).isTreatment ? 1 : 0) }))
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
                    const sa = this.scoreForDropDecision(a as Product, aiQuiz);
                    const sb = this.scoreForDropDecision(b, aiQuiz);
                    // Never drop essentials when conflicting with non-essentials
                    const aEss = this.getActiveFlags(a).isEssential;
                    const bEss = this.getActiveFlags(b).isEssential;
                    let drop: Product | null;
                    if (aEss && !bEss) drop = b; else if (!aEss && bEss) drop = a; else drop = sa >= sb ? b : a;
                    if (!drop) continue;
                    current = current.filter(p => p.productId !== drop.productId);
                    changed = true;
                    break outer;
                }
            }
        }
        return current;
    }

    private static enforceCompatibility(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        let current = this.enforceSinglePrimaryActive(aiQuiz, selection);
        current = this.resolvePairwiseConflicts(aiQuiz, current);
        return current;
    }

    // ---- Final tie-breaker ordering ----
    private static finalSort(aiQuiz: AICompatibleQuizModel, selection: Product[]): Product[] {
        const skinType = aiQuiz.skinAssessment.skinType.toLowerCase();
        const skinTypeScore = (p: Product) => (p.skinType || []).some(s => (s.name || "").toLowerCase().includes(skinType)) ? 1 : 0;
        const concernScore = (p: Product) => this.scoreForConcerns(p, aiQuiz);
        const priceVal = (p: Product) => p.price || 0;
        const incompatCount = (p: Product) => {
            // crude: count how many potential pairs this product would conflict with in the set
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
            const pr = priceVal(a) - priceVal(b); // cheaper first
            if (pr !== 0) return pr;
            const ic = incompatCount(a) - incompatCount(b); // fewer conflicts first
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

    private static bucketByCategory(products: Product[]): { cleansers: Product[]; moisturizers: Product[]; protects: Product[]; treats: Product[] } {
        const cleansers: Product[] = [];
        const moisturizers: Product[] = [];
        const protects: Product[] = [];
        const treats: Product[] = [];
        for (const p of products) {
            const steps = this.productSteps(p);
            if (steps.some(s => s.includes("cleanse"))) cleansers.push(p);
            if (steps.some(s => s.includes("moistur"))) moisturizers.push(p);
            if (steps.some(s => s.includes("protect") || s.includes("spf"))) protects.push(p);
            if (steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"))) treats.push(p);
        }
        return { cleansers, moisturizers, protects, treats };
    }

    private static buildRoutineBasics(aiQuiz: AICompatibleQuizModel, filtered: Product[], allProducts: Product[]): Product[] {
        const buckets = this.bucketByCategory(filtered);

        const pickCleanser: Product[] = buckets.cleansers.length > 0 ? [buckets.cleansers[0] as Product] : [];

        const moisturizersWithSPF = buckets.moisturizers.filter(m => {
            const steps = this.productSteps(m);
            if (!(steps.includes("moisturize") && steps.includes("protect"))) return false;
            return this.passesSpfQuality(m);
        });
        const moisturizersNoSPF = buckets.moisturizers.filter(m => {
            const steps = this.productSteps(m);
            return steps.includes("moisturize") && !steps.includes("protect");
        });

        const protectsStandalone = buckets.protects.filter(p => {
            const steps = this.productSteps(p);
            if (!(steps.includes("protect") && !steps.includes("moisturize"))) return false;
            return this.passesSpfQuality(p);
        });

        let pickMoisturizer: Product[] = [];
        let pickProtect: Product[] = [];

        // Enforce minimum 3 products: prefer separate moisturizer (no SPF) and standalone protect
        if (moisturizersNoSPF.length > 0 && protectsStandalone.length > 0) {
            pickMoisturizer = [moisturizersNoSPF[0] as Product];
            pickProtect = [protectsStandalone[0] as Product];
        } else if (moisturizersNoSPF.length > 0) {
            pickMoisturizer = [moisturizersNoSPF[0] as Product];
            // no standalone protect yet; we will rely on treatments to reach min count if protect missing
        } else if (protectsStandalone.length > 0) {
            // no moisturizer without SPF; if a with-SPF moisturizer exists we avoid it to keep room for 3 items
            pickProtect = [protectsStandalone[0] as Product];
        } else if (moisturizersWithSPF.length > 0) {
            // last resort: use moisturizer with SPF (counts as protect); ensure a treatment later to reach 3
            pickMoisturizer = [moisturizersWithSPF[0] as Product];
        }

        // If essentials still missing, do relaxed backfill from safe+strength pool (ignore skin-type/sensitive)
        const relaxedPool = allProducts.filter(p => !this.violatesSafety(p, aiQuiz))
            .filter(p => this.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));
        const relaxedBuckets = this.bucketByCategory(relaxedPool);
        if (pickMoisturizer.length === 0) {
            // prefer no-SPF moisturizer, else with-SPF
            const relMoistNoSpf = relaxedBuckets.moisturizers.filter(m => {
                const steps = this.productSteps(m);
                return steps.includes("moisturize") && !steps.includes("protect");
            });
            const relMoistWithSpf = relaxedBuckets.moisturizers.filter(m => {
                const steps = this.productSteps(m);
                return steps.includes("moisturize") && steps.includes("protect") && this.passesSpfQuality(m);
            });
            if (relMoistNoSpf.length > 0) pickMoisturizer = [relMoistNoSpf[0] as Product];
            else if (relMoistWithSpf.length > 0) pickMoisturizer = [relMoistWithSpf[0] as Product];
        }
        if (pickProtect.length === 0) {
            const relProtects = relaxedBuckets.protects.filter(p => {
                const steps = this.productSteps(p);
                return steps.includes("protect") && this.passesSpfQuality(p);
            });
            if (relProtects.length > 0) pickProtect = [relProtects[0] as Product];
        }

        // Gate eye creams: only allow if user has dark circles in concerns
        const allowEye = aiQuiz.concerns.primary.includes("dark circles") || aiQuiz.concerns.secondary.includes("dark circles");
        const treatPool = buckets.treats.filter(t => allowEye ? true : !this.isEyeProduct(t));
        // Select concern-relevant treatments using treatment override scoring
        let pickTreats = this.selectConcernTreatments(
            aiQuiz,
            treatPool,
            [...pickCleanser, ...pickMoisturizer, ...pickProtect]
        );

        // Ensure minimum of 3 products total; if less, try adding more treatments (respecting rules)
        const essentialsCount = pickCleanser.length + pickMoisturizer.length + pickProtect.length;
        const needCount = Math.max(0, 3 - (essentialsCount + pickTreats.length));
        if (needCount > 0) {
            const alreadyIds = new Set([...pickCleanser, ...pickMoisturizer, ...pickProtect, ...pickTreats].map(p => p.productId));
            const extraPool = treatPool.filter(t => !alreadyIds.has(t.productId));
            const extraRanked = this.selectConcernTreatments(aiQuiz, extraPool, [...pickCleanser, ...pickMoisturizer, ...pickProtect, ...pickTreats]);
            for (const t of extraRanked) {
                if (pickCleanser.concat(pickMoisturizer, pickProtect, pickTreats).length >= 3) break;
                if (!this.respectsExfoliationWith([...pickCleanser, ...pickMoisturizer, ...pickProtect, ...pickTreats], t)) continue;
                pickTreats.push(t);
            }
        }

        const chosenCleanser = pickCleanser[0];
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
        for (const p of [...pickCleanser, ...pickMoisturizer, ...pickProtect, ...pickTreats]) {
            if (!finalPick.find(x => x.productId === p.productId)) finalPick.push(p);
        }
        return finalPick;
    }

    // ---- Budget Management (AI.doc Phase 6 + client note) ----
    private static getBudgetBounds(aiQuiz: AICompatibleQuizModel): { ceil: number; floor: number } {
        const raw = this.parseBudgetToNumber(aiQuiz.preferences.budget);
        const ceil = Math.min(raw, 200); // client: max $200
        const floor = Math.round((ceil * 0.75) * 100) / 100; // 75% lower bound
        return { ceil, floor };
    }

    private static totalCost(products: Product[]): number {
        return Math.round((products.reduce((a, p) => a + (p.price || 0), 0)) * 100) / 100;
    }

    private static isEssential(p: Product): boolean {
        const steps = this.productSteps(p);
        return steps.includes("cleanse") || steps.includes("moisturize") || steps.includes("protect");
    }

    private static splitEssentialsAndTreats(products: Product[]): { essentials: Product[]; treats: Product[] } {
        const essentials: Product[] = [];
        const treats: Product[] = [];
        for (const p of products) {
            if (this.isEssential(p)) essentials.push(p); else treats.push(p);
        }
        return { essentials, treats };
    }

    private static respectsExfoliationWith(selection: Product[], candidate?: Product): boolean {
        const list = candidate ? [...selection, candidate] : selection.slice();
        const cleanser = list.find(p => this.productSteps(p).includes("cleanse"));
        const cleanserEx = cleanser ? this.isExfoliating(cleanser) : false;
        const exTreats = list.filter(p => this.productSteps(p).some(s => s.includes("treat")) && this.isExfoliating(p));
        if (cleanserEx) return exTreats.length === 0; // no exfoliating treatments allowed
        return exTreats.length <= 1; // at most one exfoliating treatment
    }

    private static enforceBudget(aiQuiz: AICompatibleQuizModel, current: Product[], candidatePool: Product[]): Product[] {
        const { ceil, floor } = this.getBudgetBounds(aiQuiz);
        const uniqueById = (arr: Product[]) => {
            const seen = new Set<string>();
            const out: Product[] = [];
            for (const p of arr) { if (!seen.has(p.productId)) { seen.add(p.productId); out.push(p); } }
            return out;
        };

        let selection = uniqueById(current);
        let total = this.totalCost(selection);

        const countIsBelowMin = () => selection.length < 3;

        // If over budget: remove lowest-priority treatments first (by score asc, then price desc)
        if (total > ceil) {
            const { essentials, treats } = this.splitEssentialsAndTreats(selection);
            const scored = treats.map(t => ({ t, s: this.scoreForConcerns(t, aiQuiz) }));
            scored.sort((a, b) => (a.s - b.s) || ((b.t.price || 0) - (a.t.price || 0)));
            for (const item of scored) {
                if (countIsBelowMin()) break; // don't drop below 3 items
                selection = selection.filter(p => p.productId !== item.t.productId);
                total = this.totalCost(selection);
                if (total <= ceil) break;
            }
            // if still over but only essentials remain, return as-is (cannot drop essentials)
            return selection;
        }

        // If under floor: try to add high-priority treatments without breaking rules and without exceeding ceil
        if (total < floor || countIsBelowMin()) {
            const inSel = new Set(selection.map(p => p.productId));
            const candidatesTreats = this.bucketByCategory(candidatePool).treats
                .filter(t => !inSel.has(t.productId));
            const ranked = candidatesTreats
                .map(t => ({ t, s: this.scoreForConcerns(t, aiQuiz) }))
                .sort((a, b) => b.s - a.s)
                .map(x => x.t);

            for (const cand of ranked) {
                if (!this.respectsExfoliationWith(selection, cand)) continue;
                const newTotal = this.totalCost([...selection, cand]);
                if (newTotal <= ceil) {
                    selection.push(cand);
                    total = newTotal;
                    if (total >= floor && !countIsBelowMin()) break;
                }
            }
        }

        return selection;
    }


    static prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        // STEP 1: Chemist-provided non-compatibility filter within single product
        let filtered = allProducts.filter(p => !this.hasNonCompatibleConflict(p));

        // STEP 2: Safety filtering (AI.doc Phase 1)
        filtered = filtered.filter(p => !this.violatesSafety(p, aiQuiz));

        // STEP 3: Skin Type Matching (AI.doc Phase 2)
        filtered = filtered.filter(p => this.productHasSkinType(p, aiQuiz.skinAssessment.skinType));
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => this.isSensitiveSafe(p));
        }
        // STEP 4: Strength of Actives filter (AI.doc T6 + client note)
        filtered = filtered.filter(p => this.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));

        // STEP 5: Routine Architecture (AI.doc Phase 3)
        const finalPick = this.buildRoutineBasics(aiQuiz, filtered, allProducts);

        // STEP 6: Budget Management & Enforcement (AI.doc Phase 6 + client bottom cap)
        const adjusted = this.enforceBudget(aiQuiz, finalPick, filtered);

        // STEP 7: Cross-product Compatibility (AI.doc Phase 5)
        const compatible = this.enforceCompatibility(aiQuiz, adjusted);
        // Final guard: ensure minimum 3 items after compatibility; backfill with relaxed safe pool if needed
        let post = compatible;
        if (post.length < 3) {
            const safePool = allProducts.filter(p => !this.violatesSafety(p, aiQuiz))
                .filter(p => this.passesStrengthFilter(p, aiQuiz.skinAssessment.skinType));
            const need = 3 - post.length;
            const existingIds = new Set(post.map(p => p.productId));
            const byCat = this.bucketByCategory(safePool.filter(p => !existingIds.has(p.productId)));
            const addables: Product[] = [];
            // try protect then moisturizer then treatments to satisfy essentials
            for (const p of byCat.protects) {
                if (addables.length >= need) break;
                if (!this.passesSpfQuality(p)) continue;
                if (!this.conflicts(p, post[0] || p)) addables.push(p);
            }
            for (const m of byCat.moisturizers) {
                if (addables.length >= need) break;
                addables.push(m);
            }
            for (const t of byCat.treats) {
                if (addables.length >= need) break;
                if (this.respectsExfoliationWith(post, t)) addables.push(t);
            }
            post = [...post, ...addables.slice(0, need)];
        }
        const ordered = this.finalSort(aiQuiz, post);
        return ordered;
    }
}

export default ProductFilterService;