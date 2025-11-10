/**
 * Test Data Injection Service
 * Client-provided test cases for recommendation system validation
 */

import RecommendationService from "./recommendation.service";
import { QuizModel } from "../models/quiz.model";
import { RecommendationResponse, ProductRecommendation } from "../models/recommendation.model";

interface ClientTestCase {
    name: string;
    email: string;
    age: string;
    skinType: string;
    skinSensitivity: string;
    acneStatus: string;
    concerns: string[];
    budget: string;
    routineTime: string;
    expectedProducts: string[];
    testCaseId: string;
}

class TestDataService {

    // Client-provided test cases
    private static readonly CLIENT_TEST_CASES: ClientTestCase[] = [
        {
            name: "Test Case 1",
            email: "test1@example.com",
            age: "18-24",
            skinType: "combination",
            skinSensitivity: "sensitive",
            acneStatus: "active acne",
            concerns: ["texture", "hyperpigmentation", "redness"],
            budget: "110",
            routineTime: "10_minute",
            expectedProducts: [
                "Cosmic Dew Gel to Foam Water Cleanser",
                "Redness Relief Azelaic Acid Serum",
                "Salmon DNA PDRN Peptide Serum",
                "UV Clear Face Sunscreen SPF 46"
            ],
            testCaseId: "CLIENT_TC_001"
        },
        {
            name: "Test Case 2",
            email: "test2@example.com",
            age: "25-34",
            skinType: "oily",
            skinSensitivity: "not sensitive",
            acneStatus: "active acne",
            concerns: ["hyperpigmentation", "texture", "pores", "fine lines"],
            budget: "160",
            routineTime: "15+_minute",
            expectedProducts: [
                "Cerave Foaming Facial Cleanser",
                "Iope Retinol Superbounce",
                "The Ordinary Niacinamide 10% + Zinc 1%",
                "Order of the Eclipse Hyaluronic Cream",
                "Supergoop Unseen Sunscreen"
            ],
            testCaseId: "CLIENT_TC_002"
        },
        {
            name: "Test Case 3",
            email: "test3@example.com",
            age: "35-44",
            skinType: "dry",
            skinSensitivity: "not sensitive",
            acneStatus: "not active acne",
            concerns: ["texture", "pores", "fine lines", "dark circles", "dryness", "dullness"],
            budget: "200",
            routineTime: "15+_minute",
            expectedProducts: [
                "Cerave Hydrating Gel Cleanser",
                "Strive Anti-aging retinal serum",
                "Peach & Lily Glass Skin Refining Serum",
                "First Aid Beauty Ultra Repair Cream Intense Hydration",
                "Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++"
            ],
            testCaseId: "CLIENT_TC_003"
        },
        {
            name: "Test Case 4",
            email: "test4@example.com",
            age: "18-24",
            skinType: "combination",
            skinSensitivity: "sensitive",
            acneStatus: "active acne",
            concerns: ["pores", "hyperpigmentation", "redness"],
            budget: "0", // No budget specified
            routineTime: "5_minute",
            expectedProducts: [
                "Prequelskin Gleanser Non-Drying Glycerin Cleanser",
                "Peach Slices Redness Relief Azelaic Acid Serum",
                "Beauty of Joseon Relief Sun: Rice + Probiotic SPF50"
            ],
            testCaseId: "CLIENT_TC_004"
        }
    ];

