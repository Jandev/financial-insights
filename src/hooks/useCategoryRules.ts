import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  DEFAULT_RULES,
  STORAGE_KEY_RULES,
  readRulesFromStorage,
  migrateCustomRule,
  applyDefaultNameOverrides,
  type CategoryRule,
  type CategoryRuleDraft,
} from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'
import { useDefaultNameOverrides } from '@/hooks/useDefaultNameOverrides'
import { createPersistFns } from '@/lib/persistence'
import { useStorageHydration } from '@/hooks/useStorageHydration'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Broadcast on every addRule / updateRule / deleteRule so that ALL
 * useCategoryRules() instances (one per CategoryBadge row, one in the picker,
 * etc.) re-read from localStorage in the same React batch as recategorize().
 * Without this, only the instance that called the mutation gets updated;
 * CategoryBadge instances see stale customRules and show the raw id instead
 * of the display name.
 */
const RULES_UPDATED_EVENT = 'category-rules-changed'

function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCategoryRulesResult {
  /**
   * The active ruleset: custom rules (from localStorage) prepended before
   * DEFAULT_RULES (with any name overrides applied). Custom rules always take priority.
   */
  rules: CategoryRule[]

  /**
   * The custom rules only (what is stored in localStorage).
   * Useful when rendering the rule editor — DEFAULT_RULES are shown separately.
   */
  customRules: CategoryRule[]

  /** Add a new custom rule. An `id` is auto-generated if not supplied. */
  addRule: (rule: CategoryRuleDraft & { id?: string }) => void

  /** Replace an existing custom rule by id. */
  updateRule: (id: string, rule: CategoryRuleDraft) => void

  /** Remove a custom rule by id. Default rules are not affected. */
  deleteRule: (id: string) => void

  /** Clear all custom rules, restoring the default ruleset. */
  resetToDefaults: () => void

  /** Current map of categoryId → custom display name for built-in default rules. */
  defaultNameOverrides: Record<string, string>

  /** Set a custom display name for a built-in default rule. */
  setDefaultNameOverride: (id: string, name: string) => void

  /** Remove the custom display name for a single built-in default rule. */
  removeDefaultNameOverride: (id: string) => void

  /** Remove all custom display name overrides, restoring English defaults. */
  resetDefaultNameOverrides: () => void
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
  const { persistAll } = useMemo(
    () => createPersistFns<CategoryRule[]>(STORAGE_KEY_RULES, 'rules', 'rules'),
    [],
  )

  const readMigratedRules = useCallback(() => {
    const stored = readRulesFromStorage()
    const migrated = stored.map(migrateCustomRule)
    const didMigrate = migrated.some((r, i) => r !== stored[i])
    if (didMigrate) persistAll(migrated)
    return migrated
  }, [persistAll])

  const [customRules, setCustomRules] = useState<CategoryRule[]>(() => readMigratedRules())

  const {
    overrides: defaultNameOverrides,
    setOverride: setDefaultNameOverride,
    removeOverride: removeDefaultNameOverride,
    resetOverrides: resetDefaultNameOverrides,
  } = useDefaultNameOverrides()

  // Re-read from localStorage when server hydration writes fresh data.
  useStorageHydration(readMigratedRules, setCustomRules)

  // Re-read from localStorage when another useCategoryRules() instance mutates.
  useEffect(() => {
    const handler = () => {
      setCustomRules(readMigratedRules())
    }
    window.addEventListener(RULES_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(RULES_UPDATED_EVENT, handler)
    }
  }, [readMigratedRules])

  // Memoised so that useEffect comparisons in consumers stay stable
  const rules = useMemo<CategoryRule[]>(
    () => [...customRules, ...applyDefaultNameOverrides(DEFAULT_RULES, defaultNameOverrides)],
    [customRules, defaultNameOverrides],
  )

  const addRule = useCallback(
    (rule: CategoryRuleDraft & { id?: string }) => {
      const nextId = rule.id ?? generateId()
      const newRule: CategoryRule =
        rule.kind === 'condition'
          ? { ...rule, id: nextId }
          : { ...rule, id: nextId }

      const updated = [...readRulesFromStorage(), newRule]
      persistAll(updated)
      // Notify all useCategoryRules instances so they re-read from localStorage.
      // React 18 automatic batching groups these setCustomRules calls with the
      // subsequent recategorize() Zustand update into one render, ensuring
      // CategoryBadge sees the new rule name and the new tx.category together.
      window.dispatchEvent(new CustomEvent(RULES_UPDATED_EVENT))
    },
    [persistAll],
  )

  const updateRule = useCallback(
    (id: string, rule: CategoryRuleDraft) => {
      const updated = readRulesFromStorage().map((existing) => {
        if (existing.id !== id) return existing
        return rule.kind === 'condition'
          ? { ...rule, id }
          : { ...rule, id }
      })

      persistAll(updated)
      window.dispatchEvent(new CustomEvent(RULES_UPDATED_EVENT))
    },
    [persistAll],
  )

  const deleteRule = useCallback((id: string) => {
    const updated = readRulesFromStorage().filter((r) => r.id !== id)
    persistAll(updated)
    window.dispatchEvent(new CustomEvent(RULES_UPDATED_EVENT))
  }, [persistAll])

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_RULES)
    debouncePut('rules', { rules: [] })
    setCustomRules([])
    window.dispatchEvent(new CustomEvent(RULES_UPDATED_EVENT))
  }, [])

  return { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults, defaultNameOverrides, setDefaultNameOverride, removeDefaultNameOverride, resetDefaultNameOverrides }
}
