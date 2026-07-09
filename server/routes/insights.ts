/**
 * Narrative insight streaming routes — issue #20.
 *
 *   GET    /api/llm/insights/:period  — generate/stream narrative (SSE)
 *   DELETE /api/llm/insights/:period  — clear cached insight
 */

import { Router } from 'express'
import type { StateStore } from '../services/stateStore.js'
import { createLLMClient, getLLMInfo } from '../services/llm.js'
import { createSSEStream } from '../lib/sse.js'
import { buildInsightContext } from '../services/insightBuilder.js'
import { getTransactions, isLoaded } from '../services/transactionStore.js'
import { normalizeLLMError } from '../services/llmErrors.js'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'

const SYSTEM_PROMPT = `You are a friendly, insightful personal finance advisor for a Dutch bank account holder.
Write 4-6 concise bullet points summarizing the financial period provided.
Focus on: notable changes vs previous period, biggest expense categories, savings performance, and one actionable observation.
Dutch merchant names and amounts in € are normal. Be conversational, not clinical.
Format: start each bullet with "• ". No headers. No markdown bold. Plain text only.`

const PERIOD_RE = /^\d{4}(-\d{2})?$|^all-time$/

export function createInsightsRouter(stateStore: StateStore): Router {
  const router = Router()

  // GET /api/llm/insights — bulk-read all cached insight texts (no SSE)
  // Must be registered before /insights/:period to prevent route shadowing.
  router.get('/insights', async (_req, res) => {
    const periods = await stateStore.listInsightPeriods()
    const insights: Record<string, string> = {}
    await Promise.all(
      periods.map(async (p) => {
        const cached = await stateStore.read<{ text: string }>(`insights/${p}`)
        if (cached?.text) insights[p] = cached.text
      }),
    )
    res.json({ insights })
  })

  // GET /api/llm/insights/:period
  router.get('/insights/:period', async (req, res) => {
    const { period } = req.params

    // Validate period format: YYYY, YYYY-MM, or all-time
    if (!PERIOD_RE.test(period)) {
      res.status(400).json({ error: 'Invalid period. Use YYYY, YYYY-MM, or all-time.' })
      return
    }

    const llm = createLLMClient()
    if (!llm) {
      res.status(503).json({ error: 'LLM not configured' })
      return
    }
    if (!isLoaded()) {
      res.status(400).json({ error: 'No transactions synced.' })
      return
    }

    // Check cache
    const storeKey = `insights/${period}`
    const cached = await stateStore.read<{ text: string; generatedAt: string }>(storeKey)
    if (cached) {
      const sse = createSSEStream(res)
      sse.send({ type: 'cached', text: cached.text, generatedAt: cached.generatedAt })
      sse.end()
      return
    }

    // Build context: count non-dismissed anomaly findings for this period
    const sse = createSSEStream(res)
    const transactions = getTransactions()

    const anomalyData = await stateStore.read<{
      findings: Array<{ transactionId: string; severity: string }>
      dismissedIds?: string[]
    }>('anomalies').catch(() => null)

    let unusualFlags = 0
    if (anomalyData?.findings) {
      const dismissed = new Set(anomalyData.dismissedIds ?? [])
      unusualFlags = anomalyData.findings.filter((f) => {
        if (dismissed.has(f.transactionId)) return false
        if (period === 'all-time') return true
        // Match finding to a transaction in the current period
        const tx = transactions.find((t) => t.id === f.transactionId)
        return tx ? tx.date.startsWith(period) : false
      }).length
    }

    const context = buildInsightContext(transactions, period, unusualFlags)

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      ['human', '{context}'],
    ])

    const chain = prompt.pipe(llm).pipe(new StringOutputParser())

    let fullText = ''
    try {
      const stream = await chain.stream({ context: JSON.stringify(context) })
      for await (const token of stream) {
        fullText += token
        sse.send({ type: 'token', text: token })
      }

      // Persist to StateStore
      await stateStore.write(storeKey, {
        period,
        text: fullText,
        generatedAt: new Date().toISOString(),
      })

      sse.send({ type: 'done', cachedAt: new Date().toISOString() })
    } catch (err) {
      console.error('[insights] streaming error:', err)
      const normalized = normalizeLLMError(err, { llm: getLLMInfo().info, feature: 'insights' })
      sse.send({
        type: 'error',
        message: normalized.message,
        code: normalized.code,
        hint: normalized.hint,
        details: normalized.details,
      })
    }

    sse.end()
  })

  // DELETE /api/llm/insights/:period
  router.delete('/insights/:period', async (req, res) => {
    const { period } = req.params
    if (!PERIOD_RE.test(period)) {
      res.status(400).json({ error: 'Invalid period format.' })
      return
    }
    try {
      await stateStore.delete(`insights/${period}`)
      res.json({ deleted: period })
    } catch (err) {
      console.error('[insights] delete error:', err)
      res.status(500).json({ error: 'Failed to clear insight.' })
    }
  })

  return router
}
