/**
 * LLM base routes — issue #17.
 *
 *   GET  /api/llm/status              — LLM availability probe (safe to expose)
 *   GET  /api/llm/transactions/count  — server-side transaction store count
 *   POST /api/llm/transactions/sync   — Feed the server-side transaction store
 *
 * All /api/llm/* routes share the llmRateLimiter middleware applied in
 * server/index.ts when this router is mounted.
 */

import { Router } from 'express'
import { getLLMInfo } from '../services/llm.js'
import { setTransactions, getCount, getLoadedAt } from '../services/transactionStore.js'
import type { TxSnapshot } from '../services/transactionStore.js'
import type { StateStore } from '../services/stateStore.js'

export function createLLMRouter(stateStore: StateStore): Router {
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

  // ── GET /api/llm/transactions/count ─────────────────────────────────────────

  /**
   * Returns the number of transactions currently held in the server-side store
   * and when they were last loaded. The frontend uses this to detect a stale
   * or empty server store (e.g. after a server restart) and force a re-sync
   * even when its local deduplication ref says a sync already happened.
   */
  router.get('/transactions/count', (_req, res) => {
    res.json({
      count: getCount(),
      loadedAt: getLoadedAt()?.toISOString() ?? null,
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
    setTransactions(snapshots, stateStore)

    res.json({ synced: snapshots.length })
  })

  return router
}
