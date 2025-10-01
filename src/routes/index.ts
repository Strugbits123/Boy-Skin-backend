import express from "express";
import quizRouter from "./quiz.routes";

const router = express.Router();

router.use("/quiz", quizRouter);

export default router;