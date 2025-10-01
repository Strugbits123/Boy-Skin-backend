import DbService from "./db.service";
import DatabaseConfig from "../config/db";
import RecommendationService from "./recommendation.service";


class AppStarterService {
    static async onStartApp() {
        DatabaseConfig.connectToDatabase();
        await DbService.startCacheUpdateCron();

        // Comprehensive Test Suite(Docs - aligned)
        // const testCases = [
        //     {
        //         name: "Martha Howard",
        //         data: {
        //             "Name": "Martha Howard",
        //             "Email": "martha@gmail.com",
        //             "Age": "20-25",
        //             "Gender": "Female",
        //             "Country": "UAE",
        //             "wakeUpSkinType": "Dry Skin",
        //             "skinSensitivity": "Not Sensitive Skin",
        //             "work_on": "Acne",
        //             "Budget": "40",
        //             "routine_time": "ten_minute",
        //             "additional_info": "No Additional Provided",
        //             "terms_accepted": "on",
        //             "newsletter_option": "off"
        //         }
        //     },
        //     {
        //         name: "John Davis",
        //         data: {
        //             "Name": "John Davis",
        //             "Email": "john@gmail.com",
        //             "Age": "25-30",
        //             "Gender": "Male",
        //             "Country": "USA",
        //             "wakeUpSkinType": "Combination Skin",
        //             "skinSensitivity": "Slightly Sensitive",
        //             "work_on": "Acne, Dryness",
        //             "Budget": "80",
        //             "routine_time": "twenty_minute",
        //             "additional_info": "Looking for comprehensive routine",
        //             "terms_accepted": "on",
        //             "newsletter_option": "off"
        //         }
        //     },
        //     {
        //         name: "Sarah Johnson",
        // data: {
        //     "Name": "Sarah Johnson",
        //     "Email": "sarah@gmail.com",
        //     "Age": "30-35",
        //     "Gender": "Female",
        //     "Country": "Canada",
        //     "wakeUpSkinType": "Sensitive Skin",
        //     "skinSensitivity": "Very Sensitive",
        //     "work_on": "Anti-aging, Dryness, Dark Spots",
        //     "Budget": "120",
        //     "routine_time": "thirty_minute",
        //     "additional_info": "Has sensitive skin issues",
        //     "terms_accepted": "on",
        //     "newsletter_option": "off"
        // }
        //     },
        //     {
        //         name: "Michael Brown ",
        //         data: {
        //             "Name": "Michael Brown",
        //             "Email": "michael@gmail.com",
        //             "Age": "22-25",
        //             "Gender": "Male",
        //             "Country": "UK",
        //             "wakeUpSkinType": "Oily Skin",
        //             "skinSensitivity": "Not Sensitive Skin",
        //             "work_on": "Acne, Pores",
        //             "Budget": "200",
        //             "routine_time": "thirty_minute",
        //             "additional_info": "High budget test",
        //             "terms_accepted": "on",
        //             "newsletter_option": "off"
        //         }
        //     }
        // ];

        // console.log(`\n🧪 TESTING DOCS-ALIGNED SYSTEM...\n`);

        // try {
        //     let testCount = 0;
        //     let successCount = 0;

        //     for (const testCase of testCases) {
        //         testCount++;
        //         try {
        //             console.log(`📋 TEST ${testCount}: ${testCase.data.work_on} | ${testCase.data.wakeUpSkinType} | $${testCase.data.Budget}`);

        //             const result = await RecommendationService.getFinalProduct(testCase.data);

        //             if (result && result.success) {
        //                 successCount++;
        //                 console.log(`✅ SUCCESS: ${result.products.length} products | ${result.budgetUtilization} | ${result.treatmentApproach.toUpperCase()}`);
        //                 console.log(`Products : ${JSON.stringify(result.products)}`);

        //                 // Show routine structure
        //                 const routine = result.products.map(p => `${p.productName} ($${p.price})`).join(' + ');
        //                 console.log(`   📦 Routine: ${routine}`);

        //                 if (result.safetyNotes.length > 0) {
        //                     console.log(`   ⚠️  Notes: ${result.safetyNotes.slice(0, 2).join(', ')}`);
        //                 }
        //             } else if (result && !result.success) {
        //                 console.log(`   ⚠️  NO MATCH: ${result.clinicalReasoning}`);
        //                 successCount++; // NO_MATCH is also a valid success response
        //             } else {
        //                 console.log(`   ❌ FAILED: Unexpected result`);
        //             }

        //         } catch (error: any) {
        //             console.log(`   ❌ ERROR: ${error.message}`);
        //         }

        //         console.log(''); // Space between tests
        //     }

        //     // Final Results
        //     console.log(`🎯 RESULTS: ${successCount}/${testCount} tests completed`);
        //     console.log(`📊 Success Rate: ${Math.round((successCount / testCount) * 100)}%`);
        //     console.log(`🏥 System Status: ${successCount === testCount ? '✅ PRODUCTION READY' : '⚠️  NEEDS REVIEW'}\n`);

        //     if (successCount === testCount) {
        //         console.log(`🚀 DOCS-ALIGNED SYSTEM OPERATIONAL`);
        //         console.log(`   • Pre-filtering: Active`);
        //         console.log(`   • Ingredient scoring: Implemented`);
        //         console.log(`   • Routine structure: Enforced`);
        //         console.log(`   • Safety constraints: Applied`);
        //         console.log(`   • Budget optimization: Active\n`);
        //     }

        // } catch (error: any) {
        //     console.error(`🚨 System Error: ${error?.message}`);
        // }
    }
}

export default AppStarterService;