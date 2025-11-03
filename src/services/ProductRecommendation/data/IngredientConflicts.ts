/**
 * Ingredient Conflict Data
 * Contains ingredient compatibility matrix for skincare product filtering
 */

export interface IngredientConflict {
    name: string;
    "non-compatible": string[];
}

export const INGREDIENT_CONFLICTS: readonly IngredientConflict[] = [
    {
        name: "Allantoin",
        "non-compatible": ["Bisabolol", "Niacinamide", "Retinol", "Sodium Hyaluronate"]
    },
    {
        name: "Ascorbyl Glucoside",
        "non-compatible": ["Ferulic Acid", "Niacinamide", "Sodium Hyaluronate"]
    },
    {
        name: "Niacinamide",
        "non-compatible": ["Allantoin", "Ascorbyl Glucoside", "Astaxanthin", "Azealic Acid", "Bisabolol", "Ceramides", "Retinol", "Sodium Hyaluronate", "Tranexamic Acid", "Vitamin C"]
    },
    {
        name: "Sodium Hyaluronate",
        "non-compatible": ["Allantoin", "Ascorbyl Glucoside", "Bisabolol", "Ceramides", "Niacinamide", "Ceramides", "Squalene"]
    },
    {
        name: "Astaxanthin",
        "non-compatible": ["Niacinamide", "Squalene"]
    },
    {
        name: "Azealic Acid",
        "non-compatible": ["Tranexamic Acid"]
    },
    {
        name: "Ceramides",
        "non-compatible": ["Retinol", "Sodium Hyaluronate", "Squalene"]
    },
    {
        name: "Glycolic Acid (AHA)",
        "non-compatible": ["Salycilic Acid (BHA)"]
    },
    {
        name: "Lactic Acid (AHA)",
        "non-compatible": ["Salycilic Acid (BHA)"]
    },
    {
        name: "Retinol",
        "non-compatible": ["Peptides", "Squalene", "Allantoin", "Ceramides", "Niacinamide"]
    },
    {
        name: "Vitamin C",
        "non-compatible": ["Tranexamic Acid"]
    }
];
