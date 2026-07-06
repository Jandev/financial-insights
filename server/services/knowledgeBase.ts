/**
 * Knowledge base service — issue #53.
 *
 * Module singleton. Fetches URL sources + local .md/.txt files, chunks,
 * embeds and stores vectors in-memory for semantic search by the advisor.
 *
 * Each source can run in two modes:
 *   single_page — fetch exactly the given URL (original behaviour)
 *   site        — discover subpages via sitemap / crawl, apply include/exclude
 *                 path filters and hard caps, then index all eligible pages
 *
 * Status machine:
 *   not_configured → no LLM creds or no usable sources/files
 *   building       → rebuild running
 *   ready          → rebuild finished (all or partial failures)
 *   error          → hard failure, nothing indexed
 *
 * Partial failures (URL fetch, page fetch) surface in failedSources /
 * failedPages and do NOT change status to error.
 * Only https:// URLs accepted.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from '@langchain/openai'
import type { EmbeddingsInterface } from '@langchain/core/embeddings'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrawlPolicy {
  /** How to discover subpages. Default: 'auto' (sitemap first, crawl fallback). */
  discovery?: 'auto' | 'sitemap_only' | 'crawl_only'
  /**
   * Glob-style path patterns to include.
   * Matched against the URL path (e.g. '/onderwerpen/**').
   * When empty, all paths are included (minus excludePaths).
   */
  includePaths?: string[]
  /**
   * Glob-style path patterns to exclude.
   * Applied after includePaths.
   * Built-in noise paths always appended on top of user list.
   */
  excludePaths?: string[]
  /** Max pages to fetch per source. Default: 100. */
  maxPages?: number
  /** Max link-follow depth for crawl discovery. Default: 2. */
  maxDepth?: number
  /** Concurrent page fetches. Default: 3. */
  concurrency?: number
  /** Follow robots.txt rules. Default: true. */
  respectRobots?: boolean
  /** Allow subdomains of the seed domain. Default: false. */
  allowSubdomains?: boolean
}

export interface KnowledgeSource {
  name: string
  url: string
  /** 'single_page' (default) or 'site' (crawl/discover subpages). */
  mode?: 'single_page' | 'site'
  policy?: CrawlPolicy
}

export type KnowledgeStatus = 'not_configured' | 'building' | 'ready' | 'error'

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
  // Extended crawl metrics
  discoveredCount: number
  eligibleCount: number
  indexedPageCount: number
  failedPages: FailedPage[]
}

export interface InitKnowledgeBaseOptions {
  sources: KnowledgeSource[]
  localPath: string
}

