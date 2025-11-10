/**
 * AI.DOC Compliant Routine Architecture Manager
 * Implements Phase 3: Routine Architecture Rules from AI.doc.txt
 */

import { AICompatibleQuizModel } from "../../../models/quiz.model";

export class RoutineArchitect {

    /**
     * Get product count requirements based on time commitment
     * AI.DOC Rules R1, R2, R3
     */
    static getProductCountRequirements(timeCommitment: string): {
        min: number;
        max: number;
        budgetSplit: { basics: number; treatments: number };
    } {
        switch (timeCommitment) {
            case "5_minute":
                // AI.DOC Rule R1: Basic Routine
                return {
                    min: 2,
                    max: 3,
                    budgetSplit: { basics: 50, treatments: 50 } // Even distribution
                };

            case "10_minute":
                // AI.DOC Rule R2: Standard Routine  
                return {
                    min: 3,
                    max: 5,
                    budgetSplit: { basics: 60, treatments: 40 }
                };

            case "15+_minute":
                // AI.DOC Rule R3: Comprehensive Routine
                return {
                    min: 4,
                    max: 6,
                    budgetSplit: { basics: 50, treatments: 50 }
                };

            default:
                return {
                    min: 3,
                    max: 5,
                    budgetSplit: { basics: 60, treatments: 40 }
                };
        }
    }

    /**
     * Validate routine meets AI.DOC essential requirements
     * AI.DOC Rule R4: Essential Categories
     */
    static validateEssentialCategories(products: any[]): {
        isValid: boolean;
        missing: string[];
        hasCleanser: boolean;
        hasMoisturizer: boolean;
        hasSPF: boolean;
    } {
        const missing: string[] = [];

        // Check for cleanser
        const hasCleanser = products.some(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("cleanse");
        });

        // Check for moisturizer  
        const hasMoisturizer = products.some(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("moisturize");
        });

        // Check for SPF (standalone or in moisturizer)
        const hasSPF = products.some(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("protect") || this.hasSpfInMoisturizer(p);
        });

        if (!hasCleanser) missing.push("cleanser");
        if (!hasMoisturizer) missing.push("moisturizer");
        if (!hasSPF) missing.push("spf");

        return {
            isValid: missing.length === 0,
            missing,
            hasCleanser,
            hasMoisturizer,
            hasSPF
        };
    }

    /**
     * Check if product needs eye cream based on concerns
     * AI.DOC Rule R5: Eye cream ONLY if "dark circles" concern
     */
    static needsEyeCream(concerns: string[]): boolean {
        return concerns.some(concern =>
            concern.toLowerCase().includes("dark circles") ||
            concern.toLowerCase().includes("eye")
        );
    }

    /**
     * Validate exfoliation limits per AI.DOC Rule R6
     * ALLOW ONLY ONE exfoliating product per routine
     */
    static validateExfoliationLimits(products: any[]): {
        isValid: boolean;
        exfoliatingProducts: any[];
        recommendation: string;
    } {
        const exfoliatingProducts = products.filter(p => this.isExfoliating(p));

        if (exfoliatingProducts.length <= 1) {
            return {
                isValid: true,
                exfoliatingProducts,
                recommendation: "Exfoliation limit compliant"
            };
        }

        // AI.DOC: Prefer exfoliating treatment over exfoliating cleanser
        const exfoliatingCleansers = exfoliatingProducts.filter(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("cleanse");
        });

        const exfoliatingTreatments = exfoliatingProducts.filter(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("treat");
        });

        return {
            isValid: false,
            exfoliatingProducts,
            recommendation: exfoliatingTreatments.length > 0 ?
                "Remove exfoliating cleanser, keep exfoliating treatment" :
                "Remove excess exfoliating products, keep only one"
        };
    }

    /**
     * Validate step caps per AI.DOC Rule R7
     * Max 1 cleanser, 1 moisturizer, 1 SPF per routine
     */
    static validateStepCaps(products: any[]): {
        isValid: boolean;
        violations: string[];
    } {
        const violations: string[] = [];

        // Count cleansers
        const cleansers = products.filter(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("cleanse");
        });
        if (cleansers.length > 1) {
            violations.push(`${cleansers.length} cleansers found (max 1 allowed)`);
        }

        // Count moisturizers
        const moisturizers = products.filter(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("moisturize");
        });
        if (moisturizers.length > 1) {
            violations.push(`${moisturizers.length} moisturizers found (max 1 allowed)`);
        }

        // Count SPF products
        const spfProducts = products.filter(p => {
            const steps = this.getProductSteps(p);
            return steps.includes("protect");
        });
        if (spfProducts.length > 1) {
            violations.push(`${spfProducts.length} SPF products found (max 1 allowed)`);
        }

        return {
            isValid: violations.length === 0,
            violations
        };
    }

    // Helper methods
    private static getProductSteps(product: any): string[] {
        const steps: string[] = [];

        if (product.function?.length) {
            for (const func of product.function) {
                if (func?.name) {
                    steps.push(func.name.toLowerCase());
                }
            }
        }

        return steps;
    }

    private static hasSpfInMoisturizer(product: any): boolean {
        const productText = [
            product.productName || "",
            product.summary?.plain_text || ""
        ].join(" ").toLowerCase();

        return /spf|sunscreen|sun protection/.test(productText);
    }

    private static isExfoliating(product: any): boolean {
        // AI.DOC Rule R6: Check for exfoliating ingredients and terms
        const text = [
            product.productName || "",
            product.summary?.plain_text || ""
        ].join(" ").toLowerCase();

        const exfoliatingTerms = /exfoliat|peel|resurface/;
        const exfoliatingActives = ["aha", "bha", "glycolic", "salicylic", "lactic", "pha"];

        if (exfoliatingTerms.test(text)) return true;

        const actives = product.primaryActiveIngredients || [];
        return actives.some((active: any) =>
            exfoliatingActives.includes((active?.name || "").toLowerCase())
        );
    }
}