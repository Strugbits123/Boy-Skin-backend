import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

class AccessMiddleware {
    static async checkAccess(req: Request, res: Response, next: NextFunction) {
        try {
            const secretKey = req.headers["secret-key"] as string | undefined;

            if (!secretKey) {
                return res.status(401).json({
                    success: false,
                    message: "missing Secret Key",
                });
            }
            const secret = process.env.SECRET_ACCESS_KEY;
            if (!secret) {
                throw new Error("SECRET ACCESS KEY is not set in .env");
            }
            if (secretKey !== secret) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid secret Key",
                });
            }
            return next();
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Internal server error",
            });
        }
    }
}

export default AccessMiddleware;