// ─── Glob → RegExp compiler ───────────────────────────────────────────────────

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')   // ** placeholder
    .replace(/\*/g, '[^/]*')    // single * = no slash
    .replace(/\x00/g, '.*')     // ** = anything including slashes
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}`)
}

function matchesPaths(urlPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(urlPath))
}

// ─── Built-in noise exclude paths ────────────────────────────────────────────

const BUILTIN_EXCLUDE_PREFIXES = [
  '/wp-admin', '/wp-login', '/wp-json',
  '/tag/', '/tags/', '/author/', '/feed',
  '/login', '/logout', '/register', '/account', '/abonnee',
  '/privacy', '/privacyverklaring', '/cookiebeleid', '/cookie',
  '/proclaimer', '/responsible-disclosure', '/toegankelijkheid',
  '/contact', '/bedankt', '/aanmelding', '/aanmelden',
  '/search', '/?', '/cart', '/checkout',
  '/cdn-cgi',
]

function isBuiltinExcluded(urlPath: string): boolean {
  const lp = urlPath.toLowerCase()
  return BUILTIN_EXCLUDE_PREFIXES.some((p) => lp.startsWith(p)) ||
    lp.includes('?') ||
    lp.includes('#')
}

// ─── URL utilities ────────────────────────────────────────────────────────────

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base)
    if (u.protocol !== 'https:') return null
    u.hash = ''
    // Strip common tracking/query noise — keep clean path URLs
    u.search = ''
    return u.href.replace(/\/$/, '') || u.href
  } catch {
    return null
  }
}

function isSameDomain(url: string, seedHost: string, allowSubdomains: boolean): boolean {
  try {
    const host = new URL(url).hostname
    if (allowSubdomains) {
      return host === seedHost || host.endsWith(`.${seedHost}`)
    }
    return host === seedHost
  } catch {
    return false
  }
}

function isEligibleUrl(
  url: string,
  seedHost: string,
  policy: Required<CrawlPolicy>,
): boolean {
  if (!isSameDomain(url, seedHost, policy.allowSubdomains)) return false

  const urlPath = new URL(url).pathname
  if (isBuiltinExcluded(urlPath)) return false

  // User-defined exclude takes priority
  if (policy.excludePaths.length > 0 && matchesPaths(urlPath, policy.excludePaths)) return false

  // Include filter: when non-empty, URL must match at least one pattern
  if (policy.includePaths.length > 0 && !matchesPaths(urlPath, policy.includePaths)) return false

  return true
}

// ─── Robots.txt cache ─────────────────────────────────────────────────────────

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
      const text = await res.text()
      let inRelevantBlock = false
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (line.toLowerCase().startsWith('user-agent:')) {
          const agent = line.split(':')[1].trim()
          inRelevantBlock = agent === '*' || agent.toLowerCase().includes('financial-insights')
        } else if (inRelevantBlock && line.toLowerCase().startsWith('disallow:')) {
          const p = line.split(':')[1].trim()
          if (p) disallowed.add(p)
        }
      }
    }
  } catch {
    // robots.txt fetch failure = treat as no restrictions
  }
  robotsCache.set(origin, disallowed)
  return disallowed
}

function isRobotsAllowed(urlPath: string, disallowed: Set<string>): boolean {
  for (const d of disallowed) {
    if (d && urlPath.startsWith(d)) return false
  }
  return true
}

// ─── Sitemap discovery ────────────────────────────────────────────────────────

function extractSitemapUrls(xml: string): string[] {
  // <loc> tags in urlset (page URLs) and sitemapindex (child sitemaps)
  const matches = xml.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? []
  return matches.map((m) => m.replace(/<\/?loc>/gi, '').trim())
}

async function discoverViaSitemap(
  origin: string,
  seedUrl: string,
  policy: Required<CrawlPolicy>,
  disallowed: Set<string>,
): Promise<string[]> {
  const discovered = new Set<string>()
  const sitemapQueue: string[] = []

  // Try sitemap_index.xml and sitemap.xml
  const candidates = [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`]

  // Also check <link rel="sitemap"> in seed page is overkill; skip for now

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': 'financial-insights-kb/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const urls = extractSitemapUrls(xml)

      for (const u of urls) {
        if (u.endsWith('.xml')) {
          sitemapQueue.push(u)
        } else {
          const norm = normalizeUrl(u, origin)
          if (norm) discovered.add(norm)
        }
      }
      break // found one, stop trying
    } catch {
      continue
    }
  }

  // Fetch child sitemaps (one level deep — don't recurse infinitely)
  for (const sitemapUrl of sitemapQueue.slice(0, 20)) {
    try {
      const res = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'financial-insights-kb/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      for (const u of extractSitemapUrls(xml)) {
        if (!u.endsWith('.xml')) {
          const norm = normalizeUrl(u, origin)
          if (norm) discovered.add(norm)
        }
      }
    } catch {
      continue
    }
  }

  return [...discovered].filter((u) => {
    const p = new URL(u).pathname
    return isRobotsAllowed(p, disallowed) && isEligibleUrl(u, new URL(origin).hostname, policy)
  })
}

// ─── Link crawl discovery ─────────────────────────────────────────────────────

