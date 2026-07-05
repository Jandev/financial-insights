/**
 * LLM base routes — issue #17.
 *
 *   GET  /api/llm/status              — LLM availability probe (safe to expose)
 *   POST /api/llm/transactions/sync   — Feed the server-side transaction store
 *
 * All /api/llm/* routes share the llmRateLimiter middleware applied in
 * server/index.ts when this router is mounted.
 */

import { Router } from 'express'
import { getLLMInfo } from '../services/llm.js'
import { setTransactions } from '../services/transactionStore.js'
import type { TxSnapshot } from '../services/transactionStore.js'

export function createLLMRouter(): Router {
  const router = Router()

  // ── GET /api/llm/status ─────────────────────────────────────────────────────

  /**
   * Returns LLM availability and provider metadata.
   * Frontend calls this on startup to enable/disable AI feature buttons.
   * Never exposes secrets — only provider name and model.
   */
  router.get('/status', (_req, res) => {
    const { available, info } = getLLMInfo()
    res.json({
      available,
      provider: info?.provider ?? null,
      model: info?.model ?? null,
      features: available ? ['categorize', 'anomalies', 'insights', 'chat'] : [],
    })
  })

  // ── POST /api/llm/transactions/sync ─────────────────────────────────────────

  /**
   * Accepts a snapshot of the frontend's current transaction set.
   * Called after CSV load and after AI recategorization so that
   * all LLM services (#18-#21) operate on up-to-date data.
   *
   * Strips IBANs server-side — only minimal fields are stored.
   */
  router.post('/transactions/sync', (req, res) => {
    const body = req.body as { transactions?: unknown[] }

    if (!Array.isArray(body?.transactions)) {
      res.status(400).json({ error: 'Expected { transactions: TxSnapshot[] }' })
      return
    }

    // Light validation — accept and store whatever the client sends;
    // full schema validation happens inside each LLM service.
    const snapshots = body.transactions as TxSnapshot[]
    setTransactions(snapshots)

    res.json({ synced: snapshots.length })
  })

  return router
}
