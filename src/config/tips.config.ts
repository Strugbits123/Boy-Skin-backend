/**
 * Skincare Tips Configuration
 * Centralized database of personalized skincare advice with intelligent filtering
 */

import { SkincareTip } from "../models/tips.model";
import Product from "../models/product.model";

export const SKINCARE_TIPS: SkincareTip[] = [
    // CLEANSING TIPS - Skin Type Specific
    {
        tip: "Wash face in the evening 1x times a day",
        skinTypes: ['dry'],
        category: 'cleansing',
        relatedIngredients: ['cleanser', 'face wash', 'gel cleanser', 'cream cleanser'],
        conflictsWith: "Wash face in the morning and evening 2x times a day"
    },
    {
        tip: "Wash face in the morning and evening 2x times a day",
        skinTypes: ['oily', 'combination', 'normal'],
        category: 'cleansing',
        relatedIngredients: ['cleanser', 'face wash', 'gel cleanser', 'foaming cleanser'],
        conflictsWith: "Wash face in the evening 1x times a day"
    },

    // UNIVERSAL TIPS - Truly for everyone
    {
        tip: "Massage in cleanser for 60 seconds to effectively clear pores and remove sunscreen",
        skinTypes: ['all'],
        category: 'cleansing',
        relatedIngredients: ['cleanser', 'face wash', 'gel cleanser', 'foam cleanser', 'oil cleanser']
    },
    {
        tip: "Apply products from thinnest to thickest consistency after cleansing",
        skinTypes: ['all'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "Apply broad-spectrum SPF 30+ sunscreen as the final step in your morning routine. Use 1/4 teaspoon for face and neck, and reapply every 2 hours during sun exposure",
        skinTypes: ['all'],
        category: 'sun protection',
        relatedIngredients: ['spf', 'sunscreen', 'sun protection', 'uv protection']
    },

    // MEDICALLY SAFE TIPS - For Normal/Non-Sensitive Skin
    {
        tip: "Begin exfoliating once per week and maintain for 4 weeks before considering increase to twice weekly",
        skinTypes: ['normal', 'oily', 'combination', 'dry'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'mandelic', 'exfoliant', 'exfoliating']
    },
    {
        tip: "Initial skin adjustment may occur with actives. Stop immediately if you experience burning or excessive redness. Consult a dermatologist if symptoms persist after 4 weeks",
        skinTypes: ['normal', 'oily', 'combination', 'dry'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'retinol', 'retinal', 'retinoid']
    },
    {
        tip: "Start retinoids once every 3 days for 2 weeks, then every other day, gradually building to nightly use over 6-8 weeks. Use a pea-sized amount for your entire face",
        skinTypes: ['normal', 'oily', 'combination', 'dry'],
        category: 'retinoids',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'adapalene', 'tretinoin']
    },
    {
        tip: "Wait 5-10 minutes between applying different active ingredients to prevent chemical interactions and irritation",
        skinTypes: ['normal', 'oily', 'combination', 'dry'],
        category: 'actives',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'aha', 'bha', 'glycolic', 'salicylic', 'vitamin c']
    },

    // MEDICALLY SAFE TIPS - For Sensitive Skin Only
    {
        tip: "Introduce new products one at a time - wait 4-6 weeks between adding new items to assess tolerance safely",
        skinTypes: ['sensitive'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "Always patch test new products on your inner wrist for 24-48 hours before facial application. Discontinue if any redness, burning, or itching occurs",
        skinTypes: ['sensitive'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "Start exfoliating products once every 2 weeks initially, then once per week after 6 weeks if well-tolerated. Stop immediately if irritation develops",
        skinTypes: ['sensitive'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'mandelic', 'exfoliant', 'exfoliating']
    },
    {
        tip: "Begin retinoids once per week for 4 weeks, then twice weekly if tolerated. Always apply over moisturizer to buffer absorption and reduce irritation risk",
        skinTypes: ['sensitive'],
        category: 'retinoids',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'adapalene', 'tretinoin']
    },
    {
        tip: "Wait 10-15 minutes between applying different active products to minimize potential adverse reactions",
        skinTypes: ['sensitive'],
        category: 'actives',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'aha', 'bha', 'glycolic', 'salicylic', 'vitamin c']
    },
    {
        tip: "Allow 6-8 weeks minimum to evaluate active ingredients effectiveness. Discontinue and consult a dermatologist if persistent irritation occurs",
        skinTypes: ['sensitive'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'retinol', 'retinal', 'retinoid']
    },

    // ACNE-SPECIFIC TIPS
    {
        tip: "Change pillowcases weekly and avoid touching your face to prevent bacteria buildup",
        skinTypes: ['acne-prone', 'active acne'],
        category: 'general',
        relatedIngredients: []
    },

    // ADDITIONAL SAFETY TIPS
    {
        tip: "Never combine retinoids with AHA/BHA acids in the same routine to prevent severe irritation. Use them on alternating nights",
        skinTypes: ['all'],
        category: 'safety',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'aha', 'bha', 'glycolic', 'salicylic']
    },
    {
        tip: "Stop using active ingredients 1 week before any professional facial treatments, chemical peels, or laser procedures",
        skinTypes: ['all'],
        category: 'safety',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'aha', 'bha', 'glycolic', 'salicylic']
    },
    {
        tip: "Avoid vitamin C serums in the same routine as retinoids or acids to prevent destabilization and irritation",
        skinTypes: ['all'],
        category: 'safety',
        relatedIngredients: ['vitamin c', 'ascorbic', 'retinol', 'aha', 'bha']
    },
    {
        tip: "If you experience persistent burning, severe redness, or peeling that doesn't improve within 3 days, stop all active ingredients and consult a dermatologist",
        skinTypes: ['all'],
        category: 'safety',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'aha', 'bha', 'glycolic', 'salicylic']
    }
];

