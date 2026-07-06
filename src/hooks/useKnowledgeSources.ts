/**
 * useKnowledgeSources — CRUD hook for AI knowledge base URL sources.
 *
 * Server-primary state (no localStorage fallback).
 * Each source supports optional site-crawl config (mode + policy).
 *
 * Behaviour:
 *   - Fetches GET /api/state/knowledge on mount
 *   - Fetches GET /api/state/knowledge-status on mount + after mutations
 *   - Polls every 3 s while status === 'building'
 *   - addSource / updateSource / removeSource → PUT /api/state/knowledge
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
}

export interface UseKnowledgeSourcesResult {
  sources: KnowledgeSource[]
  statusData: KnowledgeStatusData | null
  loading: boolean
  error: string | null
  addSource: (source: KnowledgeSource) => Promise<string | null>
  updateSource: (url: string, updated: KnowledgeSource) => Promise<string | null>
  removeSource: (url: string) => Promise<void>
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateSource(source: KnowledgeSource): string | null {
  if (!source.name.trim()) return 'Name is required'
  try {
    const parsed = new URL(source.url)
    if (parsed.protocol !== 'https:') return 'Only https:// URLs allowed'
  } catch {
    return 'Invalid URL'
  }
  if (source.policy?.maxPages !== undefined && source.policy.maxPages < 1) return 'maxPages must be ≥ 1'
  if (source.policy?.maxDepth !== undefined && source.policy.maxDepth < 1) return 'maxDepth must be ≥ 1'
  return null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000

export function useKnowledgeSources(): UseKnowledgeSourcesResult {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [statusData, setStatusData] = useState<KnowledgeStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/state/knowledge-status')
      if (!res.ok) return undefined
      const json = await res.json() as { data: KnowledgeStatusData }
      setStatusData(json.data)
      return json.data.status
    } catch {
      return undefined
    }
  }, [])

  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(async () => {
      const status = await fetchStatus()
      if (status === 'building') schedulePoll()
    }, POLL_INTERVAL_MS)
  }, [fetchStatus])

  const startPollingIfBuilding = useCallback(async () => {
    const status = await fetchStatus()
    if (status === 'building') schedulePoll()
  }, [fetchStatus, schedulePoll])

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
        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const json = await statusRes.value.json() as { data: KnowledgeStatusData }
          setStatusData(json.data)
          if (json.data.status === 'building') schedulePoll()
        }
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
  }, [schedulePoll])

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
    setStatusData((prev) =>
      prev
        ? { ...prev, status: 'building' }
        : { status: 'building', chunkCount: 0, sourceCount: 0, indexedSources: [], failedSources: [], discoveredCount: 0, eligibleCount: 0, indexedPageCount: 0, failedPages: [] },
    )
    void startPollingIfBuilding()
  }, [startPollingIfBuilding])

  const addSource = useCallback(async (source: KnowledgeSource): Promise<string | null> => {
    const err = validateSource(source)
    if (err) return err
    const updated = [...sources, source]
    try {
      await putSources(updated)
      setSources(updated)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Failed to add source'
    }
  }, [sources, putSources])

  const updateSource = useCallback(async (url: string, updated: KnowledgeSource): Promise<string | null> => {
    const err = validateSource(updated)
    if (err) return err
    const newList = sources.map((s) => s.url === url ? updated : s)
    try {
      await putSources(newList)
      setSources(newList)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Failed to update source'
    }
  }, [sources, putSources])

  const removeSource = useCallback(async (url: string): Promise<void> => {
    const updated = sources.filter((s) => s.url !== url)
    await putSources(updated)
    setSources(updated)
  }, [sources, putSources])

  return { sources, statusData, loading, error, addSource, updateSource, removeSource }
}
