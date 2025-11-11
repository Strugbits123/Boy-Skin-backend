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
    additionalInfo?: string;
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
            budget: "40",
            routineTime: "5_minute",
            expectedProducts: [
                "Prequelskin Gleanser Non-Drying Glycerin Cleanser",
                "Peach Slices Redness Relief Azelaic Acid Serum",
                "Beauty of Joseon Relief Sun: Rice + Probiotic SPF50"
            ],
            testCaseId: "CLIENT_TC_004"
        },
        {
            name: "Test Case 5",
            email: "test5@example.com",
            age: "18-24",
            skinType: "oily",
            skinSensitivity: "not sensitive",
            acneStatus: "active acne",
            concerns: ["texture", "hyperpigmentation", "redness", "shaving bumps"],
            budget: "110",
            routineTime: "5_minute",
            expectedProducts: [
                "Prequelskin Gleanser + SA Non-Drying Cleanser",
                "Klairs Midnight Blue Calming Cream",
                "Elta MD UV Clear Face Sunscreen SPF 46",
                "Tower 28 SOS Rescue Spray"
            ],
            testCaseId: "CLIENT_TC_005"
        },
        {
            name: "Test Case 6",
            email: "test6@example.com",
            age: "18-24",
            skinType: "normal",
            skinSensitivity: "not sensitive",
            acneStatus: "acne-prone",
            concerns: ["texture", "pores", "dullness"],
            budget: "100",
            routineTime: "10_minute",
            additionalInfo: "allergic to niacinamide",
            expectedProducts: [
                "Neutrogena Hydro Boost Hydrating Gel Cleanser",
                "The Ordinary Glycolic Acid 7% Exfoliating Toner",
                "Bubble Slam Dunk Hydrating Face Moisturizer",
                "La Roche-Posay Anthelios UV Hydra Daily Invisible Sunscreen SPF 50"
            ],
            testCaseId: "CLIENT_TC_006"
        }
    ];

    /**
     * Runs client test cases validation
     */
    static async runClientTestCases(): Promise<void> {
        console.log('\n🎯 RUNNING CLIENT TEST CASES\n');
        console.log('='.repeat(80));

        for (let i = 0; i < this.CLIENT_TEST_CASES.length; i++) {
            const testCase = this.CLIENT_TEST_CASES[i];
            if (!testCase) continue;

            console.log(`\n📋 Got Product of ${testCase.testCaseId}: ${testCase.name}`);
            console.log(`\nTest Case Data:`);
            console.log(`  Age: ${testCase.age}`);
            console.log(`  Skin Type: ${testCase.skinType}`);
            console.log(`  Sensitivity: ${testCase.skinSensitivity}`);
            console.log(`  Acne Status: ${testCase.acneStatus}`);
            console.log(`  Concerns: ${testCase.concerns.join(', ')}`);
            console.log(`  Budget: $${testCase.budget}`);
            console.log(`  Routine Time: ${testCase.routineTime}`);
            if (testCase.additionalInfo) {
                console.log(`  Additional Info: ${testCase.additionalInfo}`);
            }

            try {
                const testQuiz = this.createClientTestQuiz(testCase);
                const recommendations = await RecommendationService.getFinalProduct(testQuiz);

                if (recommendations && recommendations.products && recommendations.products.length > 0) {
                    console.log(`\nProducts (Total Cost: $${recommendations.totalCost || 0}):\n`);

                    recommendations.products.forEach((product, idx) => {
                        console.log(`  ${idx + 1}. ${product.productName || 'UNKNOWN'} - $${product.price || 0}`);
                    });

                    if (recommendations.tips && recommendations.tips.length > 0) {
                        console.log(`\nImportant Notes:\n`);
                        recommendations.tips.forEach((tip, idx) => {
                            console.log(`  ${idx + 1}. ${tip}`);
                        });
                    }

                    const accuracy = this.calculateAccuracy(recommendations.products, testCase.expectedProducts);
                    console.log(`\n✅ Accuracy: ${accuracy.toFixed(1)}%`);

                } else {
                    console.log(`\n❌ No products recommended`);
                }

            } catch (error) {
                console.log(`\n❌ ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            console.log('\n' + '─'.repeat(80));
        }

        console.log('\n🎯 CLIENT TEST CASES COMPLETED\n');
    }

    /**
     * Calculate accuracy between actual and expected products
     */
    private static calculateAccuracy(actualProducts: ProductRecommendation[], expectedProducts: string[]): number {
        const actualNames = actualProducts.map(p => p.productName || 'UNKNOWN');

        const matchingProducts = expectedProducts.filter(expected =>
            actualNames.some(actual => {
                return actual.toLowerCase().includes(expected.toLowerCase()) ||
                    expected.toLowerCase().includes(actual.toLowerCase());
            })
        );

        return (matchingProducts.length / expectedProducts.length) * 100;
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
            additional_info: testCase.additionalInfo || `Client test case: ${testCase.testCaseId}`,
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
