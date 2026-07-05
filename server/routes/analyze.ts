/**
 * Anomaly detection routes — issue #19.
 *
 *   POST /api/llm/analyze           — trigger full two-stage analysis (SSE)
 *   GET  /api/llm/analyze/results   — return cached findings from stateStore
 */

import { Router } from 'express'
import type { StateStore } from '../services/stateStore.js'
import { createSSEStream } from '../lib/sse.js'
import { getTransactions, isLoaded } from '../services/transactionStore.js'
import { detectAnomalies } from '../services/anomalyDetector.js'
import { explainAnomalies } from '../services/anomalyExplainer.js'

export function createAnalyzeRouter(stateStore: StateStore): Router {
  const router = Router()

  // POST /api/llm/analyze
  router.post('/analyze', async (_req, res) => {
    if (!isLoaded()) {
      res.status(400).json({ error: 'No transactions synced. Call POST /api/llm/transactions/sync first.' })
      return
    }

    const sse = createSSEStream(res)
    const transactions = getTransactions()

    try {
      // Stage 1 — statistical pre-filter (no LLM)
      const candidates = detectAnomalies(transactions)
      sse.send({ type: 'stage1_done', candidates: candidates.length })

      // Stage 2 — LLM explanation of top 20 candidates
      const top20 = candidates.slice(0, 20)
      const findings = await explainAnomalies(transactions, top20, (processed) => {
        sse.send({ type: 'stage2_progress', processed, total: top20.length })
      })

      // Persist to StateStore
      await stateStore.write('anomalies', {
        findings,
        analyzedAt: new Date().toISOString(),
      })

      sse.send({ type: 'done', findings })
    } catch (err) {
      console.error('[analyze] error:', err)
      sse.send({ type: 'error', message: String(err) })
    }

    sse.end()
  })

  // GET /api/llm/analyze/results
  router.get('/analyze/results', async (_req, res) => {
    try {
      const data = await stateStore.read<{ findings: unknown[]; analyzedAt: string }>('anomalies')
      if (!data) {
        res.status(404).json({ error: 'No analysis results found. Run POST /api/llm/analyze first.' })
        return
      }
      res.json(data)
    } catch (err) {
      console.error('[analyze] failed to read stateStore:', err)
      res.status(500).json({ error: 'Failed to read analysis results' })
    }
  })

  return router
}
