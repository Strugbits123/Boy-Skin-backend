
import type { Request, Response } from "express";
import ValidationService from "../services/helper.service";
import type { QuizModel } from "../models/quiz.model";
import DbService from "../services/db.service";
import RecommendationService from "../services/recommendation.service";
import { ObjectId } from "mongodb";
import QuizResults from "../models/quiz.results.model";
class QuizController {
    static async addQuiz(req: Request, res: Response) {
        try {
            const body = req.body ?? {};
            const requiredFields = ["Name", "Email", "Age", "Gender", "Country", "wakeUpSkinType", "skinSensitivity", "work_on", "Budget", "routine_time", "additional_info", "terms_accepted", "newsletter_option"];
            const isValid = ValidationService.validateBody(body, requiredFields);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: "Please fill all the Required Fields",
                    data: null
                });
            }

            const insertingData: QuizModel = {
                Name: body.Name,
                Email: body.Email,
                Age: body.Age,
                Gender: body.Gender,
                Country: body.Country,
                wakeUpSkinType: body.wakeUpSkinType,
                skinSensitivity: body.skinSensitivity,
                work_on: body.work_on,
                Budget: body.Budget,
                routine_time: body.routine_time,
                additional_info: body.additional_info,
                terms_accepted: body.terms_accepted,
                newsletter_option: body.newsletter_option

            };

            const recommendedProduct = await RecommendationService.getFinalProduct(insertingData);
            if (!recommendedProduct) {
                return res.status(500).json({
                    success: false,
                    message: "An Unknown Error Occured",
                    data: null
                });
            }
            const insertedQuizId = await DbService.insertOneData("quizs", {
                quizResultsDocId: "",
                ...insertingData
            });
            const recommendedProducts = recommendedProduct.products;
            const allProducts = await DbService.getCachedNotionProducts();
            const finalProducts = [];
            for (const product of recommendedProducts) {
                const productData = allProducts.find((p) => p.productId === product.productId);
                if (productData) {
                    finalProducts.push(productData);
                }
            }
            const quizResults: QuizResults = {
                quizId: insertedQuizId,
                productsId: finalProducts.map((p) => p.productId),
                routineInstructions: recommendedProduct.routineInstructions,
                safetyNotes: recommendedProduct.safetyNotes,
                treatmentApproach: recommendedProduct.treatmentApproach,
                clinicalReasoning: recommendedProduct.clinicalReasoning,
                totalCost: recommendedProduct.totalCost
            }
            const quizResultsId = await DbService.insertOneData("quiz-results", quizResults);
            await DbService.updateOneData("quizs", {
                quizResultsDocId: quizResultsId
            }, {
                _id: new ObjectId(insertedQuizId)
            });
            return res.status(200).json({
                success: true,
                message: "Quiz created successfully",
                data: {
                    quizId: insertedQuizId,
                    quizResultsId: quizResultsId
                }
            });
        } catch (error: any) {
            const message = error?.message ?? "An Unknown Error Occured"
            return res.status(500).json({
                success: false,
                message: message,
                data: null
            });
        }
    }
    static async getQuizResults(req: Request, res: Response) {
        try {
            const quizId = req.params.id;
        } catch (error) {

        }
    }
}

export default QuizController;