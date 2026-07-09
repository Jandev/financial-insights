/**
 * Rate limiters for API routes — issues #17, #84.
 */

import rateLimit from 'express-rate-limit'

/** /api/llm/* — caps at 20 req/min per IP (LLM calls are expensive). */
export const llmRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to LLM endpoints. Please wait before trying again.',
  },
})

/** /api/config and /api/transactions/* — caps at 60 req/min per IP. */
export const fileSystemRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait before trying again.',
  },
})