function extractLinks(html: string, base: string): string[] {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
  return hrefs.map((h) => normalizeUrl(h, base)).filter(Boolean) as string[]
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

        if (isEligibleUrl(url, seedHost, policy) &&
            isRobotsAllowed(new URL(url).pathname, disallowed)) {
          discovered.add(url)
        }

        if (depth < policy.maxDepth) {
          for (const link of extractLinks(html, url)) {
            if (!visited.has(link) &&
                isSameDomain(link, seedHost, policy.allowSubdomains) &&
                isRobotsAllowed(new URL(link).pathname, disallowed)) {
              queue.push({ url: link, depth: depth + 1 })
            }
          }
        }
      } catch {
        // ignore per-page fetch errors during discovery
      }
    }))
  }

  return [...discovered]
}

// ─── Resolve effective policy with defaults ───────────────────────────────────

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

// ─── In-memory vector store ───────────────────────────────────────────────────

interface ChunkMeta {
  /** Human-readable source name (e.g. "Nibud") */
  sourceName: string
  /** URL of the specific page this chunk came from (web sources) */
  pageUrl?: string
  /** Filename for local .md/.txt files */
  localFile?: string
}

interface VectorEntry {
  text: string
  vector: number[]
  meta: ChunkMeta
}

class InMemoryVectorStore {
  private entries: VectorEntry[] = []

  async addTexts(texts: string[], metas: ChunkMeta[], embeddings: EmbeddingsInterface): Promise<void> {
    // Embed in batches of 100 to avoid API limits
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
      text: e.text,
      meta: e.meta,
      score: cosineSimilarity(queryVec, e.vector),
    }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k).map(({ text, meta }) => ({ text, meta }))
  }

  get size(): number {
    return this.entries.length
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
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

// ─── Module state ─────────────────────────────────────────────────────────────

let _store: InMemoryVectorStore | null = null
let _embeddings: EmbeddingsInterface | null = null
let _status: KnowledgeStatus = 'not_configured'
let _chunkCount = 0
let _indexedSources: string[] = []
let _failedSources: Array<{ name: string; url: string; reason: string }> = []
let _discoveredCount = 0
let _eligibleCount = 0
let _indexedPageCount = 0
let _failedPages: FailedPage[] = []

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
      configuration: process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : undefined,
    })
  }
  return null
}

// ─── HTML stripping ───────────────────────────────────────────────────────────

const MIN_TEXT_LENGTH = 100  // skip pages with less content after stripping

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Single page fetch ────────────────────────────────────────────────────────

async function fetchPageContent(url: string): Promise<{ content: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'financial-insights-kb/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` }

    const contentType = res.headers.get('content-type') ?? ''
    // Skip binary content
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
      } catch (err) {
        console.warn(`[knowledgeBase] Failed to read local file ${file}:`, err)
      }
    }
  } catch {
    // Directory missing — normal on first run
  }
  return results
}

// ─── Process a single source ──────────────────────────────────────────────────

