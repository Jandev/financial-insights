/**
 * Knowledge base service — issue #53.
 *
 * Module singleton. Fetches URL sources + local .md/.txt files, chunks,
 * embeds and stores vectors in-memory for semantic search by the advisor.
 *
 * Modes:
 *   single_page — fetch exactly the given URL
 *   site        — discover subpages via sitemap / crawl, apply filters/caps
 *
 * Status machine (global):
 *   not_configured → no LLM creds or no usable sources/files
 *   building       → full rebuild running
 *   ready          → last build finished (partial failures still = ready)
 *   error          → hard failure, nothing indexed
 *
 * Per-source progress:
 *   idle | queued | building | ready | error
 *
 * Queue:
 *   - FIFO resync queue for targeted per-source reindexing
 *   - Dedup by source URL (same URL won't be queued twice)
 *   - One worker, sequential processing
 *   - Full rebuild pauses worker; queued jobs resume after
 *   - On source resync failure: old chunks kept, source marked error
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from '@langchain/openai'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CrawlPolicy {
  discovery?: 'auto' | 'sitemap_only' | 'crawl_only'
  includePaths?: string[]
  excludePaths?: string[]
  maxPages?: number
  maxDepth?: number
  concurrency?: number
  respectRobots?: boolean
  allowSubdomains?: boolean
}

export interface KnowledgeSource {
  name: string
  url: string
  mode?: 'single_page' | 'site'
  policy?: CrawlPolicy
}

export type KnowledgeStatus = 'not_configured' | 'building' | 'ready' | 'error'
export type SourceStatus = 'idle' | 'queued' | 'building' | 'ready' | 'error'

export interface SourceProgress {
  status: SourceStatus
  discovered: number
  eligible: number
  processed: number
  chunks: number
  phase: string
  error?: string
  updatedAt: string
}

export interface FailedPage {
  url: string
  reason: string
}

export interface KnowledgeStatusResult {
  status: KnowledgeStatus
  chunkCount: number
  sourceCount: number
  indexedSources: string[]
  failedSources: Array<{ name: string; url: string; reason: string }>
  discoveredCount: number
  eligibleCount: number
  indexedPageCount: number
  failedPages: FailedPage[]
  // Live progress
  phase: string
  currentSource: string | null
  queueLength: number
  sourceProgress: Record<string, SourceProgress>
}

export interface KnowledgeResult {
  snippet: string
  sourceName: string
  link?: string
}

export interface InitKnowledgeBaseOptions {
  sources: KnowledgeSource[]
  localPath: string
}

// ─── Glob → RegExp ────────────────────────────────────────────────────────────

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}`)
}

function matchesPaths(urlPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(urlPath))
}

// ─── Built-in noise excludes ──────────────────────────────────────────────────

const BUILTIN_EXCLUDE_PREFIXES = [
  '/wp-admin', '/wp-login', '/wp-json',
  '/tag/', '/tags/', '/author/', '/feed',
  '/login', '/logout', '/register', '/account', '/abonnee',
  '/privacy', '/privacyverklaring', '/cookiebeleid', '/cookie',
  '/proclaimer', '/responsible-disclosure', '/toegankelijkheid',
  '/contact', '/bedankt', '/aanmelding', '/aanmelden',
  '/search', '/cart', '/checkout', '/cdn-cgi',
]

function isBuiltinExcluded(urlPath: string): boolean {
  const lp = urlPath.toLowerCase()
  return BUILTIN_EXCLUDE_PREFIXES.some((p) => lp.startsWith(p)) ||
    lp.includes('?') || lp.includes('#')
}

// ─── URL utilities ────────────────────────────────────────────────────────────

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'https:') return null
    u.hash = ''
    u.search = ''
    return u.href.replace(/\/$/, '') || u.href
  } catch { return null }
}

function isSameDomain(url: string, seedHost: string, allowSubdomains: boolean): boolean {
  try {
    const host = new URL(url).hostname
    return allowSubdomains
      ? host === seedHost || host.endsWith(`.${seedHost}`)
      : host === seedHost
  } catch { return false }
}

function isEligibleUrl(url: string, seedHost: string, policy: Required<CrawlPolicy>): boolean {
  if (!isSameDomain(url, seedHost, policy.allowSubdomains)) return false
  const urlPath = new URL(url).pathname
  if (isBuiltinExcluded(urlPath)) return false
  if (policy.excludePaths.length > 0 && matchesPaths(urlPath, policy.excludePaths)) return false
  if (policy.includePaths.length > 0 && !matchesPaths(urlPath, policy.includePaths)) return false
  return true
}

// ─── Robots.txt ───────────────────────────────────────────────────────────────

const robotsCache = new Map<string, Set<string>>()

async function fetchDisallowedPaths(origin: string): Promise<Set<string>> {
  const cached = robotsCache.get(origin)
  if (cached) return cached
  const disallowed = new Set<string>()
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': 'financial-insights-kb/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      let inBlock = false
      for (const rawLine of (await res.text()).split('\n')) {
        const line = rawLine.trim()
        if (line.toLowerCase().startsWith('user-agent:')) {
          const agent = line.split(':')[1].trim()
          inBlock = agent === '*' || agent.toLowerCase().includes('financial-insights')
        } else if (inBlock && line.toLowerCase().startsWith('disallow:')) {
          const p = line.split(':')[1].trim()
          if (p) disallowed.add(p)
        }
      }
    }
  } catch { /* treat as no restrictions */ }
  robotsCache.set(origin, disallowed)
  return disallowed
}

