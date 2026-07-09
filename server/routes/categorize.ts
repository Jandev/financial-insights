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
import { getLLMInfo } from '../services/llm.js'
import { normalizeLLMError } from '../services/llmErrors.js'
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

      // Persist to StateStore — use a dedicated key so AI results never
      // collide with the manual overrides stored under "categories".
      await stateStore.write<Record<string, unknown>>('ai-categories', allResults).catch((err) => {
        console.error('[categorize] failed to persist to stateStore:', err)
      })

      sse.send({ type: 'done', totalProcessed: Object.keys(allResults).length })
    } catch (err) {
      const normalized = normalizeLLMError(err, { llm: getLLMInfo().info, feature: 'categorize' })
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

  return router
}