    /**
     * Runs client test cases validation
     */
    static async runClientTestCases(): Promise<void> {
        console.log('\n🎯 RUNNING CLIENT TEST CASES...\n');
        console.log('='.repeat(80));

        for (let i = 0; i < this.CLIENT_TEST_CASES.length; i++) {
            const testCase = this.CLIENT_TEST_CASES[i];
            if (!testCase) continue;

            console.log(`\n📋 ${testCase.testCaseId}: ${testCase.name}`);
            console.log(`Age: ${testCase.age} | Skin: ${testCase.skinType} | Sensitivity: ${testCase.skinSensitivity}`);
            console.log(`Acne Status: ${testCase.acneStatus} | Concerns: ${testCase.concerns.join(', ')}`);
            console.log(`Budget: $${testCase.budget} | Time: ${testCase.routineTime}`);
            console.log(`Expected Products: ${testCase.expectedProducts.length}`);
            testCase.expectedProducts.forEach((prod, idx) => {
                console.log(`  ${idx + 1}. ${prod}`);
            });

            try {
                const testQuiz = this.createClientTestQuiz(testCase);
                const recommendations = await RecommendationService.getFinalProduct(testQuiz);

                if (recommendations) {
                    console.log(`\n✅ SYSTEM OUTPUT:`);
                    console.log(`💰 Total Cost: $${recommendations.totalCost || 0}`);

                    if (recommendations.products && recommendations.products.length > 0) {
                        console.log(`📦 Recommended Products (${recommendations.products.length}):`);
                        recommendations.products.forEach((product, idx) => {
                            console.log(`  ${idx + 1}. ${product.productName} - $${product.price || 0}`);
                        });

                        // Validate against client expectations
                        const actualProducts = recommendations.products.map(p => p.productName);
                        const matchingProducts = testCase.expectedProducts.filter(expected =>
                            actualProducts.some(actual =>
                                actual.toLowerCase().includes(expected.toLowerCase()) ||
                                expected.toLowerCase().includes(actual.toLowerCase())
                            )
                        );

                        console.log(`\n🔍 VALIDATION:`);
                        console.log(`Expected: ${testCase.expectedProducts.length} products`);
                        console.log(`Got: ${actualProducts.length} products`);
                        console.log(`Matches: ${matchingProducts.length} products`);

                        if (matchingProducts.length > 0) {
                            console.log(`✅ Matching products:`);
                            matchingProducts.forEach(match => console.log(`  - ${match}`));
                        }

                        const accuracy = (matchingProducts.length / testCase.expectedProducts.length) * 100;
                        console.log(`📊 Accuracy: ${accuracy.toFixed(1)}%`);

                        // Validate essentials - improved detection for combo products
                        const hasCleanser = actualProducts.some(name =>
                            name.toLowerCase().includes('cleanser') || name.toLowerCase().includes('wash'));
                        const hasMoisturizer = actualProducts.some(name => {
                            const lowerName = name.toLowerCase();
                            return lowerName.includes('moistur') || lowerName.includes('cream') ||
                                lowerName.includes('hydrat') || lowerName.includes('watery') ||
                                lowerName.includes('gel') || lowerName.includes('lotion');
                        });
                        const hasSPF = actualProducts.some(name =>
                            name.toLowerCase().includes('spf') || name.toLowerCase().includes('sun'));

                        console.log(`�️ Safety Check: Cleanser=${hasCleanser} | Moisturizer=${hasMoisturizer} | SPF=${hasSPF}`);

                        if (recommendations.clinicalReasoning) {
                            console.log(`💡 Clinical Reasoning: ${recommendations.clinicalReasoning.substring(0, 100)}...`);
                        }

                        if (accuracy >= 50) {
                            console.log(`🎉 TEST PASSED (${accuracy.toFixed(1)}% match)`);
                        } else {
                            console.log(`⚠️ TEST NEEDS REVIEW (${accuracy.toFixed(1)}% match)`);
                        }

                    } else {
                        console.log(`❌ No products recommended`);
                    }

                } else {
                    console.log(`❌ FAILED: No recommendations generated`);
                }

            } catch (error) {
                console.log(`❌ ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            console.log('─'.repeat(80));
        }

        console.log('\n🎯 CLIENT TEST CASES COMPLETED!\n');
    }

    /**
     * Creates a test quiz object from client test case
     */
    private static createClientTestQuiz(testCase: ClientTestCase): QuizModel {
        // Handle budget conversion
        let budgetValue = testCase.budget;
        if (budgetValue === "0" || !budgetValue) {
            budgetValue = "100"; // Default budget for no budget cases
        }

        return {
            Name: testCase.name,
            Email: testCase.email,
            Age: testCase.age,
            Gender: "Other",
            Country: "US",
            wakeUpSkinType: testCase.skinType,
            skinSensitivity: testCase.skinSensitivity,
            work_on: testCase.concerns.join(', '),
            work_on_acne: testCase.acneStatus,
            Budget: budgetValue,
            routine_time: testCase.routineTime,
            additional_info: `Client test case: ${testCase.testCaseId}`,
            terms_accepted: "true",
            newsletter_option: "false"
        };
    }

    /**
     * Quick system health check 
     */
    static async quickHealthCheck(): Promise<boolean> {
        try {
            const testCase = this.CLIENT_TEST_CASES[0];
            if (!testCase) return false;

            const testQuiz = this.createClientTestQuiz(testCase);
            const result = await RecommendationService.getFinalProduct(testQuiz);

            return result !== null && (result.products?.length || 0) >= 3;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return false;
        }
    }
}

export default TestDataService;