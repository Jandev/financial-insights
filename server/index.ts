/**
 * Express API server — issues #13, #22.
 *
 * Serves the built React app as static files and exposes API endpoints
 * for CSV access (issue #13) and state persistence (issue #22).
 *
 * Endpoints:
 *   GET  /api/health                     — Docker healthcheck
 *   GET  /api/config                     — non-secret config for the browser
 *   GET  /api/transactions               — list CSV filenames in TRANSACTIONS_PATH
 *   GET  /api/transactions/:filename     — stream a CSV file
 *   GET  /api/state/exclusions           — load excluded transaction IDs
 *   PUT  /api/state/exclusions           — persist excluded IDs
 *   GET  /api/state/categories           — load category overrides
 *   PUT  /api/state/categories           — persist category overrides
 *   GET  /api/state/rules                — load custom category rules
 *   PUT  /api/state/rules                — persist custom rules
 *   GET  /api/state/summary              — state metadata
 *   POST /api/state/reset                — delete all state files
 *   GET  /*                              — static SPA fallback
 */

import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { mkdir, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import basicAuth from './middleware/basicAuth.js'
import { StateStore } from './services/stateStore.js'
import { createStateRouter } from './routes/state.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const NODE_ENV = process.env.NODE_ENV ?? 'production'
const TRANSACTIONS_PATH =
  process.env.TRANSACTIONS_PATH ?? path.join(__dirname, '..', 'data', 'transactions')
const STATE_PATH =
  process.env.STATE_PATH ?? path.join(__dirname, '..', 'data', 'state')
const APP_TITLE = process.env.APP_TITLE ?? 'Financial Insights'

// ── State store ───────────────────────────────────────────────────────────────

const stateStore = new StateStore(STATE_PATH)

/**
 * Create STATE_PATH and STATE_PATH/insights directories on startup so the
 * store never fails on first write due to a missing parent directory.
 */
async function ensureStateDirs(): Promise<void> {
  try {
    await mkdir(path.join(STATE_PATH, 'insights'), { recursive: true })
    console.log(`[server] state path: ${STATE_PATH}`)
  } catch (err) {
    console.error('[server] failed to create state directories:', err)
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors())
app.use(express.json())
app.use(basicAuth)

// ── API routes ────────────────────────────────────────────────────────────────

/** Health check — used by Docker HEALTHCHECK and docker-compose */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    transactionsPath: TRANSACTIONS_PATH,
    statePath: STATE_PATH,
  })
})

/**
 * Non-secret config values safe to expose to the browser.
 * Never include API keys or secrets here.
 */
app.get('/api/config', async (_req, res) => {
  let transactionsAvailable = false
  try {
    const files = await readdir(TRANSACTIONS_PATH)
    transactionsAvailable = files.some((f) => f.endsWith('.csv'))
  } catch {
    // Directory missing or unreadable — transactionsAvailable stays false
  }
  res.json({
    appTitle: APP_TITLE,
    transactionsAvailable,
  })
})

/**
 * List CSV filenames in TRANSACTIONS_PATH, sorted alphabetically.
 * Returns [] if the directory is empty, missing, or unreadable.
 */
app.get('/api/transactions', async (_req, res) => {
  try {
    const files = await readdir(TRANSACTIONS_PATH)
    res.json(files.filter((f) => f.endsWith('.csv')).sort())
  } catch {
    res.json([])
  }
})

/**
 * Stream a single CSV file from TRANSACTIONS_PATH.
 * Validates filename to prevent path traversal.
 */
app.get('/api/transactions/:filename', (req, res) => {
  const { filename } = req.params

  // Path traversal guard — reject anything that escapes the transactions dir
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    !filename.endsWith('.csv')
  ) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }

  const filePath = path.join(TRANSACTIONS_PATH, filename)
  res.setHeader('Content-Type', 'text/csv; charset=windows-1252')
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found', filename })
    }
  })
})

// ── State routes (issue #22) ──────────────────────────────────────────────────

app.use('/api/state', createStateRouter(stateStore))

// ── Static SPA serving ────────────────────────────────────────────────────────

const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

/** Fallback: send index.html for all unmatched routes (client-side routing) */
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

// ── Error handler ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[server] unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

// ── Boot ──────────────────────────────────────────────────────────────────────

const server = createServer(app)

void ensureStateDirs()

server.listen(PORT, () => {
  console.log(`[server] financial-insights running on port ${PORT} (${NODE_ENV})`)
  console.log(`[server] transactions path: ${TRANSACTIONS_PATH}`)
})
