/**
 * Deduplicate notes (case-insensitive, trimmed)
 * Removes exact and whitespace/formatting duplicates
 */
import { AICompatibleQuizModel, QuizModel } from "../models/quiz.model";

class ValidationService {
    // Ingredients plain_text ko display-friendly array me convert kare
    // Also returns a normalized string helpful for matching
    static parseIngredientsPlainText(plain: string): { list: string[]; normalized: string } {
        const raw = (plain || "").trim();
        if (!raw) return { list: [], normalized: "" };

        // Build a display string by inserting separators at common boundaries
        let display = raw
            .replace(/[\n\r\t]+/g, " ")
            .replace(/\s*\/\s*/g, " | ")
            .replace(/[;,·•|]+/g, " | ")
            .replace(/\s{2,}/g, " ")
            .trim();

        // Insert separators before TitleCase word boundaries to split long runs
        display = display.replace(/\s+(?=[A-Z][a-z]+)/g, " | ");

        const parts = display
            .split(/\|/)
            .map(s => s.trim())
            .filter(Boolean);

        // Normalized (lowercase, accents removed, punctuation to space)
        const normalized = raw
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[\(\)\[\],.;:|•·\n\r\t]+/g, " ")
            .replace(/\s*\/\s*/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

        return { list: parts, normalized };
    }
    static deduplicateNotes(notes: string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const note of notes) {
            const normalized = note.trim().toLowerCase();
            if (!seen.has(normalized)) {
                seen.add(normalized);
                result.push(note.trim());
            }
        }
        return result;
    }
    static async validateBody(data: any, requiredFields: string[]): Promise<boolean> {
        try {
            for (const field of requiredFields) {
                if (
                    !data.hasOwnProperty(field) ||
                    data[field] === undefined ||
                    data[field] === null ||
                    data[field] === ""
                ) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error("Validation error:", error);
            return false;
        }
    }


    // Validation function - AI format validate karne ke liye
    static validateAIQuizModel(model: AICompatibleQuizModel): {
        isValid: boolean;
        errors: string[]
    } {
        const errors: string[] = [];

        // Demographics validation
        if (!model.demographics.name || model.demographics.name.trim() === '') {
            errors.push("Name is required");
        }

        // Skin assessment validation
        const validSkinTypes = ["dry", "oily", "combination", "normal"];
        if (!validSkinTypes.includes(model.skinAssessment.skinType)) {
            errors.push("Invalid skin type");
        }

        // Budget validation
        const budgetMatch = model.preferences.budget.match(/\$(\d+)/);
        if (!budgetMatch) {
            errors.push("Invalid budget format");
        } else {
            const budgetNum = parseInt(budgetMatch[1] || '0');
            if (budgetNum < 40 || budgetNum > 250) {
                errors.push("Budget must be between $40 and $250");
            }
        }

        // Concerns validation
        if (model.concerns.primary.length === 0 && model.concerns.secondary.length === 0) {
            errors.push("At least one skin concern must be specified");
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static transformQuizToAIFormat(quiz: QuizModel): AICompatibleQuizModel {
        // Enhanced concern parsing with comprehensive mapping
        const parseConcerns = (workOn: string): { primary: string[], secondary: string[] } => {
            const concerns = workOn.split(/[,|]/).map(c => c.trim().toLowerCase());

            // Comprehensive concern mapping for all frontend concerns
            const concernMapping: { [key: string]: string } = {
                // Primary concerns (scores 8-10)
                "acne": "acne",
                "texture": "texture",
                "wrinkles": "wrinkles",
                "fine lines": "fine lines",
                "wrinkles/fine lines": "wrinkles",
                "anti-aging": "wrinkles",
                "aging": "wrinkles",
                "age spots": "wrinkles",
                "hyperpigmentation": "hyperpigmentation",
                "dark spots": "hyperpigmentation",
                "dark spot": "hyperpigmentation",
                "pigmentation": "hyperpigmentation",
                "melasma": "hyperpigmentation",
                "dark patches": "hyperpigmentation",
                "uneven skin tone": "hyperpigmentation",

                // Secondary concerns (scores 5-7)
                "pores": "pores",
                "redness": "redness",
                "dark circles": "dark circles",
                "under eye circles": "dark circles",
                "eye bags": "dark circles",
                "shaving bumps": "shaving bumps",
                "razor bumps": "shaving bumps",
                "ingrown hairs": "shaving bumps",
                "dullness": "dullness",
                "dull skin": "dullness",
                "lifeless skin": "dullness",
                "dryness": "dryness",
                "dry skin": "dryness",
                "dehydrated": "dryness",
                "flaky skin": "dryness"
            };

            // Update: Move 'wrinkles/fine lines' to primary, 'pores' to secondary
            const primaryConcerns = ["acne", "texture", "wrinkles", "fine lines", "hyperpigmentation"];
            const secondaryConcerns = ["pores", "redness", "dark circles", "shaving bumps", "dullness", "dryness"];

            const primary: string[] = [];
            const secondary: string[] = [];

            concerns.forEach(concern => {
                // Check if concern has a mapping with proper type safety
                const mappedConcern = concernMapping[concern] || concern;

                if (primaryConcerns.includes(mappedConcern)) {
                    primary.push(mappedConcern);
                } else if (secondaryConcerns.includes(mappedConcern)) {
                    secondary.push(mappedConcern);
                }
            });

            return { primary, secondary };
        };

        // Enhanced skin type mapping - FIXED: Removed "sensitive" from return type
        const mapSkinType = (type: string): "dry" | "oily" | "combination" | "normal" => {
            const normalized = type.toLowerCase().trim();

            // Comprehensive skin type mapping - EXACT MATCH ONLY
            if (normalized.includes("dry")) return "dry";
            if (normalized.includes("oily")) return "oily";
            if (normalized.includes("combination")) return "combination";
            if (normalized.includes("normal")) return "normal";

            // Default fallback
            return "normal";
        };

        // Enhanced sensitivity mapping
        const mapSensitivity = (sensitivity: string): "sensitive" | "not sensitive" => {
            const normalized = sensitivity.toLowerCase().trim();
            if (normalized === "not sensitive skin") { return "not sensitive"; }
            if (normalized === "sensitive skin") { return "sensitive"; }

            // const sensitiveKeywords = ["sensitive", "very sensitive", "extremely sensitive", "reactive", "sensitive skin"];
            // const notSensitiveKeywords = ["not sensitive", "not sensitive skin", "resistant", "tough", "normal"];

            // if (sensitiveKeywords.some(keyword => normalized.includes(keyword))) {
            //     return "sensitive";
            // }
            // if (notSensitiveKeywords.some(keyword => normalized.includes(keyword))) {
            //     return "not sensitive";
            // }

            // Default fallback based on skin type
            return "not sensitive";
        };

        // Enhanced age mapping with correct ranges per screenshot
        const mapAge = (age: string): "13-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55+" => {
            // Handle range formats like "18-24", "25-34", etc.
            const rangeMatch = age.match(/(\d+)-(\d+)/);
            if (rangeMatch) {
                const startAge = parseInt(rangeMatch[1] || "0");
                const endAge = parseInt(rangeMatch[2] || "0");
                const avgAge = (startAge + endAge) / 2;

                if (avgAge >= 13 && avgAge <= 17) return "13-17";
                if (avgAge >= 18 && avgAge <= 24) return "18-24";
                if (avgAge >= 25 && avgAge <= 34) return "25-34";
                if (avgAge >= 35 && avgAge <= 44) return "35-44";
                if (avgAge >= 45 && avgAge <= 54) return "45-54";
                return "55+";
            }

            // Handle single age numbers
            const ageNum = parseInt(age);
            if (ageNum >= 13 && ageNum <= 17) return "13-17";
            if (ageNum >= 18 && ageNum <= 24) return "18-24";
            if (ageNum >= 25 && ageNum <= 34) return "25-34";
            if (ageNum >= 35 && ageNum <= 44) return "35-44";
            if (ageNum >= 45 && ageNum <= 54) return "45-54";
            return "55+";
        };

        // Enhanced time commitment mapping - FIXED: Check specific patterns first
        const mapTimeCommitment = (time: string): "5_minute" | "10_minute" | "15+_minute" => {
            const normalized = time.toLowerCase().trim();

            // Priority 1: Exact match (fastest path for valid inputs)
            if (normalized === "5_minute") return "5_minute";
            if (normalized === "10_minute") return "10_minute";
            if (normalized === "15+_minute") return "15+_minute";

            // Priority 2: Check longer/specific patterns FIRST (15+ before 10, 10 before 5)
            if (normalized.includes("15") || normalized.includes("fifteen") ||
                normalized.includes("20") || normalized.includes("twenty") ||
                normalized.includes("30") || normalized.includes("thirty")) return "15+_minute";

            if (normalized.includes("10") || normalized.includes("ten")) return "10_minute";

            if (normalized.includes("5") || normalized.includes("five")) return "5_minute";

            // Default fallback
            return "10_minute";
        };

        // Enhanced budget formatting with validation
        const formatBudget = (budget: string): string => {
            const cleaned = budget.replace(/[^\d]/g, '');
            const budgetNum = parseInt(cleaned);

            // Validate budget range
            if (budgetNum < 40) return "$40";
            if (budgetNum > 200) return "$200";

            return `$${budgetNum}`;
        };

        // Enhanced acne status detection with work_on_acne field support
        const checkAcneStatus = (workOn: string, workOnAcne: string): "active acne" | "not active acne" => {
            // First check work_on_acne field for specific values
            if (workOnAcne) {
                const normalizedAcne = workOnAcne.toLowerCase().trim();
                if (normalizedAcne === "active acne" || normalizedAcne === "acne-prone") {
                    return "active acne";
                }
                if (normalizedAcne === "n/a") {
                    return "not active acne";
                }
            }

            // Fallback to work_on field for general acne detection
            const normalized = workOn.toLowerCase();
            const acneKeywords = ["acne", "pimples", "breakouts", "zits", "spots", "blemishes"];
            return acneKeywords.some(keyword => normalized.includes(keyword)) ? "active acne" : "not active acne";
        };

        // Enhanced safety information parsing
        const parseSafetyInfo = (additionalInfo: string): {
            medicalConditions: string[],
            currentMedications: string[],
            knownAllergies: string[]
        } => {
            const normalized = additionalInfo.toLowerCase();

            const medicalConditions: string[] = [];
            const currentMedications: string[] = [];
            const knownAllergies: string[] = [];

            // Medical conditions detection
            const conditionKeywords: { [key: string]: string[] } = {
                "rosacea": ["rosacea", "rosacea-prone", "rosacea prone"],
                "eczema": ["eczema", "atopic dermatitis", "dermatitis", "atopic"],
                "pregnant": ["pregnant", "pregnancy", "expecting", "breastfeeding", "nursing"]
            };

            Object.entries(conditionKeywords).forEach(([condition, keywords]) => {
                if (keywords.some(keyword => normalized.includes(keyword))) {
                    medicalConditions.push(condition);
                }
            });

            // Medications detection
            const medicationKeywords: { [key: string]: string[] } = {
                "tretinoin": ["tretinoin", "retin-a", "retin a", "retin-a"],
                "benzoyl peroxide": ["benzoyl peroxide", "bp", "benzac", "benzoyl"],
                "accutane": ["accutane", "isotretinoin", "roaccutane"],
                "adapalene": ["adapalene", "differin", "adapalene gel"],
                "clindamycin": ["clindamycin", "clinda", "clindamycin gel"]
            };

            Object.entries(medicationKeywords).forEach(([medication, keywords]) => {
                if (keywords.some(keyword => normalized.includes(keyword))) {
                    currentMedications.push(medication);
                }
            });

            // Allergies detection
            const allergyKeywords: { [key: string]: string[] } = {
                "fragrance": ["fragrance", "perfume", "scented", "fragrance allergy"],
                "niacinamide": ["niacinamide", "vitamin b3", "b3", "niacinamide allergy"],
                "salicylic acid": ["salicylic acid", "bha", "beta hydroxy acid", "salicylic"],
                "retinol": ["retinol", "retinoid", "retinol allergy"],
                "vitamin c": ["vitamin c", "ascorbic acid", "vit c", "vitamin c allergy"],
                "hyaluronic acid": ["hyaluronic acid", "ha", "hyaluronic", "hyaluronic acid allergy"]
            };

            Object.entries(allergyKeywords).forEach(([allergen, keywords]) => {
                if (keywords.some(keyword => normalized.includes(keyword))) {
                    knownAllergies.push(allergen);
                }
            });

            return { medicalConditions, currentMedications, knownAllergies };
        };

        // Execute transformations with proper null checks
        const concerns = parseConcerns(quiz.work_on || "");
        const safetyInfo = parseSafetyInfo(quiz.additional_info || "");

        return {
            demographics: {
                age: mapAge(quiz.Age || "25"),
                name: quiz.Name || ""
            },
            skinAssessment: {
                skinType: mapSkinType(quiz.wakeUpSkinType || "normal"),
                skinSensitivity: mapSensitivity(quiz.skinSensitivity || "not sensitive"),
                currentAcneStatus: checkAcneStatus(quiz.work_on || "", quiz.work_on_acne || "")
            },
            concerns: {
                primary: concerns.primary,
                secondary: concerns.secondary
            },
            preferences: {
                timeCommitment: mapTimeCommitment(quiz.routine_time || "10_minute"),
                budget: formatBudget(quiz.Budget || "100")
            },
            safetyInformation: {
                medicalConditions: safetyInfo.medicalConditions,
                currentMedications: safetyInfo.currentMedications,
                knownAllergies: safetyInfo.knownAllergies,
                additionalInfo: quiz.additional_info || ""
            },
            contactInfo: {
                email: quiz.Email || "",
                country: quiz.Country || "",
                gender: quiz.Gender || ""
            }
        };
    }



}

export default ValidationService;