async function processSource(
  source: KnowledgeSource,
  allTexts: string[],
  allMetas: ChunkMeta[],
  indexed: string[],
  failedSources: Array<{ name: string; url: string; reason: string }>,
  failedPages: FailedPage[],
  stats: { discovered: number; eligible: number; indexedPages: number },
): Promise<void> {
  const mode = source.mode ?? 'single_page'

  if (mode === 'single_page') {
    const result = await fetchPageContent(source.url)
    if ('error' in result) {
      failedSources.push({ name: source.name, url: source.url, reason: result.error })
      return
    }
    const chunks = splitText(result.content)
    for (const chunk of chunks) {
      allTexts.push(chunk)
      allMetas.push({ sourceName: source.name, pageUrl: source.url })
    }
    indexed.push(source.name)
    stats.discovered += 1
    stats.eligible += 1
    stats.indexedPages += 1
    return
  }

  // ── Site crawl ─────────────────────────────────────────────────────────────
  const policy = resolvePolicy(source.policy)
  const seedUrl = source.url
  const origin = new URL(seedUrl).origin

  // Robots.txt
  const disallowed = policy.respectRobots
    ? await fetchDisallowedPaths(origin)
    : new Set<string>()

  // Discover URLs
  let discovered: string[] = []

  if (policy.discovery === 'sitemap_only') {
    discovered = await discoverViaSitemap(origin, seedUrl, policy, disallowed)
  } else if (policy.discovery === 'crawl_only') {
    discovered = await discoverViaCrawl(seedUrl, policy, disallowed)
  } else {
    // auto: try sitemap first
    discovered = await discoverViaSitemap(origin, seedUrl, policy, disallowed)
    if (discovered.length === 0) {
      console.log(`[knowledgeBase] No sitemap URLs for "${source.name}", falling back to crawl`)
      discovered = await discoverViaCrawl(seedUrl, policy, disallowed)
    }
  }

  // Always include seed URL if it passes filters
  const seedNorm = normalizeUrl(seedUrl, origin)
  if (seedNorm && !discovered.includes(seedNorm)) {
    discovered.unshift(seedNorm)
  }

  stats.discovered += discovered.length
  console.log(`[knowledgeBase] "${source.name}": ${discovered.length} URLs discovered`)

  // Apply maxPages cap
  const eligible = discovered.slice(0, policy.maxPages)
  stats.eligible += eligible.length

  if (eligible.length === 0) {
    failedSources.push({ name: source.name, url: source.url, reason: 'No eligible pages discovered' })
    return
  }

  // Fetch eligible pages concurrently in batches
  let sourceIndexed = 0
  for (let i = 0; i < eligible.length; i += policy.concurrency) {
    const batch = eligible.slice(i, i + policy.concurrency)
    await Promise.all(batch.map(async (pageUrl) => {
      const result = await fetchPageContent(pageUrl)
      if ('error' in result) {
        failedPages.push({ url: pageUrl, reason: result.error })
        return
      }
      const chunks = splitText(result.content)
      for (const chunk of chunks) {
        allTexts.push(chunk)
        allMetas.push({ sourceName: source.name, pageUrl })
      }
      sourceIndexed++
      stats.indexedPages++
    }))
  }

  if (sourceIndexed > 0) {
    indexed.push(`${source.name} (${sourceIndexed} pages)`)
  } else {
    failedSources.push({ name: source.name, url: source.url, reason: 'All discovered pages failed to fetch' })
  }
}

// ─── Core init ────────────────────────────────────────────────────────────────

