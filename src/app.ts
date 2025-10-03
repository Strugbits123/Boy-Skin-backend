import express from "express";
import dotenv from "dotenv";
import router from "./routes/index";
import cors from "cors";
import AppStarterService from "./services/App.starter.service";
dotenv.config();

const app = express();
const PORT = process.env.PORT;
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/api", router);

app.listen(PORT, () => {
    console.log(`🚀 Server Running: http://localhost:${PORT}`);
    AppStarterService.onStartApp();
});