import { ObjectId } from "mongodb";

interface QuizResults {
    _id?: ObjectId;
    quizId: string;
    productsId: string[];
    treatmentApproach: string;
    clinicalReasoning: string;
    totalCost: number;
    tips: string[];
}

export default QuizResults;