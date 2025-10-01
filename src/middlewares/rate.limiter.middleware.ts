import { Request, Response, NextFunction } from 'express';
import RateLimiterOptions from '../models/rate.limiter.model';

class GlobalConcurrentRateLimiter {
    private activeCount: number;
    private activeRequests: Set<string>;
    private options: Required<RateLimiterOptions>;

    constructor(options: RateLimiterOptions) {
        this.activeCount = 0;
        this.activeRequests = new Set();
        this.options = {
            maxConcurrent: options.maxConcurrent || 5,
            message: options.message || 'Too many concurrent requests. Please try again later.',
            statusCode: options.statusCode || 429,
            skipSuccessfulRequests: options.skipSuccessfulRequests || false,
            skipFailedRequests: options.skipFailedRequests || false,
            onLimitReached: options.onLimitReached || (() => { })
        };
    }

    private generateRequestId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    middleware = () => {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const requestId = this.generateRequestId();

            // Check if limit exceeded
            if (this.activeCount >= this.options.maxConcurrent) {
                this.options.onLimitReached(req);

                console.warn(
                    `[Global Rate Limiter] Request BLOCKED. Active=${this.activeCount}, Limit=${this.options.maxConcurrent}`
                );

                res.status(this.options.statusCode).json({
                    success: false,
                    message: this.options.message,
                    data: {
                        maxConcurrent: this.options.maxConcurrent,
                        currentActive: this.activeCount,
                        retryAfter: 5 // seconds
                    }
                });
                return;
            }

            // Increment counter
            this.activeCount++;
            this.activeRequests.add(requestId);

            console.log(
                `[Global Rate Limiter] Request ALLOWED. Active=${this.activeCount}/${this.options.maxConcurrent}`
            );

            // Cleanup function
            const cleanup = (shouldCount: boolean = true) => {
                if (shouldCount && this.activeRequests.has(requestId)) {
                    this.activeCount--;
                    this.activeRequests.delete(requestId);

                    console.log(
                        `[Global Rate Limiter] Request CLEANUP. Active=${this.activeCount}/${this.options.maxConcurrent}`
                    );
                }
            };

            // Handle response finish
            const originalSend = res.send;
            const originalJson = res.json;
            let responseSent = false;

            const wrapResponse = (fn: any) => {
                return (...args: any[]) => {
                    if (!responseSent) {
                        responseSent = true;
                        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
                        const isFailure = res.statusCode >= 400;
                        const shouldCount = !(
                            (isSuccess && this.options.skipSuccessfulRequests) ||
                            (isFailure && this.options.skipFailedRequests)
                        );

                        cleanup(shouldCount);
                    }
                    return fn.apply(res, args);
                };
            };

            res.send = wrapResponse(originalSend);
            res.json = wrapResponse(originalJson);

            // Handle aborted requests
            req.on('close', () => {
                if (!responseSent) {
                    console.warn(`[Global Rate Limiter] Request ABORTED`);
                    cleanup();
                }
            });

            res.on('error', () => {
                if (!responseSent) {
                    console.error(`[Global Rate Limiter] Response ERROR`);
                    cleanup();
                }
            });

            next();
        };
    };

    // Get current stats
    getStats() {
        return {
            active: this.activeCount,
            max: this.options.maxConcurrent,
            requests: Array.from(this.activeRequests)
        };
    }

    // Reset all limits
    reset() {
        this.activeCount = 0;
        this.activeRequests.clear();
        console.log(`[Global Rate Limiter] RESET all limits`);
    }
}
export function createGlobalConcurrentRateLimiter(options: RateLimiterOptions) {
    return new GlobalConcurrentRateLimiter(options);
}

export { GlobalConcurrentRateLimiter, RateLimiterOptions };
