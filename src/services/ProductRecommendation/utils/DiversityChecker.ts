/**
 * Product Diversity Engine
 * Ensures variety in product recommendations across different users
 */

import Product from "../../../models/product.model";
import { AICompatibleQuizModel } from "../../../models/quiz.model";

export class DiversityChecker {
    private static recentRecommendations: Map<string, Set<string>> = new Map();

    /**
     * Adds variety to product selection to avoid repetitive recommendations
     */
    static ensureDiversity(
        selection: Product[],
        aiQuiz: AICompatibleQuizModel,
        alternatives: Product[]
    ): Product[] {
        const userKey = `${aiQuiz.skinAssessment.skinType}_${aiQuiz.skinAssessment.skinSensitivity}`;
        const recentForType = this.recentRecommendations.get(userKey) || new Set();

        const diverseSelection: Product[] = [];

        for (const product of selection) {
            // console.log(`🔄 DIVERSITY CHECK: ${product.productName} | Recent: ${recentForType.has(product.productId)}`);

            if (!recentForType.has(product.productId) || diverseSelection.length < 3) {
                diverseSelection.push(product);
                recentForType.add(product.productId);
                // console.log(`   ✅ KEPT ORIGINAL: ${product.productName}`);
            } else {
                const alternative = alternatives.find(alt =>
                    !recentForType.has(alt.productId) &&
                    alt.function?.some(f => product.function?.some(pf => pf.name === f.name))
                );

                if (alternative) {
                    // console.log(`   🔄 SWAPPED: ${product.productName} → ${alternative.productName}`);
                    diverseSelection.push(alternative);
                    recentForType.add(alternative.productId);
                } else {
                    // console.log(`   ✅ KEPT (NO ALT): ${product.productName}`);
                    diverseSelection.push(product);
                    recentForType.add(product.productId);
                }
            }
        }

        this.recentRecommendations.set(userKey, recentForType);

        if (recentForType.size > 20) {
            const recentArray = Array.from(recentForType);
            const keepRecent = new Set(recentArray.slice(-15));
            this.recentRecommendations.set(userKey, keepRecent);
        }

        return diverseSelection;
    }

    /**
     * Clears recommendation history for testing
     */
    static clearHistory(): void {
        this.recentRecommendations.clear();
    }
}