/**
 * Conversational financial advisor routes — issue #21.
 *
 *   POST   /api/llm/chat                     — send message, get threadId
 *   GET    /api/llm/chat/:threadId/stream    — stream response (SSE)
 *   DELETE /api/llm/chat/:threadId           — clear conversation history
 */

import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { createSSEStream } from '../lib/sse.js'
import { getAdvisor, clearAdvisorThread } from '../services/advisor.js'
import type { StateStore } from '../services/stateStore.js'

// In-memory queue: threadId → pending user message
const pendingMessages = new Map<string, string>()

export function createChatRouter(stateStore: StateStore): Router {
  const router = Router()

  // POST /api/llm/chat
  router.post('/chat', (req, res) => {
    const body = req.body as { message?: string; threadId?: string }

    if (!body.message || typeof body.message !== 'string') {
      res.status(400).json({ error: 'Expected { message: string }' })
      return
    }

    const threadId = body.threadId ?? randomUUID()
    const messageId = randomUUID()

    // Queue the message for the SSE stream endpoint to consume.
    // Schedule a 30-second TTL so orphaned entries (client dropped after POST
    // but before GET /stream) don't accumulate indefinitely.
    pendingMessages.set(threadId, body.message)
    setTimeout(() => pendingMessages.delete(threadId), 30_000)

    res.status(202).json({ threadId, messageId })
  })

  // GET /api/llm/chat/:threadId/stream
  router.get('/chat/:threadId/stream', async (req, res) => {
    const { threadId } = req.params
    const message = pendingMessages.get(threadId)

    if (!message) {
      res.status(400).json({ error: 'No pending message for this threadId.' })
      return
    }

    pendingMessages.delete(threadId)
    const sse = createSSEStream(res)

    try {
      const advisor = getAdvisor(stateStore)
      if (!advisor) {
        sse.send({ type: 'error', message: 'LLM not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in your .env.' })
        sse.end()
        return
      }

      const config = { configurable: { thread_id: threadId } }

      // Stream events from the LangGraph agent
      const eventStream = advisor.streamEvents(
        { messages: [{ role: 'user', content: message }] },
        { ...config, version: 'v2' },
      )

      for await (const event of eventStream) {
        if (event.event === 'on_chat_model_stream') {
          const chunk = event.data?.chunk
          const token: string = chunk?.content ?? ''
          if (token) sse.send({ type: 'token', text: token })
        } else if (event.event === 'on_tool_start') {
          sse.send({
            type: 'tool_call',
            tool: event.name,
            input: event.data?.input,
          })
        } else if (event.event === 'on_tool_end') {
          sse.send({
            type: 'tool_result',
            tool: event.name,
            summary: `${event.name} completed`,
          })
          // Signal the frontend to refresh AI categories from StateStore
          if (event.name === 'runCategorization') {
            sse.send({ type: 'categories_updated' })
          }
        }
      }

      sse.send({ type: 'done' })
    } catch (err) {
      console.error('[chat] streaming error:', err)
      sse.send({ type: 'error', message: 'An error occurred. Please try again.' })
    }

    sse.end()
  })

  // DELETE /api/llm/chat/:threadId
  router.delete('/chat/:threadId', (req, res) => {
    const { threadId } = req.params
    clearAdvisorThread(threadId)
    res.json({ cleared: true })
  })

  return router
}
