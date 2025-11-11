/**
 * Product Categorization
 * Buckets products by primary function to prevent duplicates
 */

import Product from "../../../models/product.model";
import { ProductUtils } from "../utils/ProductUtils";

export class ProductCategorizer {

    static bucketByCategory(products: Product[]): { cleansers: Product[]; moisturizers: Product[]; protects: Product[]; treats: Product[] } {
        const cleansers: Product[] = [];
        const moisturizers: Product[] = [];
        const protects: Product[] = [];
        const treats: Product[] = [];

        for (const p of products) {
            const steps = ProductUtils.productSteps(p);

            if (steps.some(s => s.includes("cleanse"))) {
                cleansers.push(p);
            }
            if (steps.some(s => s.includes("moistur"))) {
                moisturizers.push(p);
            }
            if (steps.some(s => s.includes("protect") || s.includes("spf"))) {
                protects.push(p);
            }
            if (steps.some(s => s.includes("treat") || s.includes("serum") || s.includes("active"))) {
                treats.push(p);
            }
        }

        return { cleansers, moisturizers, protects, treats };
    }
}
