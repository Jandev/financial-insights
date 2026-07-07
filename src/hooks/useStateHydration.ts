/**
 * useStateSync — issue #70.
 *
 * Replaces useStateHydration. Responsibilities:
 *   1. On mount: fetch all state keys from the server → Zustand (no localStorage)
 *   2. Start a 30-second background poll using /api/state/summary lastUpdated
 *      timestamps to only re-fetch keys that changed since last sync.
 *   3. In-flight PUT guard: skip re-fetch for any key that has a pending
 *      debouncePut write (prevents overwriting optimistic local updates).
 *   4. After any categorization-relevant key updates → recategorize().
 */

import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { useHydrateCategorizationState } from '@/hooks/hydration/useHydrateCategorizationState'
import { useHydrateLLMState } from '@/hooks/hydration/useHydrateLLMState'
import { hasPendingWrite } from '@/lib/serverState'
import type { AICategoryResult } from '@/store/slices/llmTypes'
import type { CategoryRule } from '@/lib/categories'
import type { SavingsAccount } from '@/types/savingsAccount'
import type { PersonalAccount } from '@/types/personalAccount'

const POLL_INTERVAL_MS = 30_000

/** Keys that, when changed on the server, require a recategorize() call. */
const CATEGORIZATION_KEYS = new Set([
  'categories',
  'ai-categories',
  'rules',
  'spaarpotjes',
  'tag-overrides',
  'personal-accounts',
  'exclusions',
])

// Shape returned by GET /api/state/summary
interface StateSummaryEntry {
  lastUpdated: string
  size: number
}

interface StateSummary {
  keys: Record<string, StateSummaryEntry>
}

export function useStateSync(): void {
  const recategorize = useStore((s) => s.recategorize)
  const hydrateExclusions = useStore((s) => s.hydrateExclusions)
  const setCategoryOverridesState = useStore((s) => s.setCategoryOverridesState)
  const setCategorizationRules = useStore((s) => s.setCategorizationRules)
  const setSavingsAccountsState = useStore((s) => s.setSavingsAccountsState)
  const setTagOverridesState = useStore((s) => s.setTagOverridesState)
  const setPersonalAccountsState = useStore((s) => s.setPersonalAccountsState)
  const setDefaultNameOverridesState = useStore((s) => s.setDefaultNameOverridesState)
  const setAiCategories = useStore((s) => s.setAiCategories)

  const hydrateCategorizationState = useHydrateCategorizationState()
  const hydrateLLMState = useHydrateLLMState()

  // Tracks the lastUpdated timestamp we last fetched for each key
  const lastSeenRef = useRef<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function initialSync(): Promise<void> {
      await Promise.all([
        hydrateCategorizationState(),
        hydrateLLMState(),
      ])

      if (cancelled) return
      recategorize()

      // Record initial lastUpdated values
      try {
        const res = await fetch('/api/state/summary')
        if (res.ok) {
          const summary = (await res.json()) as StateSummary
          for (const [key, entry] of Object.entries(summary.keys ?? {})) {
            lastSeenRef.current[key] = entry.lastUpdated
          }
        }
      } catch {
        // Server unreachable — polling will retry
      }
    }

    async function poll(): Promise<void> {
      if (cancelled) return

      let needsRecategorize = false

      try {
        const res = await fetch('/api/state/summary')
        if (!res.ok) return
        const summary = (await res.json()) as StateSummary

        for (const [key, entry] of Object.entries(summary.keys ?? {})) {
          const prev = lastSeenRef.current[key]
          if (prev === entry.lastUpdated) continue       // not changed
          if (hasPendingWrite(key)) continue             // in-flight PUT guard

          lastSeenRef.current[key] = entry.lastUpdated

          // Fetch and apply the changed key
          await applyKey(key)
          if (CATEGORIZATION_KEYS.has(key)) needsRecategorize = true
        }
      } catch {
        // Server unreachable — skip this tick
      }

      if (needsRecategorize && !cancelled) recategorize()
    }

    async function applyKey(key: string): Promise<void> {
      try {
        const r = await fetch(`/api/state/${key}`)
        if (!r.ok) return
        const envelope = (await r.json()) as { data: unknown }
        const data = envelope.data

        switch (key) {
          case 'exclusions': {
            const ids: string[] = (data as { ids: string[] }).ids ?? []
            hydrateExclusions(ids)
            break
          }
          case 'categories': {
            // "categories" stores only manual string overrides (txId → categoryId).
            const map = data as Record<string, unknown>
            const overrides: Record<string, string> = {}
            for (const [id, v] of Object.entries(map)) {
              if (typeof v === 'string') overrides[id] = v
            }
            setCategoryOverridesState(overrides)
            break
          }
          case 'ai-categories': {
            setAiCategories(data as Record<string, AICategoryResult>)
            break
          }
          case 'rules': {
            const rawRules = ((data as { rules: unknown[] }).rules ?? []) as Array<CategoryRule & { kind?: string }>
            const rules = rawRules.map((r): CategoryRule => r.kind ? (r as CategoryRule) : { ...(r as object), kind: 'condition' } as CategoryRule)
            setCategorizationRules(rules)
            break
          }
          case 'spaarpotjes': {
            const accounts: SavingsAccount[] = (data as { accounts: SavingsAccount[] }).accounts ?? []
            setSavingsAccountsState(accounts)
            break
          }
          case 'tag-overrides': {
            setTagOverridesState(data as Record<string, string[]>)
            break
          }
          case 'personal-accounts': {
            const accounts: PersonalAccount[] = (data as { accounts: PersonalAccount[] }).accounts ?? []
            setPersonalAccountsState(accounts)
            break
          }
          case 'default-name-overrides': {
            setDefaultNameOverridesState(data as Record<string, string>)
            break
          }
        }
      } catch {
        // Ignore per-key fetch failures
      }
    }

    void initialSync()

    const timer = setInterval(() => { void poll() }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [
    hydrateCategorizationState,
    hydrateLLMState,
    recategorize,
    hydrateExclusions,
    setCategoryOverridesState,
    setCategorizationRules,
    setSavingsAccountsState,
    setTagOverridesState,
    setPersonalAccountsState,
    setDefaultNameOverridesState,
    setAiCategories,
  ])
}
