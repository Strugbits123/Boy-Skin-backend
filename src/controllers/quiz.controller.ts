
import type { Request, Response } from "express";
import ValidationService from "../services/helper.service";
import type { QuizModel } from "../models/quiz.model";
import DbService from "../services/db.service";
import RecommendationService from "../services/recommendation.service";
import { ObjectId } from "mongodb";
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
            const insertedQuizId = await DbService.insertOneData("quizs", {
                RecommendedproductIds: [],
                ...insertingData
            });
            const recommendedProduct = await RecommendationService.getFinalProduct(insertingData);
            if (!recommendedProduct) {
                return res.status(500).json({
                    success: false,
                    message: "An Unknown Error Occured",
                    data: null
                });
            }
            const recommendedProducts = recommendedProduct.products;
            const allProducts = await DbService.getCachedNotionProducts();
            const finalProducts = [];
            for (const product of recommendedProducts) {
                const productData = allProducts.find((p) => p.productId === product.productId);
                if (productData) {
                    finalProducts.push(productData);
                }
            }
            console.log(`Recommended Products Routine Instructions: ${recommendedProduct.routineInstructions}\n\nRecommended Products Safety Notes: ${recommendedProduct.safetyNotes}\n\nRecommended Products Treatment Approach: ${recommendedProduct.treatmentApproach}\n\nRecommended Products Clinical Reasoning: ${recommendedProduct.clinicalReasoning}\n\nRecommended Products Total Cost: ${recommendedProduct.totalCost}`);
            await DbService.updateOneData("quizs", {
                RecommendedproductIds: finalProducts.map((p) => p.productId)
            }, {
                _id: new ObjectId(insertedQuizId)
            });
            return res.status(200).json({
                success: true,
                message: "Quiz created successfully",
                data: {
                    quizId: insertedQuizId,
                    products: finalProducts,
                    routineInstructions: recommendedProduct.routineInstructions,
                    safetyNotes: recommendedProduct.safetyNotes,
                    treatmentApproach: recommendedProduct.treatmentApproach,
                    clinicalReasoning: recommendedProduct.clinicalReasoning,
                    totalCost: recommendedProduct.totalCost
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
}

export default QuizController;