/**
 * Get personalized tips based on skin type and product ingredients
 */
export function getRelevantTips(skinType: string, isSensitive: boolean, products: Product[]): string[] {
    const normalizedSkinType = skinType.toLowerCase();

    const allIngredients = products
        .map(p => p.ingredientList?.plain_text?.toLowerCase() || '')
        .join(' ');

    const productNames = products
        .map(p => p.productName?.toLowerCase() || '')
        .join(' ');

    const searchText = `${allIngredients} ${productNames}`;

    const filteredTips = SKINCARE_TIPS.filter(tip => {
        // Improved skin type matching logic
        const skinMatch = tip.skinTypes.some(st => {
            const tipSkinType = st.toLowerCase();

            // Universal tips for everyone
            if (tipSkinType === 'all') return true;

            // Sensitive-specific tips only for sensitive users
            if (tipSkinType === 'sensitive') return isSensitive;

            // Non-sensitive specific tips only for non-sensitive users  
            if (tipSkinType === normalizedSkinType && !isSensitive) return true;

            // Acne-specific matching (can be sensitive or non-sensitive)
            if (tipSkinType === 'acne-prone' || tipSkinType === 'active acne') {
                return normalizedSkinType === tipSkinType;
            }

            return false;
        });

        if (!skinMatch) return false;

        // If no specific ingredients required, include the tip
        if (tip.relatedIngredients.length === 0) return true;

        // Check if tip is relevant to current products
        const hasRelevantIngredient = tip.relatedIngredients.some(ingredient =>
            searchText.includes(ingredient.toLowerCase())
        );

        return hasRelevantIngredient;
    });

    // Prioritize tips by category to ensure balanced advice
    const tipsByCategory = new Map<string, SkincareTip[]>();

    filteredTips.forEach(tip => {
        if (!tipsByCategory.has(tip.category)) {
            tipsByCategory.set(tip.category, []);
        }
        tipsByCategory.get(tip.category)!.push(tip);
    });

    const selectedTips: SkincareTip[] = [];
    const excludedConflicts = new Set<string>();
    const usedCategories = new Set<string>();

    // First pass: Select one tip from each category
    for (const [category, tips] of tipsByCategory) {
        for (const tip of tips) {
            if (excludedConflicts.has(tip.tip)) continue;

            selectedTips.push(tip);
            usedCategories.add(category);

            if (tip.conflictsWith) {
                excludedConflicts.add(tip.conflictsWith);
            }
            break; // Only one tip per category in first pass
        }

        if (selectedTips.length >= 4) break; // Limit first pass
    }

    // Second pass: Fill remaining slots from any category
    for (const tip of filteredTips) {
        if (selectedTips.length >= 6) break;
        if (excludedConflicts.has(tip.tip)) continue;
        if (selectedTips.some(selected => selected.tip === tip.tip)) continue;

        selectedTips.push(tip);

        if (tip.conflictsWith) {
            excludedConflicts.add(tip.conflictsWith);
        }
    }

    return selectedTips.slice(0, 6).map(t => t.tip);
}
