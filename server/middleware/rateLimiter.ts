/**
 * Rate limiter for /api/llm/* routes — issue #17.
 *
 * Caps at 20 requests per minute per IP to prevent accidental or
 * malicious over-use of the LLM endpoints.
 */

import rateLimit from 'express-rate-limit'

export const llmRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to LLM endpoints. Please wait before trying again.',
  },
})
