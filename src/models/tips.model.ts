/**
 * Skincare Tips Model
 * Defines structure for personalized skincare advice
 */

export interface SkincareTip {
    tip: string;
    skinTypes: string[];
    category: string;
    relatedIngredients: string[];
    conflictsWith?: string;
}
