interface ConcernAnalysis {
    concerns: string[];
    primaryConcern: string;
    secondaryConcern?: string;
    treatmentApproach: 'single' | 'dual' | 'complex';
}

interface ProductRecommendation {
    productId: string;
    productName: string;
    targetConcern: string;
    priority: 'primary' | 'secondary';
    routineStep: number;
    price: number;
    usageInstructions: string;
}

interface RecommendationResponse {
    success: boolean;
    treatmentApproach: 'single' | 'dual' | 'complex';
    products: ProductRecommendation[];
    totalCost: number;
    budgetUtilization: string;
    clinicalReasoning: string;
    tips: string[];
}

// Quiz data without email for processing
interface ProcessedQuizData {
    Name: string;
    Age: string;
    Gender: string;
    Country: string;
    wakeUpSkinType: string;
    skinSensitivity: string;
    work_on: string;
    Budget: string;
    routine_time: string;
    additional_info: string;
    terms_accepted: string;
    newsletter_option: string;
    RecommendedproductId?: string;
}

export { ConcernAnalysis, ProductRecommendation, RecommendationResponse, ProcessedQuizData }; 