export async function initKnowledgeBase(options: InitKnowledgeBaseOptions): Promise<void> {
  const { sources, localPath } = options

  const embeddings = createEmbeddings()
  if (!embeddings) {
    console.log('[knowledgeBase] No LLM credentials configured — skipping knowledge base init')
    _status = 'not_configured'
    _embeddings = null
    return
  }

  // Clear robots cache on each full rebuild
  robotsCache.clear()

  const allTexts: string[] = []
  const allMetas: ChunkMeta[] = []
  const indexed: string[] = []
  const failedSources: Array<{ name: string; url: string; reason: string }> = []
  const failedPages: FailedPage[] = []
  const stats = { discovered: 0, eligible: 0, indexedPages: 0 }

  // ── Process each source ────────────────────────────────────────────────────

  for (const source of sources) {
    console.log(`[knowledgeBase] Processing source "${source.name}" (mode: ${source.mode ?? 'single_page'})`)
    await processSource(source, allTexts, allMetas, indexed, failedSources, failedPages, stats)
  }

  // ── Load local files ───────────────────────────────────────────────────────

  const localFiles = await loadLocalFiles(localPath)
  for (const { content, name } of localFiles) {
    const chunks = splitText(content)
    for (const chunk of chunks) {
      allTexts.push(chunk)
      allMetas.push({ sourceName: name, localFile: name })
    }
    indexed.push(name)
    stats.indexedPages++
  }

  // ── Build vector store ─────────────────────────────────────────────────────

  if (allTexts.length === 0) {
    _store = null
    _embeddings = null
    _chunkCount = 0
    _indexedSources = []
    _failedSources = failedSources
    _discoveredCount = stats.discovered
    _eligibleCount = stats.eligible
    _indexedPageCount = stats.indexedPages
    _failedPages = failedPages
    _status = failedSources.length > 0 || failedPages.length > 0 ? 'error' : 'not_configured'
    console.log('[knowledgeBase] No content to index')
    return
  }

  try {
    const store = new InMemoryVectorStore()
    await store.addTexts(allTexts, allMetas, embeddings)
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
    console.log(
      `[knowledgeBase] Indexed ${_chunkCount} chunks from ${indexed.length} source(s), ` +
      `${stats.indexedPages} pages` +
      (failedSources.length + failedPages.length > 0
        ? ` (${failedSources.length} source failures, ${failedPages.length} page failures)`
        : ''),
    )
  } catch (err) {
    console.error('[knowledgeBase] Failed to build vector store:', err)
    _store = null
    _embeddings = null
    _chunkCount = 0
    _indexedSources = []
    _failedSources = failedSources
    _discoveredCount = stats.discovered
    _eligibleCount = stats.eligible
    _indexedPageCount = 0
    _failedPages = failedPages
    _status = 'error'
  }
}

// ─── Rebuild (fire-and-forget) ────────────────────────────────────────────────

export function rebuildKnowledgeBase(options: InitKnowledgeBaseOptions): void {
  _status = 'building'
  _store = null
  _embeddings = null
  _chunkCount = 0
  _indexedSources = []
  _failedSources = []
  _discoveredCount = 0
  _eligibleCount = 0
  _indexedPageCount = 0
  _failedPages = []

  void initKnowledgeBase(options).catch((err) => {
    console.error('[knowledgeBase] Rebuild failed:', err)
    _status = 'error'
  })
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface KnowledgeResult {
  snippet: string
  sourceName: string
  link?: string
}

/**
 * Semantic search over the knowledge base.
 * Returns a JSON string with results including source metadata so the
 * advisor agent can construct inline citations and a Sources list.
 */
export async function searchKnowledge(query: string, k = 4): Promise<string> {
  if (!_store || !_embeddings || _status === 'building' || _status === 'not_configured') {
    return JSON.stringify({ results: [], message: 'No knowledge base configured.' })
  }
  try {
    const hits = await _store.similaritySearch(query, _embeddings, k)
    if (hits.length === 0) {
      return JSON.stringify({ results: [], message: 'No relevant knowledge found.' })
    }

    // Deduplicate by source (keep best-ranked snippet per source+page combo)
    const seen = new Set<string>()
    const results: KnowledgeResult[] = []
    for (const { text, meta } of hits) {
      const key = meta.pageUrl ?? meta.localFile ?? meta.sourceName
      if (!seen.has(key)) {
        seen.add(key)
        results.push({
          snippet: text,
          sourceName: meta.sourceName,
          ...(meta.pageUrl ? { link: meta.pageUrl } : {}),
        })
      } else {
        // Same page — append extra context to existing result
        const existing = results.find((r) =>
          (r.link ?? r.sourceName) === (meta.pageUrl ?? meta.sourceName),
        )
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
  return {
    status: _status,
    chunkCount: _chunkCount,
    sourceCount: _indexedSources.length,
    indexedSources: _indexedSources,
    failedSources: _failedSources,
    discoveredCount: _discoveredCount,
    eligibleCount: _eligibleCount,
    indexedPageCount: _indexedPageCount,
    failedPages: _failedPages.slice(0, 20), // cap list for payload size
  }
}
