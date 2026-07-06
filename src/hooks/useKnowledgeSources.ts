/**
 * useKnowledgeSources — CRUD hook for AI knowledge base URL sources.
 *
 * Server-primary state (no localStorage fallback).
 *
 * Behaviour:
 *   - Fetches sources + status on mount
 *   - Polls every 1 s while any source is queued/building or global building
 *   - addSource / updateSource / removeSource → PUT /api/state/knowledge
 *   - resyncSource(url) → POST /api/state/knowledge/resync-source
 *
 * Issue #53.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface KnowledgeStatusData {
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

export interface UseKnowledgeSourcesResult {
  sources: KnowledgeSource[]
  statusData: KnowledgeStatusData | null
  loading: boolean
  error: string | null
  addSource: (source: KnowledgeSource) => Promise<string | null>
  updateSource: (url: string, updated: KnowledgeSource) => Promise<string | null>
  removeSource: (url: string) => Promise<void>
  resyncSource: (url: string) => Promise<string | null>
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateSource(source: KnowledgeSource): string | null {
  if (!source.name.trim()) return 'Name is required'
  try {
    const parsed = new URL(source.url)
    if (parsed.protocol !== 'https:') return 'Only https:// URLs allowed'
  } catch { return 'Invalid URL' }
  if (source.policy?.maxPages !== undefined && source.policy.maxPages < 1) return 'maxPages must be >= 1'
  if (source.policy?.maxDepth !== undefined && source.policy.maxDepth < 1) return 'maxDepth must be >= 1'
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isActive(statusData: KnowledgeStatusData | null): boolean {
  if (!statusData) return false
  if (statusData.status === 'building') return true
  if (statusData.queueLength > 0) return true
  // Also active if phase indicates ongoing work (catches startup path where status
  // may not yet be 'building' but processing is underway)
  const p = statusData.phase
  if (p && p !== 'idle' && p !== 'done' && p !== '' && p !== 'starting') return true
  return Object.values(statusData.sourceProgress).some(
    (p) => p.status === 'queued' || p.status === 'building',
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_ACTIVE_MS = 1000    // 1 s while building/queued
const POLL_IDLE_MS = 5000      // 5 s when idle (catch eventual state changes)

export function useKnowledgeSources(): UseKnowledgeSourcesResult {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [statusData, setStatusData] = useState<KnowledgeStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusDataRef = useRef<KnowledgeStatusData | null>(null)
  statusDataRef.current = statusData

  // ── Status fetch ────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (): Promise<KnowledgeStatusData | null> => {
    try {
      const res = await fetch('/api/state/knowledge-status')
      if (!res.ok) return null
      const json = await res.json() as { data: KnowledgeStatusData }
      setStatusData(json.data)
      return json.data
    } catch { return null }
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────────

  const scheduleNextPoll = useCallback((data: KnowledgeStatusData | null) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    const delay = isActive(data) ? POLL_ACTIVE_MS : POLL_IDLE_MS
    pollTimerRef.current = setTimeout(async () => {
      const next = await fetchStatus()
      scheduleNextPoll(next)
    }, delay)
  }, [fetchStatus])

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [sourcesRes, statusRes] = await Promise.allSettled([
          fetch('/api/state/knowledge'),
          fetch('/api/state/knowledge-status'),
        ])
        if (cancelled) return
        if (sourcesRes.status === 'fulfilled' && sourcesRes.value.ok) {
          const json = await sourcesRes.value.json() as { data: { sources: KnowledgeSource[] } }
          setSources(json.data?.sources ?? [])
        }
        let latestStatus: KnowledgeStatusData | null = null
        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const json = await statusRes.value.json() as { data: KnowledgeStatusData }
          setStatusData(json.data)
          latestStatus = json.data
        }
        scheduleNextPoll(latestStatus)
      } catch {
        if (!cancelled) setError('Failed to load knowledge sources')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [scheduleNextPoll])

  // ── PUT sources helper ──────────────────────────────────────────────────────

  const putSources = useCallback(async (updated: KnowledgeSource[]): Promise<void> => {
    const res = await fetch('/api/state/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: updated }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `Server error ${res.status}`)
    }
    // Mark all sources as building immediately (full rebuild triggered)
    setStatusData((prev) => {
      const base = prev ?? {
        status: 'building' as KnowledgeStatus, chunkCount: 0, sourceCount: 0,
        indexedSources: [], failedSources: [], discoveredCount: 0,
        eligibleCount: 0, indexedPageCount: 0, failedPages: [],
        phase: 'starting', currentSource: null, queueLength: 0, sourceProgress: {},
      }
      return { ...base, status: 'building' }
    })
    // Kick poll at fast rate immediately
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(async () => {
      const next = await fetchStatus()
      scheduleNextPoll(next)
    }, 500)
  }, [fetchStatus, scheduleNextPoll])

  // ── CRUD mutations ──────────────────────────────────────────────────────────

  const addSource = useCallback(async (source: KnowledgeSource): Promise<string | null> => {
    const err = validateSource(source)
    if (err) return err
    const updated = [...sources, source]
    try { await putSources(updated); setSources(updated); return null }
    catch (e) { return e instanceof Error ? e.message : 'Failed to add source' }
  }, [sources, putSources])

  const updateSource = useCallback(async (url: string, updated: KnowledgeSource): Promise<string | null> => {
    const err = validateSource(updated)
    if (err) return err
    const newList = sources.map((s) => s.url === url ? updated : s)
    try { await putSources(newList); setSources(newList); return null }
    catch (e) { return e instanceof Error ? e.message : 'Failed to update source' }
  }, [sources, putSources])

  const removeSource = useCallback(async (url: string): Promise<void> => {
    const updated = sources.filter((s) => s.url !== url)
    await putSources(updated)
    setSources(updated)
  }, [sources, putSources])

  // ── Targeted resync ──────────────────────────────────────────────────────────

  const resyncSource = useCallback(async (url: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/state/knowledge/resync-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        return body.error ?? `Server error ${res.status}`
      }
      // Immediately mark this source as queued in local state
      setStatusData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          sourceProgress: {
            ...prev.sourceProgress,
            [url]: {
              ...(prev.sourceProgress[url] ?? { discovered: 0, eligible: 0, processed: 0, chunks: 0 }),
              status: 'queued' as SourceStatus,
              phase: 'queued',
              updatedAt: new Date().toISOString(),
            },
          },
        }
      })
      // Kick fast poll
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(async () => {
        const next = await fetchStatus()
        scheduleNextPoll(next)
      }, 300)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Failed to resync source'
    }
  }, [fetchStatus, scheduleNextPoll])

  return { sources, statusData, loading, error, addSource, updateSource, removeSource, resyncSource }
}
