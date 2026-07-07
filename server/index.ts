/**
 * Express API server — issues #13, #17, #22.
 *
 * Serves the built React app as static files and exposes API endpoints
 * for CSV access (issue #13), state persistence (issue #22), and LLM
 * features (issue #17 and onwards).
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
 *   GET  /api/state/spaarpotjes          — load savings goal accounts
 *   PUT  /api/state/spaarpotjes          — persist savings goal accounts
 *   GET  /api/state/personal-accounts    — load personal account IBANs
 *   PUT  /api/state/personal-accounts    — persist personal account IBANs
 *   GET  /api/state/anomalies            — load anomaly findings
 *   PUT  /api/state/anomalies            — persist anomaly findings
 *   GET  /api/state/insights/:period     — load insight for a period
 *   PUT  /api/state/insights/:period     — persist insight for a period
 *   GET  /api/state/summary              — state metadata
 *   POST /api/state/reset                — delete all state files
 *   GET  /api/llm/status                 — LLM availability probe
 *   POST /api/llm/transactions/sync      — feed the server-side transaction store
 *   POST /api/llm/categorize             — AI batch categorization (SSE)
 *   POST /api/llm/analyze                — anomaly detection (SSE)
 *   GET  /api/llm/analyze/results        — cached anomaly findings
 *   GET  /api/llm/insights/:period       — generate/stream narrative insight (SSE)
 *   DELETE /api/llm/insights/:period     — clear cached insight
 *   POST /api/llm/chat                   — start/continue chat thread
 *   GET  /api/llm/chat/:threadId/stream  — stream chat response (SSE)
 *   DELETE /api/llm/chat/:threadId       — clear chat thread
 *   GET  /*                              — static SPA fallback
 */

import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { mkdir, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmRateLimiter } from './middleware/rateLimiter.js'
import { StateStore } from './services/stateStore.js'
import { loadFromDisk } from './services/transactionStore.js'
import { initKnowledgeBase } from './services/knowledgeBase.js'
import type { KnowledgeSource } from './services/knowledgeBase.js'
import { createStateRouter } from './routes/state.js'
import { createLLMRouter } from './routes/llm.js'
import { createCategorizeRouter } from './routes/categorize.js'
import { createAnalyzeRouter } from './routes/analyze.js'
import { createInsightsRouter } from './routes/insights.js'
import { createChatRouter } from './routes/chat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const NODE_ENV = process.env.NODE_ENV ?? 'production'
const TRANSACTIONS_PATH =
  process.env.TRANSACTIONS_PATH ?? path.join(__dirname, '..', 'data', 'transactions')
const STATE_PATH =
  process.env.STATE_PATH ?? path.join(__dirname, '..', 'data', 'state')
const APP_TITLE = process.env.APP_TITLE ?? 'Financial Insights'
const KNOWLEDGE_BASE_PATH =
  process.env.KNOWLEDGE_BASE_PATH ?? path.join(__dirname, '..', 'data', 'knowledge')

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
app.use('/api/llm/transactions/sync', express.json({ limit: '10mb' }))
app.use(express.json())

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

app.use('/api/state', createStateRouter(stateStore, KNOWLEDGE_BASE_PATH))

// ── LLM routes (issues #17-#21) ───────────────────────────────────────────────
// Rate limit applied to all /api/llm/* routes.

app.use('/api/llm', llmRateLimiter)
app.use('/api/llm', createLLMRouter(stateStore))
app.use('/api/llm', createCategorizeRouter(stateStore))
app.use('/api/llm', createAnalyzeRouter(stateStore))
app.use('/api/llm', createInsightsRouter(stateStore))
app.use('/api/llm', createChatRouter(stateStore))

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

void ensureStateDirs().then(async () => {
  await loadFromDisk(stateStore)
  // Init knowledge base async — non-blocking, server already listening
  const savedKnowledge = await stateStore
    .read<{ sources: KnowledgeSource[] }>('knowledge')
    .catch(() => null)
  void initKnowledgeBase({
    sources: savedKnowledge?.sources ?? [],
    localPath: KNOWLEDGE_BASE_PATH,
  })
})

server.listen(PORT, () => {
  console.log(`[server] financial-insights running on port ${PORT} (${NODE_ENV})`)
  console.log(`[server] transactions path: ${TRANSACTIONS_PATH}`)
})
