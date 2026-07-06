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
 *   GET  /api/state/spaarpotjes          — load savings goal accounts
 *   PUT  /api/state/spaarpotjes          — persist savings goal accounts
 *   GET  /api/state/tag-overrides        — load tag overrides (txId → string[])
 *   PUT  /api/state/tag-overrides        — persist tag overrides
 *   GET  /api/state/dismissed            — load dismissed anomaly finding IDs
 *   PUT  /api/state/dismissed            — persist dismissed finding IDs
 *   GET  /api/state/default-name-overrides — load custom display names for built-in categories
 *   PUT  /api/state/default-name-overrides — persist custom display names
 *   GET  /api/state/anomalies            — load last anomaly analysis results (read-only)
 *   GET  /api/state/summary              — metadata: which keys exist, lastUpdated, sizes
 *   POST /api/state/reset                — delete all state files
 *
 * All GET endpoints return 404 { error: "not found" } when the file doesn't
 * exist — React treats this as empty/default state, not an error.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import type { StateStore } from '../services/stateStore.js'

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

  // ── Spaarpotjes ───────────────────────────────────────────────────────────

  /** GET /api/state/spaarpotjes */
  router.get('/spaarpotjes', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<{ accounts: unknown[] }>('spaarpotjes')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/spaarpotjes */
  router.put('/spaarpotjes', async (req: Request, res: Response) => {
    const body = req.body as unknown

    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as Record<string, unknown>).accounts)
    ) {
      res.status(400).json({ error: 'Body must be { accounts: SavingsAccount[] }' })
      return
    }

    await store.write('spaarpotjes', { accounts: (body as { accounts: unknown[] }).accounts })
    res.json({ ok: true })
  })

  // ── Tag overrides ──────────────────────────────────────────────────────────

  /** GET /api/state/tag-overrides */
  router.get('/tag-overrides', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<Record<string, string[]>>('tag-overrides')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/tag-overrides */
  router.put('/tag-overrides', async (req: Request, res: Response) => {
    const body = req.body as unknown

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !Object.values(body as Record<string, unknown>).every(
        (v) => Array.isArray(v) && (v as unknown[]).every((t) => typeof t === 'string'),
      )
    ) {
      res.status(400).json({ error: 'Body must be Record<string, string[]>' })
      return
    }

    await store.write('tag-overrides', body as Record<string, string[]>)
    res.json({ ok: true })
  })

  // ── Dismissed finding IDs ─────────────────────────────────────────────────

  /** GET /api/state/dismissed */
  router.get('/dismissed', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<{ ids: string[] }>('dismissed')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/dismissed */
  router.put('/dismissed', async (req: Request, res: Response) => {
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

    await store.write('dismissed', { ids: (body as { ids: string[] }).ids })
    res.json({ ok: true })
  })

  // ── Default category name overrides ───────────────────────────────────────

  /** GET /api/state/default-name-overrides */
  router.get('/default-name-overrides', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<Record<string, string>>('default-name-overrides')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  /** PUT /api/state/default-name-overrides */
  router.put('/default-name-overrides', async (req: Request, res: Response) => {
    const body = req.body as unknown

    // Body must be a plain object with all-string values (categoryId → displayName)
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !Object.values(body as Record<string, unknown>).every((v) => typeof v === 'string')
    ) {
      res.status(400).json({ error: 'Body must be Record<string, string>' })
      return
    }

    await store.write('default-name-overrides', body as Record<string, string>)
    res.json({ ok: true })
  })

  // ── Anomaly analysis results (read-only) ──────────────────────────────────
  router.get('/anomalies', async (_req: Request, res: Response) => {
    const data = await store.readEnvelope<{ findings: unknown[]; analyzedAt: string }>('anomalies')
    if (!data) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(data)
  })

  // ── Summary ────────────────────────────────────────────────────────────────
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
