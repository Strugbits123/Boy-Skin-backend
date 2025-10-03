import { ObjectId } from "mongodb";

interface QuizResults {
    _id?: ObjectId;
    quizId: string;
    productsId: string[];
    routineInstructions: string[];
    safetyNotes: string[];
    treatmentApproach: string;
    clinicalReasoning: string;
    totalCost: number;
}

export default QuizResults;