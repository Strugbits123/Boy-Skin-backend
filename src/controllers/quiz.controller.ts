
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
            const requiredFields = ["Name", "Email", "Age", "Gender", "Country", "wakeUpSkinType", "skinSensitivity", "work_on", "work_on_acne", "Budget", "routine_time", "additional_info", "terms_accepted", "newsletter_option"];
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
                work_on_acne: body.work_on_acne,
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
                treatmentApproach: recommendedProduct.treatmentApproach,
                clinicalReasoning: recommendedProduct.clinicalReasoning,
                totalCost: recommendedProduct.totalCost,
                tips: recommendedProduct.tips
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
            if (!quizId) {
                return res.status(400).json({
                    success: false,
                    message: "Quiz ID is required",
                    data: null
                });
            }
            const quizResults = await DbService.getOneData("quiz-results", {
                _id: new ObjectId(quizId.toString())
            });
            if (!quizResults) {
                return res.status(404).json({
                    success: false,
                    message: "Quiz results not found",
                    data: null
                });
            }
            const quizData: QuizResults = quizResults as QuizResults;
            const allProducts = await DbService.getCachedNotionProducts();
            const finalProducts = [];
            for (const product of quizData.productsId) {
                const productData = allProducts.find((p) => p.productId === product);
                if (productData) {
                    finalProducts.push(productData);
                }
            }
            const userQuizData = await DbService.getOneData("quizs", {
                _id: new ObjectId(quizData.quizId.toString())
            });
            if (!userQuizData) {
                return res.status(404).json({
                    success: false,
                    message: "User quiz data not found",
                    data: null
                });
            }
            const finalUserQuizData: QuizModel = userQuizData as unknown as QuizModel;

            const response = {
                resultsId: quizData._id?.toString(),
                userName: finalUserQuizData.Name,
                userEmail: finalUserQuizData.Email,
                userAge: finalUserQuizData.Age,
                userGender: finalUserQuizData.Gender,
                userCountry: finalUserQuizData.Country,
                userWakeUpSkinType: finalUserQuizData.wakeUpSkinType,
                userSkinSensitivity: finalUserQuizData.skinSensitivity,
                userWorkOn: finalUserQuizData.work_on,
                userBudget: finalUserQuizData.Budget,
                userRoutineTime: finalUserQuizData.routine_time,
                userAdditionalInfo: finalUserQuizData.additional_info,
                products: finalProducts,
                treatmentApproach: quizData.treatmentApproach,
                clinicalReasoning: quizData.clinicalReasoning,
                totalCost: quizData.totalCost,
                tips: quizData.tips
            };

            return res.status(200).json({
                success: true,
                message: "Quiz results fetched successfully",
                data: response
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