function isRobotsAllowed(urlPath: string, disallowed: Set<string>): boolean {
  for (const d of disallowed) { if (d && urlPath.startsWith(d)) return false }
  return true
}

// ─── Sitemap discovery ────────────────────────────────────────────────────────

function extractSitemapUrls(xml: string): string[] {
  return (xml.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [])
    .map((m) => m.replace(/<\/?loc>/gi, '').trim())
}

async function discoverViaSitemap(
  origin: string,
  policy: Required<CrawlPolicy>,
  disallowed: Set<string>,
): Promise<string[]> {
  const discovered = new Set<string>()
  const sitemapQueue: string[] = []
  for (const candidate of [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`]) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': 'financial-insights-kb/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      for (const u of extractSitemapUrls(xml)) {
        if (u.endsWith('.xml')) sitemapQueue.push(u)
        else { const n = normalizeUrl(u, origin); if (n) discovered.add(n) }
      }
      break
    } catch { continue }
  }
  for (const sitemapUrl of sitemapQueue.slice(0, 20)) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'financial-insights-kb/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      for (const u of extractSitemapUrls(await res.text())) {
        if (!u.endsWith('.xml')) { const n = normalizeUrl(u, origin); if (n) discovered.add(n) }
      }
    } catch { continue }
  }
  return [...discovered].filter((u) => {
    const p = new URL(u).pathname
    return isRobotsAllowed(p, disallowed) && isEligibleUrl(u, new URL(origin).hostname, policy)
  })
}

// ─── Link crawl discovery ─────────────────────────────────────────────────────

function extractLinks(html: string, base: string): string[] {
  return ([...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]))
    .map((h) => normalizeUrl(h, base)).filter(Boolean) as string[]
}

async function discoverViaCrawl(
  seedUrl: string,
  policy: Required<CrawlPolicy>,
  disallowed: Set<string>,
): Promise<string[]> {
  const seedHost = new URL(seedUrl).hostname
  const visited = new Set<string>()
  const discovered = new Set<string>()
  const queue: Array<{ url: string; depth: number }> = [{ url: seedUrl, depth: 0 }]
  while (queue.length > 0 && discovered.size < policy.maxPages * 2) {
    const batch = queue.splice(0, policy.concurrency)
    await Promise.all(batch.map(async ({ url, depth }) => {
      if (visited.has(url)) return
      visited.add(url)
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'financial-insights-kb/1.0' },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return
        const html = await res.text()
        if (isEligibleUrl(url, seedHost, policy) && isRobotsAllowed(new URL(url).pathname, disallowed))
          discovered.add(url)
        if (depth < policy.maxDepth) {
          for (const link of extractLinks(html, url)) {
            if (!visited.has(link) &&
                isSameDomain(link, seedHost, policy.allowSubdomains) &&
                isRobotsAllowed(new URL(link).pathname, disallowed))
              queue.push({ url: link, depth: depth + 1 })
          }
        }
      } catch { /* ignore per-page errors during discovery */ }
    }))
  }
  return [...discovered]
}

// ─── Policy defaults ──────────────────────────────────────────────────────────

function resolvePolicy(policy?: CrawlPolicy): Required<CrawlPolicy> {
  return {
    discovery: policy?.discovery ?? 'auto',
    includePaths: policy?.includePaths ?? [],
    excludePaths: policy?.excludePaths ?? [],
    maxPages: policy?.maxPages ?? 100,
    maxDepth: policy?.maxDepth ?? 2,
    concurrency: policy?.concurrency ?? 3,
    respectRobots: policy?.respectRobots ?? true,
    allowSubdomains: policy?.allowSubdomains ?? false,
  }
}

// ─── In-memory vector store with per-source ops ───────────────────────────────

interface ChunkMeta {
  sourceId: string      // source.url — used for targeted replace
  sourceName: string
  pageUrl?: string
  localFile?: string
}

interface VectorEntry {
  text: string
  vector: number[]
  meta: ChunkMeta
}

class InMemoryVectorStore {
  private entries: VectorEntry[] = []

  /** Remove all chunks belonging to a specific sourceId (before reindex). */
  removeBySourceId(sourceId: string): number {
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.meta.sourceId !== sourceId)
    return before - this.entries.length
  }

  /** Append pre-embedded vectors for a source (used by targeted resync). */
  addEmbedded(texts: string[], vectors: number[][], metas: ChunkMeta[]): void {
    for (let i = 0; i < texts.length; i++) {
      this.entries.push({ text: texts[i], vector: vectors[i], meta: metas[i] })
    }
  }

  async addTexts(texts: string[], metas: ChunkMeta[], embeddings: EmbeddingsInterface): Promise<void> {
    const BATCH = 100
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH)
      const vectors = await embeddings.embedDocuments(batch)
      for (let j = 0; j < batch.length; j++) {
        this.entries.push({ text: batch[j], vector: vectors[j], meta: metas[i + j] })
      }
    }
  }

  async similaritySearch(
    query: string,
    embeddings: EmbeddingsInterface,
    k: number,
  ): Promise<Array<{ text: string; meta: ChunkMeta }>> {
    if (this.entries.length === 0) return []
    const queryVec = await embeddings.embedQuery(query)
    const scored = this.entries.map((e) => ({
      text: e.text, meta: e.meta,
      score: cosineSimilarity(queryVec, e.vector),
    }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k).map(({ text, meta }) => ({ text, meta }))
  }

  sourceChunkCount(sourceId: string): number {
    return this.entries.filter((e) => e.meta.sourceId === sourceId).length
  }

  get size(): number { return this.entries.length }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ─── Text splitter ────────────────────────────────────────────────────────────

function splitText(text: string, chunkSize = 600, chunkOverlap = 60): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end === text.length) break
    start += chunkSize - chunkOverlap
  }
  return chunks
}

// ─── HTML stripping ───────────────────────────────────────────────────────────

const MIN_TEXT_LENGTH = 100

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ').trim()
}

async function fetchPageContent(url: string): Promise<{ content: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'financial-insights-kb/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/')) return { error: `Non-text content-type: ${contentType}` }
    const raw = await res.text()
    const content = contentType.includes('text/html') ? stripHtml(raw) : raw
    if (content.length < MIN_TEXT_LENGTH) return { error: 'Insufficient text content' }
    return { content }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Local file loading ───────────────────────────────────────────────────────

async function loadLocalFiles(localPath: string): Promise<Array<{ content: string; name: string }>> {
  const results: Array<{ content: string; name: string }> = []
  try {
    const files = await readdir(localPath)
    for (const file of files.filter((f) => f.endsWith('.md') || f.endsWith('.txt'))) {
      try {
        const content = await readFile(path.join(localPath, file), 'utf-8')
        if (content.trim()) results.push({ content, name: file })
      } catch (err) { console.warn(`[knowledgeBase] Failed to read ${file}:`, err) }
    }
  } catch { /* directory missing */ }
  return results
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _store: InMemoryVectorStore = new InMemoryVectorStore()
let _embeddings: EmbeddingsInterface | null = null
let _status: KnowledgeStatus = 'not_configured'
let _chunkCount = 0
let _indexedSources: string[] = []
let _failedSources: Array<{ name: string; url: string; reason: string }> = []
let _discoveredCount = 0
let _eligibleCount = 0
let _indexedPageCount = 0
let _failedPages: FailedPage[] = []

// ─── Live progress state ──────────────────────────────────────────────────────

let _phase = 'idle'
let _currentSource: string | null = null
let _rebuildRunning = false

/** Per-source progress, keyed by source URL */
const _sourceProgress = new Map<string, SourceProgress>()

function nowIso(): string { return new Date().toISOString() }

function setSourceProgress(sourceId: string, patch: Partial<SourceProgress>): void {
  const existing = _sourceProgress.get(sourceId) ?? {
    status: 'idle', discovered: 0, eligible: 0,
    processed: 0, chunks: 0, phase: 'idle', updatedAt: nowIso(),
  }
  _sourceProgress.set(sourceId, { ...existing, ...patch, updatedAt: nowIso() })
}

// ─── Queue ────────────────────────────────────────────────────────────────────

interface ResyncJob {
  source: KnowledgeSource
  localPath: string
}

const _resyncQueue: ResyncJob[] = []
let _workerRunning = false

/**
 * Enqueue a targeted resync job.
 * Returns: 'queued' (new), 'already_queued' (deduped), 'started' (worker launched).
 */
export function enqueueKnowledgeSourceResync(
  source: KnowledgeSource,
  localPath: string,
): { status: 'queued' | 'already_queued'; position: number } {
  // Dedup by URL
  const existing = _resyncQueue.findIndex((j) => j.source.url === source.url)
  if (existing !== -1) {
    return { status: 'already_queued', position: existing + 1 }
  }

  _resyncQueue.push({ source, localPath })
  setSourceProgress(source.url, { status: 'queued', phase: 'queued' })
  console.log(`[knowledgeBase] Queued resync for "${source.name}" (queue size: ${_resyncQueue.length})`)

  // Kick off worker if not already running
  void processResyncQueue()

  return { status: 'queued', position: _resyncQueue.length }
}

/** FIFO worker. Pauses while a full rebuild is running. */
async function processResyncQueue(): Promise<void> {
  if (_workerRunning) return
  _workerRunning = true

  try {
    while (_resyncQueue.length > 0) {
      // Wait while full rebuild is running
      while (_rebuildRunning) {
        await new Promise((r) => setTimeout(r, 500))
      }

      const job = _resyncQueue.shift()
      if (!job) break

      await runSourceResync(job.source, job.localPath)
    }
  } finally {
    _workerRunning = false
  }
}

// ─── Embeddings factory ───────────────────────────────────────────────────────

function createEmbeddings(): OpenAIEmbeddings | AzureOpenAIEmbeddings | null {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    const endpointUrl = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')
    const instanceName = new URL(endpointUrl).hostname.split('.')[0]
    return new AzureOpenAIEmbeddings({
      azureOpenAIApiInstanceName: instanceName,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT ?? 'text-embedding-3-small',
      azureOpenAIApiVersion:
        process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
    })
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDINGS_MODEL ?? 'text-embedding-3-small',
      configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
    })
  }
  return null
}

// ─── Per-source index worker ──────────────────────────────────────────────────

interface SourceIndexResult {
  texts: string[]
  metas: ChunkMeta[]
  discovered: number
  eligible: number
  processed: number
  failedPagesLocal: FailedPage[]
  error?: string
}

/**
 * Fetch, discover, chunk one source into texts+metas arrays.
 * Does NOT touch the live store — caller does the atomic swap.
 */
async function indexSource(
  source: KnowledgeSource,
  onProgress: (patch: Partial<SourceProgress>) => void,
): Promise<SourceIndexResult> {
  const mode = source.mode ?? 'single_page'
  const result: SourceIndexResult = {
    texts: [], metas: [], discovered: 0, eligible: 0, processed: 0, failedPagesLocal: [],
  }

  if (mode === 'single_page') {
    onProgress({ phase: 'fetching', discovered: 1, eligible: 1 })
    const fetched = await fetchPageContent(source.url)
    if ('error' in fetched) {
      result.error = fetched.error
      result.failedPagesLocal.push({ url: source.url, reason: fetched.error })
      return result
    }
    const chunks = splitText(fetched.content)
    result.texts.push(...chunks)
    result.metas.push(...chunks.map(() => ({ sourceId: source.url, sourceName: source.name, pageUrl: source.url })))
    result.discovered = 1; result.eligible = 1; result.processed = 1
    onProgress({ phase: 'done', processed: 1, chunks: chunks.length })
    return result
  }

  // ── Site mode ──────────────────────────────────────────────────────────────
  const policy = resolvePolicy(source.policy)
  const origin = new URL(source.url).origin

  onProgress({ phase: 'discovering' })
  const disallowed = policy.respectRobots ? await fetchDisallowedPaths(origin) : new Set<string>()

  let discovered: string[] = []
  if (policy.discovery === 'sitemap_only') {
    discovered = await discoverViaSitemap(origin, policy, disallowed)
  } else if (policy.discovery === 'crawl_only') {
    discovered = await discoverViaCrawl(source.url, policy, disallowed)
  } else {
    discovered = await discoverViaSitemap(origin, policy, disallowed)
    if (discovered.length === 0) {
      console.log(`[knowledgeBase] "${source.name}": no sitemap, falling back to crawl`)
      discovered = await discoverViaCrawl(source.url, policy, disallowed)
    }
  }

  // Always include seed
  const seedNorm = normalizeUrl(source.url, origin)
  if (seedNorm && !discovered.includes(seedNorm)) discovered.unshift(seedNorm)

  result.discovered = discovered.length
  const eligible = discovered.slice(0, policy.maxPages)
  result.eligible = eligible.length
  onProgress({ phase: 'fetching', discovered: result.discovered, eligible: result.eligible })
  console.log(`[knowledgeBase] "${source.name}": ${result.discovered} discovered, ${result.eligible} eligible`)

  // Fetch pages in batches
  const PROGRESS_EVERY = 10
  for (let i = 0; i < eligible.length; i += policy.concurrency) {
    const batch = eligible.slice(i, i + policy.concurrency)
    await Promise.all(batch.map(async (pageUrl) => {
      const fetched = await fetchPageContent(pageUrl)
      if ('error' in fetched) {
        result.failedPagesLocal.push({ url: pageUrl, reason: fetched.error })
        return
      }
      const chunks = splitText(fetched.content)
      result.texts.push(...chunks)
      result.metas.push(...chunks.map(() => ({ sourceId: source.url, sourceName: source.name, pageUrl })))
      result.processed++
    }))

    // Emit progress every N pages
    if (result.processed % PROGRESS_EVERY === 0 || i + policy.concurrency >= eligible.length) {
      onProgress({ phase: 'fetching', processed: result.processed, chunks: result.texts.length })
      console.log(`[knowledgeBase] "${source.name}": ${result.processed}/${result.eligible} pages fetched, ${result.texts.length} chunks`)
    }
  }

  return result
}

// ─── Targeted source resync ───────────────────────────────────────────────────

async function runSourceResync(source: KnowledgeSource, _localPath: string): Promise<void> {
  const embeddings = _embeddings ?? createEmbeddings()
  if (!embeddings) {
    setSourceProgress(source.url, { status: 'error', phase: 'error', error: 'No LLM credentials configured' })
    console.warn(`[knowledgeBase] Resync of "${source.name}" skipped: no LLM credentials`)
    return
  }

  _currentSource = source.name
  setSourceProgress(source.url, { status: 'building', phase: 'starting', processed: 0, chunks: 0 })
  console.log(`[knowledgeBase] Resync starting: "${source.name}"`)

  try {
    const result = await indexSource(source, (patch) => {
      setSourceProgress(source.url, patch)
    })

    if (result.error && result.texts.length === 0) {
      // Complete failure — keep old chunks
      setSourceProgress(source.url, {
        status: 'error', phase: 'error',
        discovered: result.discovered, eligible: result.eligible,
        processed: result.processed,
        error: result.error,
      })
      console.warn(`[knowledgeBase] Resync failed for "${source.name}" — old data kept: ${result.error}`)
      _currentSource = null
      return
    }

    // Embed new chunks
    setSourceProgress(source.url, { phase: 'embedding', chunks: result.texts.length })
    console.log(`[knowledgeBase] "${source.name}": embedding ${result.texts.length} chunks…`)

    const BATCH = 100
    const newVectors: number[][] = []
    for (let i = 0; i < result.texts.length; i += BATCH) {
      const batch = result.texts.slice(i, i + BATCH)
      const vecs = await embeddings.embedDocuments(batch)
      newVectors.push(...vecs)
      const embDone = Math.min(i + BATCH, result.texts.length)
      setSourceProgress(source.url, { phase: `embedding ${embDone}/${result.texts.length}`, chunks: embDone })
      console.log(`[knowledgeBase] "${source.name}": embedded ${embDone}/${result.texts.length} chunks`)
    }

    // Atomic swap: remove old, insert new
    const removed = _store.removeBySourceId(source.url)
    _store.addEmbedded(result.texts, newVectors, result.metas)

    // Update global stats
    _chunkCount = _chunkCount - removed + result.texts.length
    _indexedPageCount = _indexedPageCount - (removed > 0 ? 1 : 0) + result.processed
    if (!_indexedSources.includes(source.name)) _indexedSources.push(source.name)

    // Update failed pages list (remove old entries for this source, add new)
    _failedPages = _failedPages.filter((fp) => {
      try { return new URL(fp.url).origin !== new URL(source.url).origin || !fp.url.startsWith(source.url) }
      catch { return true }
    })
    _failedPages.push(...result.failedPagesLocal)

    if (_status !== 'building') _status = 'ready'

    setSourceProgress(source.url, {
      status: 'ready', phase: 'done',
      discovered: result.discovered, eligible: result.eligible,
      processed: result.processed, chunks: result.texts.length,
    })
    console.log(`[knowledgeBase] Resync complete: "${source.name}" — ${result.texts.length} chunks (${result.processed} pages, ${result.failedPagesLocal.length} page failures)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setSourceProgress(source.url, { status: 'error', phase: 'error', error: msg })
    console.error(`[knowledgeBase] Resync error for "${source.name}" — old data kept:`, err)
  } finally {
    _currentSource = null
  }
}

// ─── Full rebuild ─────────────────────────────────────────────────────────────

export async function initKnowledgeBase(options: InitKnowledgeBaseOptions): Promise<void> {
  const { sources, localPath } = options

  const embeddings = createEmbeddings()
  if (!embeddings) {
    console.log('[knowledgeBase] No LLM credentials configured — skipping knowledge base init')
    _status = 'not_configured'
    _embeddings = null
    return
  }
  _embeddings = embeddings

  robotsCache.clear()
  _sourceProgress.clear()

  const allTexts: string[] = []
  const allMetas: ChunkMeta[] = []
  const indexed: string[] = []
  const failedSources: Array<{ name: string; url: string; reason: string }> = []
  const failedPages: FailedPage[] = []
  const stats = { discovered: 0, eligible: 0, indexedPages: 0 }

  // Process each URL source
  for (const source of sources) {
    _currentSource = source.name
    _phase = `processing ${source.name}`
    setSourceProgress(source.url, { status: 'building', phase: 'starting' })
    console.log(`[knowledgeBase] Processing source "${source.name}" (mode: ${source.mode ?? 'single_page'})`)

    const result = await indexSource(source, (patch) => {
      setSourceProgress(source.url, patch)
    })

    stats.discovered += result.discovered
    stats.eligible += result.eligible

    if (result.error && result.texts.length === 0) {
      failedSources.push({ name: source.name, url: source.url, reason: result.error })
      setSourceProgress(source.url, { status: 'error', phase: 'error', error: result.error })
      continue
    }

    failedPages.push(...result.failedPagesLocal)

    if (result.texts.length > 0) {
      allTexts.push(...result.texts)
      allMetas.push(...result.metas)
      stats.indexedPages += result.processed
      indexed.push(result.processed > 1 ? `${source.name} (${result.processed} pages)` : source.name)
      setSourceProgress(source.url, { status: 'ready', phase: 'done', chunks: result.texts.length })
    } else {
      failedSources.push({ name: source.name, url: source.url, reason: 'All pages failed' })
      setSourceProgress(source.url, { status: 'error', phase: 'error', error: 'All pages failed' })
    }
  }
  _currentSource = null

  // Load local files
  _phase = 'local files'
  const localFiles = await loadLocalFiles(localPath)
  for (const { content, name } of localFiles) {
    const chunks = splitText(content)
    for (const chunk of chunks) {
      allTexts.push(chunk)
      allMetas.push({ sourceId: `local:${name}`, sourceName: name, localFile: name })
    }
    indexed.push(name)
    stats.indexedPages++
  }

  // Build vector store
  _phase = 'embedding'
  if (allTexts.length === 0) {
    _store = new InMemoryVectorStore()
    _embeddings = null
    _chunkCount = 0
    _indexedSources = []
    _failedSources = failedSources
    _discoveredCount = stats.discovered
    _eligibleCount = stats.eligible
    _indexedPageCount = stats.indexedPages
    _failedPages = failedPages
    _status = failedSources.length > 0 ? 'error' : 'not_configured'
    _phase = 'idle'
    console.log('[knowledgeBase] No content to index')
    return
  }

  try {
    console.log(`[knowledgeBase] Embedding ${allTexts.length} chunks…`)
    const store = new InMemoryVectorStore()
    const BATCH = 100
    for (let i = 0; i < allTexts.length; i += BATCH) {
      const batch = allTexts.slice(i, i + BATCH)
      const batchMetas = allMetas.slice(i, i + BATCH)
      const vectors = await embeddings.embedDocuments(batch)
      store.addEmbedded(batch, vectors, batchMetas)
      const done = Math.min(i + BATCH, allTexts.length)
      console.log(`[knowledgeBase] Embedding progress: ${done}/${allTexts.length} chunks`)
      _phase = `embedding ${done}/${allTexts.length}`
    }

    _store = store
    _embeddings = embeddings
    _chunkCount = allTexts.length
    _indexedSources = indexed
    _failedSources = failedSources
    _discoveredCount = stats.discovered
    _eligibleCount = stats.eligible
    _indexedPageCount = stats.indexedPages
    _failedPages = failedPages
    _status = 'ready'
    _phase = 'idle'
    console.log(
      `[knowledgeBase] Indexed ${_chunkCount} chunks from ${indexed.length} source(s), ${stats.indexedPages} pages` +
      (failedSources.length + failedPages.length > 0
        ? ` (${failedSources.length} source failures, ${failedPages.length} page failures)` : ''),
    )
  } catch (err) {
    console.error('[knowledgeBase] Failed to build vector store:', err)
    _store = new InMemoryVectorStore()
    _embeddings = null
    _chunkCount = 0; _indexedSources = []
    _failedSources = failedSources
    _discoveredCount = stats.discovered
    _eligibleCount = stats.eligible
    _indexedPageCount = 0
    _failedPages = failedPages
    _status = 'error'
    _phase = 'idle'
  }
}

export function rebuildKnowledgeBase(options: InitKnowledgeBaseOptions): void {
  _status = 'building'
  _store = new InMemoryVectorStore()
  _embeddings = null
  _chunkCount = 0; _indexedSources = []
  _failedSources = []; _discoveredCount = 0; _eligibleCount = 0
  _indexedPageCount = 0; _failedPages = []
  _phase = 'starting'
  _rebuildRunning = true
  _sourceProgress.clear()

  void initKnowledgeBase(options)
    .catch((err) => {
      console.error('[knowledgeBase] Rebuild failed:', err)
      _status = 'error'; _phase = 'idle'
    })
    .finally(() => { _rebuildRunning = false })
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchKnowledge(query: string, k = 4): Promise<string> {
  if (!_embeddings || _chunkCount === 0) {
    return JSON.stringify({ results: [], message: 'No knowledge base configured.' })
  }
  try {
    const hits = await _store.similaritySearch(query, _embeddings, k)
    if (hits.length === 0) return JSON.stringify({ results: [], message: 'No relevant knowledge found.' })

    const seen = new Set<string>()
    const results: KnowledgeResult[] = []
    for (const { text, meta } of hits) {
      const key = meta.pageUrl ?? meta.localFile ?? meta.sourceName
      if (!seen.has(key)) {
        seen.add(key)
        results.push({ snippet: text, sourceName: meta.sourceName, ...(meta.pageUrl ? { link: meta.pageUrl } : {}) })
      } else {
        const existing = results.find((r) => (r.link ?? r.sourceName) === (meta.pageUrl ?? meta.sourceName))
        if (existing) existing.snippet += `\n\n${text}`
      }
    }
    return JSON.stringify({ results })
  } catch (err) {
    console.error('[knowledgeBase] Search failed:', err)
    return JSON.stringify({ results: [], message: 'Knowledge base search failed.' })
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getKnowledgeStatus(): KnowledgeStatusResult {
  const sourceProgress: Record<string, SourceProgress> = {}
  for (const [k, v] of _sourceProgress.entries()) sourceProgress[k] = v

  return {
    status: _status,
    chunkCount: _chunkCount,
    sourceCount: _indexedSources.length,
    indexedSources: _indexedSources,
    failedSources: _failedSources,
    discoveredCount: _discoveredCount,
    eligibleCount: _eligibleCount,
    indexedPageCount: _indexedPageCount,
    failedPages: _failedPages.slice(0, 20),
    phase: _phase,
    currentSource: _currentSource,
    queueLength: _resyncQueue.length,
    sourceProgress,
  }
}
