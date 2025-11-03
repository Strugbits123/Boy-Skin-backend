/**
 * Skincare Tips Configuration
 * Centralized database of personalized skincare advice with intelligent filtering
 */

import { SkincareTip } from "../models/tips.model";
import Product from "../models/product.model";

export const SKINCARE_TIPS: SkincareTip[] = [
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
    {
        tip: "Massage in cleanser for 60 seconds (super important) to give it time to clear pores and remove sunscreen",
        skinTypes: ['all'],
        category: 'cleansing',
        relatedIngredients: ['cleanser', 'face wash', 'gel cleanser', 'foam cleanser', 'oil cleanser']
    },
    {
        tip: "As a rule of thumb, apply products from thinnest to thickest consistency (after cleansing)",
        skinTypes: ['all'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "Wait 30 seconds to 1 minute between applying different products to allow for proper absorption",
        skinTypes: ['all'],
        category: 'actives',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'adapalene', 'tretinoin', 'aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'vitamin c', 'ascorbic']
    },
    {
        tip: "For sensitive skin, introduce new products slowly (wait 3-4 weeks between new routine additions)",
        skinTypes: ['sensitive'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "For sensitive skin, always patch test new products on the neck or wrist first",
        skinTypes: ['sensitive'],
        category: 'general',
        relatedIngredients: []
    },
    {
        tip: "For exfoliating products, apply 1-2x a week and scale up to 2-3x a week as needed. Over-exfoliating can damage your skin barrier!",
        skinTypes: ['all'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'mandelic', 'exfoliant', 'exfoliating']
    },
    {
        tip: "For exfoliating actives, purging (new breakouts) can occur as impurities rise to the surface of the skin. Give it over 2-4 weeks for most exfoliants and 4-6 weeks for retinoids before deciding if the product works for you",
        skinTypes: ['all'],
        category: 'exfoliants',
        relatedIngredients: ['aha', 'bha', 'glycolic', 'salicylic', 'lactic', 'retinol', 'retinal', 'retinoid']
    },
    {
        tip: "When starting retinoids, start with 1-2x a week and scale up to every night as needed. Some irritation and dryness can occur. If experiencing this issue, try buffering with moisturizer (applying the retinoid over the moisturizer layer to slow absorption). Check packaging to ensure you're using the appropriate amount (usually a pea-sized amount for the entire face)",
        skinTypes: ['all'],
        category: 'retinoids',
        relatedIngredients: ['retinol', 'retinal', 'retinoid', 'adapalene', 'tretinoin']
    },
    {
        tip: "Always apply sunscreen (SPF 30+) as the last step of your morning routine, even on cloudy days. Use the two-finger rule to estimate how much to apply. Ideally, re-apply every 2+ hours when exposed to direct sun",
        skinTypes: ['all'],
        category: 'sun protection',
        relatedIngredients: ['spf', 'sunscreen', 'sun protection', 'uv protection']
    },
    {
        tip: "Change pillowcases at least weekly and avoid touching your face to prevent bacteria buildup that can contribute to breakouts",
        skinTypes: ['acne-prone', 'active acne'],
        category: 'general',
        relatedIngredients: []
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
        const skinMatch = tip.skinTypes.some(st => {
            const tipSkinType = st.toLowerCase();
            if (tipSkinType === 'all') return true;
            if (tipSkinType === 'sensitive') return isSensitive;
            return tipSkinType === normalizedSkinType;
        });
        if (!skinMatch) return false;

        if (tip.relatedIngredients.length === 0) return true;

        const hasRelevantIngredient = tip.relatedIngredients.some(ingredient =>
            searchText.includes(ingredient.toLowerCase())
        );

        return hasRelevantIngredient;
    });

    const selectedTips: SkincareTip[] = [];
    const excludedConflicts = new Set<string>();

    for (const tip of filteredTips) {
        if (excludedConflicts.has(tip.tip)) continue;

        selectedTips.push(tip);

        if (tip.conflictsWith) {
            excludedConflicts.add(tip.conflictsWith);
        }
    }

    return selectedTips.slice(0, 6).map(t => t.tip);
}
