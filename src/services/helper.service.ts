import { AICompatibleQuizModel, QuizModel } from "../models/quiz.model";

class ValidationService {
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
                "pores": "pores",
                "hyperpigmentation": "hyperpigmentation",
                "dark spots": "hyperpigmentation",
                "dark spot": "hyperpigmentation",
                "pigmentation": "hyperpigmentation",
                "melasma": "hyperpigmentation",
                "dark patches": "hyperpigmentation",
                "uneven skin tone": "hyperpigmentation",

                // Secondary concerns (scores 5-7)
                "wrinkles": "wrinkles",
                "fine lines": "fine lines",
                "wrinkles/fine lines": "wrinkles",
                "anti-aging": "wrinkles",
                "aging": "wrinkles",
                "age spots": "wrinkles",
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

            const primaryConcerns = ["acne", "texture", "pores", "hyperpigmentation"];
            const secondaryConcerns = ["wrinkles", "fine lines", "redness", "dark circles", "shaving bumps", "dullness", "dryness"];

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

            // Comprehensive skin type mapping
            if (normalized.includes("dry")) return "dry";
            if (normalized.includes("oily")) return "oily";
            if (normalized.includes("combination")) return "combination";
            if (normalized.includes("sensitive")) return "normal"; // Map sensitive to normal for now
            if (normalized.includes("normal")) return "normal";

            // Default fallback
            return "normal";
        };

        // Enhanced sensitivity mapping
        const mapSensitivity = (sensitivity: string): "sensitive" | "not sensitive" => {
            const normalized = sensitivity.toLowerCase().trim();

            const sensitiveKeywords = ["sensitive", "very sensitive", "extremely sensitive", "reactive", "sensitive skin"];
            const notSensitiveKeywords = ["not sensitive", "not sensitive skin", "resistant", "tough", "normal"];

            if (sensitiveKeywords.some(keyword => normalized.includes(keyword))) {
                return "sensitive";
            }
            if (notSensitiveKeywords.some(keyword => normalized.includes(keyword))) {
                return "not sensitive";
            }

            // Default fallback based on skin type
            return "not sensitive";
        };

        // Enhanced age mapping with better range detection
        const mapAge = (age: string): "18-25" | "25-35" | "35-45" | "45+" => {
            // Handle range formats like "30-35", "25-30", etc.
            const rangeMatch = age.match(/(\d+)-(\d+)/);
            if (rangeMatch) {
                const startAge = parseInt(rangeMatch[1] || "0");
                const endAge = parseInt(rangeMatch[2] || "0");
                const avgAge = (startAge + endAge) / 2;

                if (avgAge >= 18 && avgAge <= 25) return "18-25";
                if (avgAge > 25 && avgAge <= 35) return "25-35";
                if (avgAge > 35 && avgAge <= 45) return "35-45";
                return "45+";
            }

            // Handle single age numbers
            const ageNum = parseInt(age);
            if (ageNum >= 18 && ageNum <= 25) return "18-25";
            if (ageNum > 25 && ageNum <= 35) return "25-35";
            if (ageNum > 35 && ageNum <= 45) return "35-45";
            return "45+";
        };

        // Enhanced time commitment mapping
        const mapTimeCommitment = (time: string): "5_minute" | "10_minute" | "15+_minute" => {
            const normalized = time.toLowerCase().trim();

            if (normalized.includes("5") || normalized.includes("five")) return "5_minute";
            if (normalized.includes("10") || normalized.includes("ten")) return "10_minute";
            if (normalized.includes("15") || normalized.includes("fifteen") ||
                normalized.includes("20") || normalized.includes("twenty") ||
                normalized.includes("30") || normalized.includes("thirty")) return "15+_minute";

            return "10_minute"; // Default fallback
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

        // Enhanced acne status detection
        const checkAcneStatus = (workOn: string): "active acne" | "not active acne" => {
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
                currentAcneStatus: checkAcneStatus(quiz.work_on || "")
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
