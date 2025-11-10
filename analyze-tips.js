/**
 * Debug script to analyze system tips and user notes
 */
const TestDataService = require('./dist/services/TestData.service').default;
const ProductFilter = require('./dist/services/ProductRecommendation/ProductFilter').default;

async function analyzeTips() {
    console.log('🔍 ANALYZING SYSTEM TIPS AND NOTES');
    console.log('='.repeat(60));

    try {
        // Run single test case to capture tips
        const results = await TestDataService.runClientTestCases();

        console.log('\n📝 SYSTEM TIPS/NOTES ANALYSIS:');
        console.log('='.repeat(60));

        // Get user notes from ProductFilter
        const userNotes = ProductFilter.getUserNotes();

        if (userNotes && userNotes.length > 0) {
            console.log('\n💡 User Notes Generated:');
            userNotes.forEach((note, i) => {
                console.log(`${i + 1}. ${note}`);
            });
        } else {
            console.log('\n⚠️ No user notes found - this might indicate silent failures');
        }

        // Analyze each test case result
        results.forEach((result, index) => {
            console.log(`\n📊 Test Case ${index + 1} Analysis:`);
            console.log(`Products count: ${result.recommendedProducts.length}`);

            // Check if essential categories are met
            const hasCleanser = result.recommendedProducts.some(p =>
                p.step?.some(s => s.name?.toLowerCase().includes('cleanse'))
            );
            const hasMoisturizer = result.recommendedProducts.some(p =>
                p.step?.some(s => s.name?.toLowerCase().includes('moistur')) ||
                p.function?.some(f => f.name?.toLowerCase().includes('hydrate'))
            );
            const hasProtect = result.recommendedProducts.some(p =>
                p.step?.some(s => s.name?.toLowerCase().includes('protect')) ||
                p.function?.some(f => f.name?.toLowerCase().includes('protect'))
            );

            console.log(`Essential check: Cleanser=${hasCleanser}, Moisturizer=${hasMoisturizer}, SPF=${hasProtect}`);

            // Check for combo products
            const comboProducts = result.recommendedProducts.filter(p => {
                const hasMultipleSteps = (p.step || []).length > 1;
                const hasMultipleFunctions = (p.function || []).length > 1;
                return hasMultipleSteps || hasMultipleFunctions;
            });

            if (comboProducts.length > 0) {
                console.log(`🔗 Combo products found: ${comboProducts.length}`);
                comboProducts.forEach(combo => {
                    const steps = (combo.step || []).map(s => s.name).join(', ');
                    const functions = (combo.function || []).map(f => f.name).join(', ');
                    console.log(`  - ${combo.productName}: Steps(${steps}) Functions(${functions})`);
                });
            }
        });

    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    }
}

analyzeTips();