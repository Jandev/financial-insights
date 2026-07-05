import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  DEFAULT_RULES,
  STORAGE_KEY_RULES,
  readRulesFromStorage,
  migrateCustomRule,
  type CategoryRule,
} from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function persistLocal(rules: CategoryRule[]): void {
  localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules))
}

function persistAll(rules: CategoryRule[]): void {
  persistLocal(rules)
  debouncePut('rules', { rules })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCategoryRulesResult {
  /**
   * The active ruleset: custom rules (from localStorage) prepended before
   * DEFAULT_RULES. Custom rules always take priority.
   */
  rules: CategoryRule[]

  /**
   * The custom rules only (what is stored in localStorage).
   * Useful when rendering the rule editor — DEFAULT_RULES are shown separately.
   */
  customRules: CategoryRule[]

  /** Add a new custom rule. An `id` is auto-generated if not supplied. */
  addRule: (rule: Omit<CategoryRule, 'id'> & { id?: string }) => void

  /** Partially update an existing custom rule by id. */
  updateRule: (id: string, patch: Partial<Omit<CategoryRule, 'id'>>) => void

  /** Remove a custom rule by id. Default rules are not affected. */
  deleteRule: (id: string) => void

  /** Clear all custom rules, restoring the default ruleset. */
  resetToDefaults: () => void
}

/**
 * Manage the active category ruleset with localStorage + server persistence.
 *
 * Custom rules are stored under `financial-insights:category-rules` and
 * prepended before DEFAULT_RULES so they take priority.
 *
 * When the Express state API is available, every mutation also fires a
 * debounced PUT /api/state/rules (500 ms window). When Express is not
 * reachable, the hook degrades silently to localStorage-only.
 *
 * Usage in the rule editor (issue #11):
 *   const { customRules, addRule, updateRule, deleteRule } = useCategoryRules()
 *
 * Usage in categorization-aware components:
 *   const { rules } = useCategoryRules()
 *   const category = categorize(tx, rules)
 */
export function useCategoryRules(): UseCategoryRulesResult {
  const [customRules, setCustomRules] = useState<CategoryRule[]>(() => {
    // Auto-migrate any legacy pattern-based rules to the new condition format
    const stored = readRulesFromStorage()
    const migrated = stored.map(migrateCustomRule)
    // If migration changed anything, persist the upgraded rules to both
    // localStorage and the server so they stay in sync from the start.
    const didMigrate = migrated.some((r, i) => r !== stored[i])
    if (didMigrate) persistAll(migrated)
    return migrated
  })

  // Re-read from localStorage when server hydration writes fresh data.
  // Also persist migrated format back to the server so it stays current.
  useEffect(() => {
    const handler = () => {
      const stored = readRulesFromStorage()
      const migrated = stored.map(migrateCustomRule)
      const didMigrate = migrated.some((r, i) => r !== stored[i])
      // Write migrated format to both LS and server so they agree
      if (didMigrate) persistAll(migrated)
      setCustomRules(migrated)
    }
    window.addEventListener('state-hydrated', handler)
    return () => window.removeEventListener('state-hydrated', handler)
  }, [])

  // Memoised so that useEffect comparisons in consumers stay stable
  const rules = useMemo<CategoryRule[]>(
    () => [...customRules, ...DEFAULT_RULES],
    [customRules],
  )

  const addRule = useCallback(
    (rule: Omit<CategoryRule, 'id'> & { id?: string }) => {
      const newRule: CategoryRule = { ...rule, id: rule.id ?? generateId() }
      setCustomRules((prev) => {
        const updated = [...prev, newRule]
        persistAll(updated)
        return updated
      })
    },
    [],
  )

  const updateRule = useCallback(
    (id: string, patch: Partial<Omit<CategoryRule, 'id'>>) => {
      setCustomRules((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
        persistAll(updated)
        return updated
      })
    },
    [],
  )

  const deleteRule = useCallback((id: string) => {
    setCustomRules((prev) => {
      const updated = prev.filter((r) => r.id !== id)
      persistAll(updated)
      return updated
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_RULES)
    debouncePut('rules', { rules: [] })
    setCustomRules([])
  }, [])

  return { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults }
}
