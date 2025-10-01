import { Request } from "express";

interface RateLimiterOptions {
    maxConcurrent: number;            // Max concurrent requests allowed globally
    message?: string;                 // Custom error message
    statusCode?: number;              // HTTP status code for rejection
    skipSuccessfulRequests?: boolean; // Don't count successful requests
    skipFailedRequests?: boolean;     // Don't count failed requests
    onLimitReached?: (req: Request) => void; // Callback when limit is reached
}

export default RateLimiterOptions;