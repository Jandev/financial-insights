import { useState, useCallback } from 'react'
import {
  DEFAULT_RULES,
  STORAGE_KEY_RULES,
  readRulesFromStorage,
  type CategoryRule,
} from '@/lib/categories'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function persist(rules: CategoryRule[]): void {
  localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules))
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
 * Manage the active category ruleset with localStorage persistence.
 *
 * Custom rules are stored under `financial-insights:category-rules` and
 * prepended before DEFAULT_RULES so they take priority.
 *
 * Usage in the rule editor (issue #11):
 *   const { customRules, addRule, updateRule, deleteRule } = useCategoryRules()
 *
 * Usage in categorization-aware components:
 *   const { rules } = useCategoryRules()
 *   const category = categorize(tx, rules)
 */
export function useCategoryRules(): UseCategoryRulesResult {
  const [customRules, setCustomRules] = useState<CategoryRule[]>(() =>
    readRulesFromStorage(),
  )

  const rules: CategoryRule[] = [...customRules, ...DEFAULT_RULES]

  const addRule = useCallback(
    (rule: Omit<CategoryRule, 'id'> & { id?: string }) => {
      const newRule: CategoryRule = { ...rule, id: rule.id ?? generateId() }
      setCustomRules((prev) => {
        const updated = [...prev, newRule]
        persist(updated)
        return updated
      })
    },
    [],
  )

  const updateRule = useCallback(
    (id: string, patch: Partial<Omit<CategoryRule, 'id'>>) => {
      setCustomRules((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
        persist(updated)
        return updated
      })
    },
    [],
  )

  const deleteRule = useCallback((id: string) => {
    setCustomRules((prev) => {
      const updated = prev.filter((r) => r.id !== id)
      persist(updated)
      return updated
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_RULES)
    setCustomRules([])
  }, [])

  return { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults }
}
