import { AICompatibleQuizModel } from "../models/quiz.model";
import Product from "../models/product.model";

class ProductFilterService {
    private static parseBudgetToNumber(budgetStr: string): number {
        const m = budgetStr.match(/\d+/);
        return m ? parseInt(m[0], 10) : 100;
    }

    private static textIncludesAny(text: string, keywords: string[]): boolean {
        const t = (text || "").toLowerCase();
        return keywords.some(k => t.includes(k.toLowerCase()));
    }

    private static extractActives(p: Product): string[] {
        const primary = p.primaryActiveIngredients?.plain_text || "";
        const full = p.ingredientList?.plain_text || "";
        const base = (primary + "\n" + full).toLowerCase();
        const tokens = [
            "retinol", "retinal", "retinoid",
            "benzoyl peroxide", "salicylic", "bha", "glycolic", "aha", "lactic", "pha",
            "azelaic", "azelaic acid", "sulfur", "vitamin c", "ascorbic",
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

        const isCleanser = /cleanser|face\s*wash|cleansing|wash|foam(ing)?\s*cleanser|gel\s*cleanser|cleansing\s*gel|cleansing\s*foam|cleansing\s*lotion/.test(text);
        const isMoisturizer = /moisturi[sz]e|moisturi[sz]er|lotion|cream|hydrating|hydrate\b/.test(text);
        const hasSPF = /\bspf\b|sunscreen|sun\s*screen|broad\s*spectrum|pa\+|sun\s*protection|uv\s*protection/.test(text);

        console.log(`Is Cleanser: ${isCleanser}`);
        console.log(`Is Moisturizer: ${isMoisturizer}`);
        console.log(`Has SPF: ${hasSPF}`);

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

    private static parseStrength(p: Product): number | null {
        const items = p.strengthRatingOfActives || [];
        for (const it of items) {
            const m = (it.name || "").match(/(\d)\s*\/\s*4/);
            if (m) return parseInt((m[1] ?? "0"), 10);
        }
        return null;
    }
    private static passesStrengthByStep(p: Product, skinType: AICompatibleQuizModel["skinAssessment"]["skinType"]): boolean {
        const s = this.parseStrength(p);
        if (s == null) return true;
        const steps = this.productSteps(p);
        const inRange = (val: number, min: number, max: number) => val >= min && val <= max;

        for (const step of steps) {
            if (step.includes("cleanse")) {
                if (skinType === "oily" && !inRange(s, 2, 4)) return false;
                if (skinType === "dry" && !inRange(s, 1, 2)) return false;
                if (skinType === "combination" && !inRange(s, 1, 2)) return false;
            } else if (step.includes("moistur")) {
                if (skinType === "oily" && !inRange(s, 1, 2)) return false;
                if (skinType === "dry" && !inRange(s, 2, 4)) return false;
                if (skinType === "combination" && !inRange(s, 2, 4)) return false;
            } else if (step.includes("protect") || step.includes("spf")) {
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
            // Salicylic acid is now allowed during pregnancy as per client feedback
        }

        const hasRosacea = aiQuiz.safetyInformation.medicalConditions.includes("rosacea");
        const hasEczema = aiQuiz.safetyInformation.medicalConditions.includes("eczema");
        if (hasRosacea || hasEczema) {
            const bad = ["alcohol", "fragrance", "retinol", "retinal", "retinoid", "aha", "bha", "glycolic", "salicylic", "benzoyl peroxide"];
            if (actives.some(a => bad.includes(a))) return true;
        }

        const meds = aiQuiz.safetyInformation.currentMedications;
        if (meds.includes("tretinoin") || meds.includes("adapalene")) {
            if (["retinol", "retinal", "retinoid", "aha", "bha", "glycolic", "salicylic"].some(a => actives.includes(a))) return true;
        }
        if (meds.includes("benzoyl peroxide")) {
            if (actives.includes("benzoyl peroxide")) return true;
        }
        if (meds.includes("clindamycin")) {
            if (actives.includes("sulfur")) return true;
        }

        for (const allergen of aiQuiz.safetyInformation.knownAllergies) {
            if (this.textIncludesAny(p.primaryActiveIngredients?.plain_text || "", [allergen]) ||
                this.textIncludesAny(p.ingredientList?.plain_text || "", [allergen])) {
                return true;
            }
        }

        return false;
    }

    private static getBudgetTier(budgetNum: number): "low" | "mid" | "high" {
        if (budgetNum <= 70) return "low";
        if (budgetNum <= 150) return "mid";
        return "high";
    }

    private static scoreForConcerns(p: Product, aiQuiz: AICompatibleQuizModel): number {
        const primary = aiQuiz.concerns.primary;
        const secondary = aiQuiz.concerns.secondary;
        const txtPrimary = (p.primaryActiveIngredients?.plain_text || "").toLowerCase();
        const txtAll = (p.ingredientList?.plain_text || "").toLowerCase();
        const steps = this.productSteps(p);

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

        // Ingredient Scoring Source Priority
        // Default: 90% Primary Active Ingredients, 10% Ingredient List (all)
        // Treatments (serums/actives): 100% Primary Active Ingredients
        const isTreatment = steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"));
        const weightPrimary = isTreatment ? 1.0 : 0.9;
        const weightAll = isTreatment ? 0.0 : 0.1;

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

    private static isExfoliating(p: Product): boolean {
        const actives = this.extractActives(p);
        const exfoliants = ["aha", "bha", "glycolic", "salicylic", "lactic", "pha", "azelaic", "retinol", "retinal", "vitamin c", "sulfur"];
        if (actives.some(a => exfoliants.includes(a))) return true;

        const text = [
            p.productName || "",
            p.summary?.plain_text || "",
            p.primaryActiveIngredients?.plain_text || "",
            p.format?.name || ""
        ].join(" ").toLowerCase();

        return /exfoliat|peel|resurface|azelaic\s*acid/.test(text);
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

    private static capByTier(arr: Product[], tier: "low" | "mid" | "high"): Product[] {
        const cap = tier === "low" ? 3 : (tier === "mid" ? 5 : 6);
        return arr.slice(0, cap);
    }

    static prefilterProducts(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        const budgetNum = this.parseBudgetToNumber(aiQuiz.preferences.budget);
        const tier = this.getBudgetTier(budgetNum);

        let filtered = allProducts.filter(p => !this.violatesSafety(p, aiQuiz));

        filtered = filtered.filter(p => this.productHasSkinType(p, aiQuiz.skinAssessment.skinType));
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => this.isSensitiveSafe(p));
        }

        filtered = filtered.filter(p => this.passesStrengthByStep(p, aiQuiz.skinAssessment.skinType));

        if (tier === "low") {
            filtered = filtered.filter(p => (p.price ?? 0) <= budgetNum);
        }

        filtered = filtered
            .map(p => ({ p, s: this.scoreForConcerns(p, aiQuiz) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);

        const buckets = this.bucketByCategory(filtered);

        const needCleanser = buckets.cleansers.length === 0;
        const needMoisturizer = buckets.moisturizers.length === 0;
        const needProtect = buckets.protects.length === 0;

        if (needCleanser || needMoisturizer || needProtect) {
            const candidates = allProducts.filter(p => {
                if (this.violatesSafety(p, aiQuiz)) return false;
                if (!this.productHasSkinType(p, aiQuiz.skinAssessment.skinType)) return false;
                if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && !this.isSensitiveSafe(p)) return false;
                if (!this.passesStrengthByStep(p, aiQuiz.skinAssessment.skinType)) return false;
                if (tier === "low" && (p.price ?? 0) > budgetNum) return false;
                return true;
            });

            for (const p of candidates) {
                const steps = this.productSteps(p);
                const meta = (p.summary?.plain_text || p.productName || '').toLowerCase();
                if (needCleanser && (steps.includes('cleanse') || /(wash|clean)/.test(meta))) {
                    buckets.cleansers.push(p);
                }
                if (needMoisturizer && (steps.includes('moisturize') || /(moist|lotion|cream|hydr)/.test(meta))) {
                    buckets.moisturizers.push(p);
                }
                if (needProtect && (steps.includes('protect') || /(spf|sunscreen)/.test(meta) || (p.requiresSPF?.name || '').toLowerCase().includes('yes'))) {
                    buckets.protects.push(p);
                }
            }
        }

        buckets.cleansers = buckets.cleansers.slice(0, 1);
        buckets.moisturizers = buckets.moisturizers.slice(0, 1);
        buckets.protects = buckets.protects.slice(0, 1);
        const exfoliatingCleanser = buckets.cleansers.find(c => this.isExfoliating(c));
        if (exfoliatingCleanser) {
            buckets.treats = buckets.treats.filter(t => !this.isExfoliating(t));
        } else {
            const exfoliatingTreatments = buckets.treats.filter(t => this.isExfoliating(t));
            if (exfoliatingTreatments.length > 1) {
                const firstExfoliant = exfoliatingTreatments[0];
                if (firstExfoliant) {
                    buckets.treats = buckets.treats.filter(t => !this.isExfoliating(t) || t.productId === firstExfoliant.productId);
                }
            }
        }

        buckets.treats = this.capByTier(buckets.treats, tier);

        const pick = [
            ...buckets.cleansers,
            ...buckets.moisturizers,
            ...buckets.protects,
            ...buckets.treats
        ];

        const seen = new Set<string>();
        const unique: Product[] = [];
        for (const item of pick) {
            if (!seen.has(item.productId)) {
                seen.add(item.productId);
                unique.push(item);
            }
        }

        return unique;
    }

    // Deterministic product selection - guarantees essentials and applies all rules
    static selectProductsDeterministically(aiQuiz: AICompatibleQuizModel, allProducts: Product[]): Product[] {
        const budgetNum = this.parseBudgetToNumber(aiQuiz.preferences.budget);
        const tier = this.getBudgetTier(budgetNum);

        // Step 1: Prefilter products (safety, skin type, strength, budget)
        let filtered = allProducts.filter(p => !this.violatesSafety(p, aiQuiz));
        filtered = filtered.filter(p => this.productHasSkinType(p, aiQuiz.skinAssessment.skinType));
        if (aiQuiz.skinAssessment.skinSensitivity === "sensitive") {
            filtered = filtered.filter(p => this.isSensitiveSafe(p));
        }
        filtered = filtered.filter(p => this.passesStrengthByStep(p, aiQuiz.skinAssessment.skinType));

        // Step 2: Score and sort by concerns
        filtered = filtered
            .map(p => ({ p, s: this.scoreForConcerns(p, aiQuiz) }))
            .sort((a, b) => b.s - a.s)
            .map(x => x.p);

        // Step 3: Bucket by category
        const buckets = this.bucketByCategory(filtered);

        // Step 4: Ensure essentials exist (if not, add from all products)
        if (buckets.cleansers.length === 0 || buckets.moisturizers.length === 0 || buckets.protects.length === 0) {
            const fallbackCandidates = allProducts.filter(p => {
                if (this.violatesSafety(p, aiQuiz)) return false;
                if (!this.productHasSkinType(p, aiQuiz.skinAssessment.skinType)) return false;
                if (aiQuiz.skinAssessment.skinSensitivity === "sensitive" && !this.isSensitiveSafe(p)) return false;
                if (!this.passesStrengthByStep(p, aiQuiz.skinAssessment.skinType)) return false;
                if (tier === "low" && (p.price ?? 0) > budgetNum) return false;
                return true;
            });

            for (const p of fallbackCandidates) {
                const steps = this.productSteps(p);
                const meta = (p.summary?.plain_text || p.productName || '').toLowerCase();
                if (buckets.cleansers.length === 0 && (steps.includes('cleanse') || /(wash|clean)/.test(meta))) {
                    buckets.cleansers.push(p);
                }
                if (buckets.moisturizers.length === 0 && (steps.includes('moisturize') || /(moist|lotion|cream|hydr)/.test(meta))) {
                    buckets.moisturizers.push(p);
                }
                if (buckets.protects.length === 0 && (steps.includes('protect') || /(spf|sunscreen)/.test(meta) || (p.requiresSPF?.name || '').toLowerCase().includes('yes'))) {
                    buckets.protects.push(p);
                }
            }
        }

        // Step 5: Apply step caps (exactly 1 of each essential)
        buckets.cleansers = buckets.cleansers.slice(0, 1);
        buckets.moisturizers = buckets.moisturizers.slice(0, 1);
        buckets.protects = buckets.protects.slice(0, 1);

        // Step 6: Handle exfoliant conflicts (single exfoliant rule) and duplicate prevention
        const exfoliatingCleanser = buckets.cleansers.find(c => this.isExfoliating(c));
        if (exfoliatingCleanser) {
            buckets.treats = buckets.treats.filter(t => !this.isExfoliating(t));
        } else {
            const exfoliatingTreatments = buckets.treats.filter(t => this.isExfoliating(t));
            if (exfoliatingTreatments.length > 1) {
                const firstExfoliant = exfoliatingTreatments[0];
                if (firstExfoliant) {
                    buckets.treats = buckets.treats.filter(t => !this.isExfoliating(t) || t.productId === firstExfoliant.productId);
                }
            }
        }

        // Step 6.5: Remove duplicate products by active ingredients
        buckets.treats = this.removeDuplicateActives(buckets.treats);

        // Step 7: Cap treatments by budget tier
        buckets.treats = this.capByTier(buckets.treats, tier);

        // Step 8: Combine and check budget
        let selectedProducts = [
            ...buckets.cleansers,
            ...buckets.moisturizers,
            ...buckets.protects,
            ...buckets.treats
        ];

        // Step 9: Remove duplicates
        const seen = new Set<string>();
        const unique: Product[] = [];
        for (const item of selectedProducts) {
            if (!seen.has(item.productId)) {
                seen.add(item.productId);
                unique.push(item);
            }
        }

        // Step 10: Final budget validation and optimization
        let totalCost = unique.reduce((sum, p) => sum + (p.price || 0), 0);

        // If over budget, remove treatments starting from lowest priority
        if (totalCost > budgetNum) {
            const treatments = unique.filter(p => {
                const steps = this.productSteps(p);
                return steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"));
            });

            // Sort treatments by score (lowest first for removal)
            const sortedTreatments = treatments
                .map(p => ({ p, s: this.scoreForConcerns(p, aiQuiz) }))
                .sort((a, b) => a.s - b.s)
                .map(x => x.p);

            let finalProducts = [...unique];
            for (const treatment of sortedTreatments) {
                const newTotal = finalProducts.reduce((sum, p) => sum + (p.price || 0), 0);
                if (newTotal <= budgetNum) break;

                finalProducts = finalProducts.filter(p => p.productId !== treatment.productId);
            }

            return finalProducts;
        }

        return unique;
    }

    // Helper: Remove duplicate products by active ingredients
    private static removeDuplicateActives(products: Product[]): Product[] {
        const seenActives = new Set<string>();
        const unique: Product[] = [];

        for (const product of products) {
            const actives = this.extractActives(product);
            const activeKey = actives.sort().join(',');

            if (!seenActives.has(activeKey)) {
                seenActives.add(activeKey);
                unique.push(product);
            }
        }

        return unique;
    }
}

export default ProductFilterService;