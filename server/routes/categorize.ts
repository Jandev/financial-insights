/**
 * AI batch categorization route — issue #18.
 *
 * Delegates all LLM logic to server/services/categorizer.ts.
 * This route is responsible only for SSE streaming and HTTP concerns.
 */

import { Router } from 'express'
import type { StateStore } from '../services/stateStore.js'
import { createSSEStream } from '../lib/sse.js'
import { isLoaded } from '../services/transactionStore.js'
import { runBatchCategorization, DEFAULT_AVAILABLE_CATEGORIES } from '../services/categorizer.js'

export function createCategorizeRouter(stateStore: StateStore): Router {
  const router = Router()

  // POST /api/llm/categorize
  router.post('/categorize', async (req, res) => {
    if (!isLoaded()) {
      res.status(400).json({ error: 'No transactions synced. Call POST /api/llm/transactions/sync first.' })
      return
    }

    const sse = createSSEStream(res)

    try {
      const body = req.body as { period?: string }
      const period = body.period && body.period !== 'all' ? body.period : undefined

      // Merge custom rules (from StateStore) with defaults so the LLM is aware
      // of user-defined categories. Custom rules are prepended — first match wins
      // during name→ID resolution, giving custom rules priority.
      const stored = await stateStore.read<{ rules: Array<{ id: string; name: string }> }>('rules').catch(() => null)
      const customRules = (stored?.rules ?? []).map((r) => ({ id: r.id, name: r.name }))
      const availableCategories = [...customRules, ...DEFAULT_AVAILABLE_CATEGORIES]

      const allResults = await runBatchCategorization(
        period,
        (processed, total, batchResults) => {
          sse.send({ type: 'progress', processed, total, results: batchResults })
        },
        availableCategories,
      )

      // Persist to StateStore
      await stateStore.write<Record<string, unknown>>('categories', allResults).catch((err) => {
        console.error('[categorize] failed to persist to stateStore:', err)
      })

      sse.send({ type: 'done', totalProcessed: Object.keys(allResults).length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sse.send({ type: 'error', message: msg })
    }

    sse.end()
  })

  return router
}
