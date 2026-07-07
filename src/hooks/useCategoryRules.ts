import { useCallback, useMemo } from 'react'
import {
  DEFAULT_RULES,
  migrateCustomRule,
  applyDefaultNameOverrides,
  type CategoryRule,
  type CategoryRuleDraft,
} from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'
import { useDefaultNameOverrides } from '@/hooks/useDefaultNameOverrides'
import { useStore } from '@/store'
import { randomUUID } from '@/lib/uuid'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `custom-${randomUUID()}`
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
 * Manage the active category ruleset with server persistence.
 *
 * Custom rules live in Zustand (`categorizationRules`) and are synced to the
 * server via debounced PUT /api/state/rules (500 ms window).
 *
 * Usage in the rule editor (issue #11):
 *   const { customRules, addRule, updateRule, deleteRule } = useCategoryRules()
 *
 * Usage in categorization-aware components:
 *   const { rules } = useCategoryRules()
 *   const category = categorize(tx, rules)
 */
export function useCategoryRules(): UseCategoryRulesResult {
  const customRules = useStore((s) => s.categorizationRules)
  const setCategorizationRules = useStore((s) => s.setCategorizationRules)
  const recategorize = useStore((s) => s.recategorize)

  const {
    overrides: defaultNameOverrides,
    setOverride: setDefaultNameOverride,
    removeOverride: removeDefaultNameOverride,
    resetOverrides: resetDefaultNameOverrides,
  } = useDefaultNameOverrides()

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

      const updated = [...customRules, newRule].map(migrateCustomRule)
      setCategorizationRules(updated)
      debouncePut('rules', { rules: updated })
      recategorize()
    },
    [customRules, setCategorizationRules, recategorize],
  )

  const updateRule = useCallback(
    (id: string, rule: CategoryRuleDraft) => {
      const updated = customRules.map((existing) => {
        if (existing.id !== id) return existing
        return rule.kind === 'condition'
          ? { ...rule, id }
          : { ...rule, id }
      })

      setCategorizationRules(updated)
      debouncePut('rules', { rules: updated })
      recategorize()
    },
    [customRules, setCategorizationRules, recategorize],
  )

  const deleteRule = useCallback((id: string) => {
    const updated = customRules.filter((r) => r.id !== id)
    setCategorizationRules(updated)
    debouncePut('rules', { rules: updated })
    recategorize()
  }, [customRules, setCategorizationRules, recategorize])

  const resetToDefaults = useCallback(() => {
    setCategorizationRules([])
    debouncePut('rules', { rules: [] })
    recategorize()
  }, [setCategorizationRules, recategorize])

  return { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults, defaultNameOverrides, setDefaultNameOverride, removeDefaultNameOverride, resetDefaultNameOverrides }
}
