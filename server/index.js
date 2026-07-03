/**
 * Express API server — placeholder for issue #13.
 *
 * Serves the built React app as static files and exposes lightweight API
 * endpoints for the Docker production environment.
 *
 * Implemented endpoints:
 *   GET /api/health        — Docker healthcheck
 *   GET /api/config        — non-secret config for the browser
 *   GET /api/transactions  — list CSV filenames (placeholder: returns [])
 *   GET /api/transactions/:filename — stream CSV file (placeholder: 501)
 *   GET /*                 — static SPA fallback
 *
 * TODO(#13): implement full CSV listing/streaming logic.
 */

import express from 'express'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import basicAuth from './middleware/basicAuth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const NODE_ENV = process.env.NODE_ENV ?? 'production'
const TRANSACTIONS_PATH = process.env.TRANSACTIONS_PATH ?? path.join(__dirname, '..', 'data', 'transactions')
const APP_TITLE = process.env.APP_TITLE ?? 'Financial Insights'

const app = express()

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(basicAuth)

// ── API routes ──────────────────────────────────────────────────────────────

/** Health check — used by Docker HEALTHCHECK and docker-compose */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    transactionsPath: TRANSACTIONS_PATH,
  })
})

/**
 * Non-secret config values safe to expose to the browser.
 * Never include API keys or secrets here.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    appTitle: APP_TITLE,
    // TODO(#13): set to true once CSV listing is implemented
    transactionsAvailable: false,
  })
})

/**
 * List CSV filenames in TRANSACTIONS_PATH.
 * TODO(#13): replace stub with real fs.readdir implementation.
 */
app.get('/api/transactions', (_req, res) => {
  // Placeholder — full implementation in #13
  res.json([])
})

/**
 * Stream a single CSV file from TRANSACTIONS_PATH.
 * Validates filename to prevent path traversal.
 * TODO(#13): replace stub with real file streaming.
 */
app.get('/api/transactions/:filename', (req, res) => {
  const { filename } = req.params

  // Path traversal guard
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    !filename.endsWith('.csv')
  ) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }

  // Placeholder — full implementation in #13
  res.status(501).json({ error: 'Not yet implemented', filename })
})

// ── Static SPA serving ──────────────────────────────────────────────────────

const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

/** Fallback: send index.html for all unmatched routes (client-side routing) */
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

// ── Error handler ────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Boot ─────────────────────────────────────────────────────────────────────

const server = createServer(app)

server.listen(PORT, () => {
  console.log(`[server] financial-insights running on port ${PORT} (${NODE_ENV})`)
  console.log(`[server] transactions path: ${TRANSACTIONS_PATH}`)
})
