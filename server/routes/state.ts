/**
 * State persistence routes — issue #22.
 *
 * All endpoints use a versioned JSON envelope:
 *   { version: 1, lastUpdated: "...", data: { ... } }
 *
 * Endpoints:
 *   GET  /api/state/exclusions           — load excluded transaction IDs
 *   PUT  /api/state/exclusions           — persist excluded IDs
 *   GET  /api/state/categories           — load category assignments / overrides
 *   PUT  /api/state/categories           — persist category assignments
 *   GET  /api/state/rules                — load custom category rules
 *   PUT  /api/state/rules                — persist custom rules
 *   GET  /api/state/summary              — metadata: which keys exist, lastUpdated, sizes
 *   POST /api/state/reset                — delete all state files
 *
 * All GET endpoints return 404 { error: "not found" } when the file doesn't
 * exist — React treats this as empty/default state, not an error.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import type { StateStore } from '../services/stateStore.js'

// ─── Safe period pattern for insight routes (future) ─────────────────────────
// YYYY-MM or YYYY — only alphanumeric and dash
const SAFE_PERIOD_RE = /^[0-9]{4}(-[0-9]{2})?$/

export function createStateRouter(store: StateStore): Router {
  const router = Router()

  // Parse JSON bodies for PUT requests
  router.use((_req, res, next) => {
    // express.json() is mounted on the parent app; this is just a reminder
    next()
  })

  // ── Exclusions ─────────────────────────────────────────────────────────────

  /** GET /api/state/exclusions */
  router.get('/exclusions', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<{ ids: string[] }>('exclusions')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/exclusions */
  router.put('/exclusions', async (req: Request, res: Response) => {
    const body = req.body as unknown

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as Record<string, unknown>).ids) ||
      !(body as Record<string, unknown[]>).ids.every((id) => typeof id === 'string')
    ) {
      res.status(400).json({ error: 'Body must be { ids: string[] }' })
      return
    }

    await store.write('exclusions', { ids: (body as { ids: string[] }).ids })
    res.json({ ok: true })
  })

  // ── Categories / overrides ─────────────────────────────────────────────────

  /** GET /api/state/categories */
  router.get('/categories', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<Record<string, string>>('categories')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/categories */
  router.put('/categories', async (req: Request, res: Response) => {
    const body = req.body as unknown

    // Body must be a plain object with string values (txId → categoryId)
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !Object.values(body as Record<string, unknown>).every((v) => typeof v === 'string')
    ) {
      res.status(400).json({ error: 'Body must be Record<string, string>' })
      return
    }

    await store.write('categories', body as Record<string, string>)
    res.json({ ok: true })
  })

  // ── Rules ─────────────────────────────────────────────────────────────────

  /** GET /api/state/rules */
  router.get('/rules', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<{ rules: unknown[] }>('rules')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/rules */
  router.put('/rules', async (req: Request, res: Response) => {
    const body = req.body as unknown

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as Record<string, unknown>).rules)
    ) {
      res.status(400).json({ error: 'Body must be { rules: CategoryRule[] }' })
      return
    }

    await store.write('rules', { rules: (body as { rules: unknown[] }).rules })
    res.json({ ok: true })
  })

  // ── Summary ────────────────────────────────────────────────────────────────

  /** GET /api/state/summary */
  router.get('/summary', async (_req: Request, res: Response) => {
    const summary = await store.summary()
    const insightPeriods = await store.listInsightPeriods()
    res.json({ keys: summary, insightPeriods })
  })

  // ── Full reset ─────────────────────────────────────────────────────────────

  /** POST /api/state/reset */
  router.post('/reset', async (_req: Request, res: Response) => {
    const deleted = await store.reset()
    res.json({ deleted })
  })

  return router
}
