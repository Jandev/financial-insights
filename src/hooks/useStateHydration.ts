/**
 * useStateHydration — issue #22.
 *
 * Runs once on app mount. Fetches exclusions, categories, and rules from the
 * Express state API in parallel and writes the results into the Zustand store
 * and localStorage. Dispatches `state-hydrated` so hooks re-read storage.
 *
 * Fallback strategy (Vite-only mode, no Express):
 *   All fetches fail with a network error → caught silently → localStorage
 *   remains the source of truth → logs once to console.
 */

import { useEffect } from 'react'
import { useStore } from '@/store'
import { STORAGE_KEY_RULES, STORAGE_KEY_OVERRIDES } from '@/lib/categories'
import { STORAGE_KEY_SPAARPOTJES, STORAGE_KEY_TAG_OVERRIDES } from '@/hooks/useSavingsAccounts'
import { setServerAvailable } from '@/lib/serverState'

// Dispatched after hydration so hooks re-read localStorage
const HYDRATION_EVENT = 'state-hydrated'

export function useStateHydration(): void {
  const setServerStateAvailable = useStore((s) => s.setServerStateAvailable)
  const hydrateExclusions = useStore((s) => s.hydrateExclusions)
  const recategorize = useStore((s) => s.recategorize)

  useEffect(() => {
    let cancelled = false

    async function hydrate(): Promise<void> {
      // Fetch all keys in parallel; allSettled never throws
      const [exclusionsResult, categoriesResult, rulesResult, spaarpotjesResult, tagOverridesResult] =
        await Promise.allSettled([
          fetch('/api/state/exclusions').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/categories').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/rules').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/spaarpotjes').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/state/tag-overrides').then((r) => (r.ok ? r.json() : null)),
        ])

      if (cancelled) return

      // All rejected = network error = Express not running
      const allFailed = [exclusionsResult, categoriesResult, rulesResult, spaarpotjesResult, tagOverridesResult].every(
        (r) => r.status === 'rejected',
      )

      if (allFailed) {
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

      // Hydrate category overrides into localStorage (hooks re-read via event)
      if (categoriesResult.status === 'fulfilled' && categoriesResult.value !== null) {
        const overrides: Record<string, string> = categoriesResult.value?.data ?? {}
        localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides))
      }

      // Hydrate custom rules into localStorage (hooks re-read via event)
      if (rulesResult.status === 'fulfilled' && rulesResult.value !== null) {
        const rules: unknown[] = rulesResult.value?.data?.rules ?? []
        localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules))
      }

      // Hydrate spaarpotjes into localStorage (useSavingsAccounts re-reads via event)
      if (spaarpotjesResult.status === 'fulfilled' && spaarpotjesResult.value !== null) {
        const accounts: unknown[] = spaarpotjesResult.value?.data?.accounts ?? []
        localStorage.setItem(STORAGE_KEY_SPAARPOTJES, JSON.stringify(accounts))
      }

      // Hydrate tag overrides into localStorage (hooks re-read via event)
      if (tagOverridesResult.status === 'fulfilled' && tagOverridesResult.value !== null) {
        const tagOverrides: Record<string, string[]> = tagOverridesResult.value?.data ?? {}
        localStorage.setItem(STORAGE_KEY_TAG_OVERRIDES, JSON.stringify(tagOverrides))
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
  }, [setServerStateAvailable, hydrateExclusions, recategorize])
}
