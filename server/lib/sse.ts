/**
 * Shared Server-Sent Events helper — used by all LLM streaming routes.
 *
 * Usage:
 *   const sse = createSSEStream(res)
 *   sse.send({ type: 'token', text: '...' })
 *   sse.end()
 */

import type { Response } from 'express'

export interface SSEStream {
  /** Send a JSON-serialisable event object. */
  send(event: Record<string, unknown>): void
  /** Close the SSE stream. */
  end(): void
}

/**
 * Set SSE headers on the response and return a send/end helper.
 * The caller is responsible for not writing after calling end().
 */
export function createSSEStream(res: Response): SSEStream {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable Nginx buffering
  res.flushHeaders()

  return {
    send(event) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    },
    end() {
      res.end()
    },
  }
}
