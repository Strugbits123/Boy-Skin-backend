import Product from "./product.model";

export interface CacheState {
    products: Product[];
    lastUpdated: Date;
    isUpdating: boolean;
    updateAttempts: number;
    maxRetries: number;
}

export interface EnhancedProductCache {
    bySkinType: {
        dry: Product[];
        oily: Product[];
        combination: Product[];
        normal: Product[];
        sensitive: Product[];
    };
    byQuality: {
        premium: Product[];
        midRange: Product[];
        basic: Product[];
    };
    byConcern: {
        acne: Product[];
        hyperpigmentation: Product[];
        dryness: Product[];
        finelines: Product[];
        redness: Product[];
        texture: Product[];
    };
    lastUpdated: Date;
    totalProducts: number;
}