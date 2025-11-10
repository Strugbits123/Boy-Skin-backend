/**
 * Debug validation logic to check combo product detection
 */
const ProductUtils = require('./dist/services/ProductRecommendation/utils/ProductUtils').ProductUtils;

const testProduct = {
    productName: "Hyaluronic Acid Watery Sun Gel SPF50+ PA++++",
    step: [
        { name: "Step 4: Protect" },
        { name: "Step 3: Moisturize" }
    ]
};

console.log('🔍 DEBUG: Testing combo product detection');
console.log('Product:', testProduct.productName);
console.log('Steps:', testProduct.step.map(s => s.name));

const steps = ProductUtils.productSteps(testProduct);
console.log('Parsed steps:', steps);

const hasMoisturize = steps.includes("moisturize");
const hasProtect = steps.includes("protect");

console.log('Has moisturize step:', hasMoisturize);
console.log('Has protect step:', hasProtect);
console.log('Is combo product:', hasMoisturize && hasProtect);