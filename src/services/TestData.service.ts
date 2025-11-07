/**
 * Test Data Injection Service
 * Injects sample user data and validates recommendation system on server startup
 */

import RecommendationService from "./recommendation.service";
import { QuizModel } from "../models/quiz.model";
import { RecommendationResponse, ProductRecommendation } from "../models/recommendation.model";

interface TestUserProfile {
    name: string;
    email: string;
    age: string;
    skinType: string;
    skinSensitivity: string;
    concerns: string[];
    budget: string;
    routineTime: string;
    expectedProducts: string[];
}

class TestDataService {

    private static readonly TEST_PROFILES: TestUserProfile[] = [
        {
            name: "Sarah Chen",
            email: "sarah.test@example.com",
            age: "18-24",
            skinType: "Combination",
            skinSensitivity: "Sensitive",
            concerns: ["acne", "texture", "hyperpigmentation", "redness"],
            budget: "110",
            routineTime: "ten_minute",
            expectedProducts: [
                "Cosmic Dew Gel to Foam Water Cleanser",
                "Redness Relief Azelaic Acid Serum",
                "Salmon DNA PDRN Peptide Serum",
                "UV Clear Face Sunscreen SPF 46"
            ]
        },
        {
            name: "Michael Rodriguez",
            email: "michael.test@example.com",
            age: "25-34",
            skinType: "Oily",
            skinSensitivity: "Normal",
            concerns: ["active acne", "hyperpigmentation", "texture", "large pores", "fine lines"],
            budget: "160",
            routineTime: "fifteen_minute",
            expectedProducts: [
                "Cerave Foaming Facial Cleanser",
                "Iope Retinol Superbounce",
                "The Ordinary Niacinamide 10% + Zinc 1%",
                "Order of the Eclipse Hyaluronic Cream",
                "Supergoop Unseen Sunscreen"
            ]
        },
        {
            name: "Emma Thompson",
            email: "emma.test@example.com",
            age: "35-44",
            skinType: "Dry",
            skinSensitivity: "Sensitive",
            concerns: ["fine lines", "dryness", "dullness", "dark circles"],
            budget: "120",
            routineTime: "ten_minute",
            expectedProducts: [
                "Pure Clean Daily Facial Cleanser",
                "Relief Sun: Rice + Probiotic SPF50",
                "Retinol Serum",
                "Hyaluronic Acid Moisturizer"
            ]
        },
        {
            name: "James Wilson",
            email: "james.test@example.com",
            age: "45-54",
            skinType: "Normal",
            skinSensitivity: "Normal",
            concerns: ["anti-aging", "hyperpigmentation", "dullness"],
            budget: "200",
            routineTime: "fifteen_minute",
            expectedProducts: [
                "Gentle Foaming Cleanser",
                "Vitamin C Serum",
                "Retinol Treatment",
                "Anti-Aging Moisturizer",
                "Broad Spectrum SPF 50"
            ]
        }
    ];

    /**
     * Runs automated testing of recommendation system with sample profiles
     */
    static async runStartupTests(): Promise<void> {
        console.log('\n🧪 RUNNING STARTUP RECOMMENDATION TESTS...\n');

        for (let i = 0; i < this.TEST_PROFILES.length; i++) {
            const profile = this.TEST_PROFILES[i];
            if (!profile) continue;

            console.log(`\n📋 Testing Profile ${i + 1}: ${profile.name}`);
            console.log(`Age: ${profile.age} | Skin: ${profile.skinType} | Sensitivity: ${profile.skinSensitivity}`);
            console.log(`Concerns: ${profile.concerns.join(', ')}`);
            console.log(`Budget: $${profile.budget} | Time: ${profile.routineTime}`);

            try {
                const testQuiz = this.createTestQuiz(profile);
                const recommendations = await RecommendationService.getRecommendedProduct(testQuiz);

                if (recommendations.success) {
                    console.log(`✅ SUCCESS - Generated ${recommendations.products?.length || 0} products`);
                    console.log(`💰 Total Cost: $${recommendations.totalCost || 0}`);

                    const productNames = recommendations.products?.map((p: ProductRecommendation) => p.productName) || [];
                    console.log(`📦 Products: ${productNames.join(', ')}`);

                    const tipCount = recommendations.tips?.length || 0;
                    console.log(`💡 Tips Generated: ${tipCount}`);

                    // Validate essential categories
                    const hasCleanser = productNames.some((name: string) => name.toLowerCase().includes('clean'));
                    const hasSPF = productNames.some((name: string) => name.toLowerCase().includes('spf') || name.toLowerCase().includes('sun'));
                    const hasTreatment = recommendations.products?.some((p: ProductRecommendation) => {
                        const name = p.productName?.toLowerCase() || '';
                        return name.includes('serum') || name.includes('retinol') || name.includes('acid') || name.includes('treatment');
                    });

                    console.log(`🔍 Validation: Cleanser=${hasCleanser} | SPF=${hasSPF} | Treatment=${hasTreatment}`);

                    if (!hasCleanser || !hasSPF) {
                        console.log(`⚠️  WARNING: Missing essential categories!`);
                    }

                } else {
                    console.log(`❌ FAILED: Recommendation failed`);
                }

            } catch (error) {
                console.log(`❌ ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            console.log('─'.repeat(80));
        }

        console.log('\n🎯 STARTUP TESTS COMPLETED!\n');
    }

    /**
     * Creates a test quiz object from user profile
     */
    private static createTestQuiz(profile: TestUserProfile): QuizModel {
        return {
            Name: profile.name,
            Email: profile.email,
            Age: profile.age,
            Gender: "Other",
            Country: "US",
            wakeUpSkinType: `${profile.skinType} Skin`,
            skinSensitivity: `${profile.skinSensitivity} Skin`,
            work_on: profile.concerns.join(', '),
            work_on_acne: profile.concerns.includes('acne') ? 'Yes' : 'No',
            Budget: profile.budget,
            routine_time: profile.routineTime,
            additional_info: "Test user for system validation",
            terms_accepted: "true",
            newsletter_option: "false"
        };
    }

    /**
     * Quick system health check 
     */
    static async quickHealthCheck(): Promise<boolean> {
        try {
            const testProfile = this.TEST_PROFILES[0];
            if (!testProfile) return false;

            const testQuiz = this.createTestQuiz(testProfile);
            const result = await RecommendationService.getRecommendedProduct(testQuiz);

            return result.success && (result.products?.length || 0) >= 3;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return false;
        }
    }
}

export default TestDataService;