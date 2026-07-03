/**
 * Express API server — issue #13.
 *
 * Serves the built React app as static files and exposes lightweight API
 * endpoints for the Docker production environment.
 *
 * Endpoints:
 *   GET /api/health        — Docker healthcheck
 *   GET /api/config        — non-secret config for the browser
 *   GET /api/transactions  — list CSV filenames in TRANSACTIONS_PATH
 *   GET /api/transactions/:filename — stream a CSV file
 *   GET /*                 — static SPA fallback
 */

import cors from 'cors'
import express from 'express'
import { readdir } from 'node:fs/promises'
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

app.use(cors())
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
app.get('/api/config', async (_req, res) => {
  let transactionsAvailable = false
  try {
    const files = await readdir(TRANSACTIONS_PATH)
    transactionsAvailable = files.some(f => f.endsWith('.csv'))
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
    res.json(files.filter(f => f.endsWith('.csv')).sort())
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
  res.sendFile(filePath, err => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found', filename })
    }
  })
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
