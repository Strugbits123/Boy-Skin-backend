import express from "express";
import AccessMiddleware from "../middlewares/access.middleware";
import QuizController from "../controllers/quiz.controller";
import { createGlobalConcurrentRateLimiter } from "../middlewares/rate.limiter.middleware";

const quizRouter = express.Router();

const rateLimiter = createGlobalConcurrentRateLimiter({
    maxConcurrent: 5,
    message: "Too many requests, please try again later",
    statusCode: 429,
    skipSuccessfulRequests: true,
    skipFailedRequests: true,
    onLimitReached: (req) => {
        console.warn(
            JSON.stringify({
                level: "warn",
                event: "RateLimitExceeded",
                ip: req.ip,
                path: req.originalUrl,
                method: req.method,
                timestamp: new Date().toISOString()
            })
        );
    }
});

quizRouter.post("/add-quiz", AccessMiddleware.checkAccess, rateLimiter.middleware(), QuizController.addQuiz);

quizRouter.get("/get-quiz-results/:id", AccessMiddleware.checkAccess, QuizController.getQuizResults);


export default quizRouter;