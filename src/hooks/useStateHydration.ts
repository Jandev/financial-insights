/**
 * useStateHydration — issues #22, #17.
 *
 * Runs once on app mount. Fetches exclusions, categories, rules, anomaly
 * findings, and LLM availability from the Express API in parallel and writes
 * the results into the Zustand store and localStorage.
 *
 * Fallback strategy (Vite-only mode, no Express):
 *   All fetches fail with a network error → caught silently → localStorage
 *   remains the source of truth → logs once to console.
 */

import { useEffect } from 'react'
import { useStore } from '@/store'
import { STORAGE_KEY_RULES, STORAGE_KEY_OVERRIDES } from '@/lib/categories'
import { setServerAvailable } from '@/lib/serverState'
import type { AnomalyFinding, AICategoryResult, LLMProvider } from '@/store/slices/llmSlice'

// Dispatched after hydration so hooks re-read localStorage
const HYDRATION_EVENT = 'state-hydrated'

export function useStateHydration(): void {
  const setServerStateAvailable = useStore((s) => s.setServerStateAvailable)
  const hydrateExclusions = useStore((s) => s.hydrateExclusions)
  const recategorize = useStore((s) => s.recategorize)
  const checkLLMStatus = useStore((s) => s.checkLLMStatus)
  const setLLMStatusDirect = useStore((s) => s.setLLMStatusDirect)
  const setFindings = useStore((s) => s.setFindings)
  const setAiCategories = useStore((s) => s.setAiCategories)
  const setDismissedFindingIds = useStore((s) => s.setDismissedFindingIds)
  const bulkSetInsights = useStore((s) => s.bulkSetInsights)

  useEffect(() => {
    let cancelled = false

    async function hydrate(): Promise<void> {
      // Fetch all keys in parallel; allSettled never throws
      const [exclusionsResult, categoriesResult, rulesResult, anomaliesResult, llmStatusResult, dismissedResult, insightsResult] =
        await Promise.allSettled([
          fetch('/api/state/exclusions').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/categories').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/rules').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/anomalies').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/llm/status').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/dismissed').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/llm/insights').then((r) => (r.ok ? r.json() : null)),
        ])

      if (cancelled) return

      // All non-LLM status calls rejected = Express not running
      const stateFailed = [exclusionsResult, categoriesResult, rulesResult].every(
        (r) => r.status === 'rejected',
      )

      if (stateFailed) {
        console.log('[state] Express not available — using localStorage fallback')
        setServerAvailable(false)
        setServerStateAvailable(false)
        return
      }

      // At least one succeeded — Express is reachable
      setServerAvailable(true)
      setServerStateAvailable(true)

      // Hydrate exclusions into Zustand
      if (exclusionsResult.status === 'fulfilled' && exclusionsResult.value !== null) {
        const ids: string[] = exclusionsResult.value?.data?.ids ?? []
        hydrateExclusions(ids)
      }

      // Hydrate AI category overrides into llmSlice
      if (categoriesResult.status === 'fulfilled' && categoriesResult.value !== null) {
        const data = categoriesResult.value?.data ?? {}
        // State may contain both 'rule' and 'llm' source entries — load all
        const aiEntries = Object.entries(data as Record<string, AICategoryResult>).filter(
          ([, v]) => v.source === 'llm',
        )
        if (aiEntries.length > 0) {
          setAiCategories(Object.fromEntries(aiEntries))
        }
        // Also hydrate overrides (rule-based manual) into localStorage for recategorize()
        const overrides: Record<string, string> = {}
        for (const [id, v] of Object.entries(data as Record<string, AICategoryResult>)) {
          if (v.source === 'rule') overrides[id] = v.category
        }
        if (Object.keys(overrides).length > 0) {
          localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides))
        }
      }

      // Hydrate custom rules into localStorage (hooks re-read via event)
      if (rulesResult.status === 'fulfilled' && rulesResult.value !== null) {
        const rules: unknown[] = rulesResult.value?.data?.rules ?? []
        localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules))
      }

      // Hydrate anomaly findings into llmSlice
      if (anomaliesResult.status === 'fulfilled' && anomaliesResult.value !== null) {
        const findings: AnomalyFinding[] = anomaliesResult.value?.data?.findings ?? []
        if (findings.length > 0) setFindings(findings)
      }

      // Hydrate dismissed finding IDs — union with Zustand-persisted set
      if (dismissedResult.status === 'fulfilled' && dismissedResult.value !== null) {
        const ids: string[] = dismissedResult.value?.data?.ids ?? []
        if (ids.length > 0) setDismissedFindingIds(ids)
      }

      // Restore insight cache from server — local Zustand cache wins for conflicts
      if (insightsResult.status === 'fulfilled' && insightsResult.value !== null) {
        const insights: Record<string, string> = insightsResult.value?.insights ?? {}
        if (Object.keys(insights).length > 0) bulkSetInsights(insights)
      }

      // Apply pre-fetched LLM status — avoids a second round-trip
      if (llmStatusResult.status === 'fulfilled' && llmStatusResult.value !== null) {
        setLLMStatusDirect(
          llmStatusResult.value as { available: boolean; provider: LLMProvider | null; model: string | null },
        )
      } else if (llmStatusResult.status === 'rejected') {
        // Server reachable but /api/llm/status failed — re-try via action
        void checkLLMStatus()
      }

      // Notify hooks to re-read localStorage with the freshly hydrated data
      window.dispatchEvent(new CustomEvent(HYDRATION_EVENT))

      // Re-run categorization so charts reflect the hydrated overrides immediately
      recategorize()
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [setServerStateAvailable, hydrateExclusions, recategorize, checkLLMStatus, setLLMStatusDirect, setFindings, setAiCategories, setDismissedFindingIds, bulkSetInsights])
}

