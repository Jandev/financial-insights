import { useState, useCallback } from 'react'
import {
  STORAGE_KEY_OVERRIDES,
  readOverridesFromStorage,
  type CategoryOverrides,
} from '@/lib/categories'

// ─── Helper ───────────────────────────────────────────────────────────────────

function persist(overrides: CategoryOverrides): void {
  localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides))
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCategoryOverridesResult {
  /**
   * Map of transactionId → categoryId for all manually overridden transactions.
   * An override always takes precedence over rule-based categorization.
   */
  overrides: CategoryOverrides

  /**
   * Set or replace the manual category for a single transaction.
   *
   * For "all transactions from [counterparty]" use `useCategoryRules().addRule()`
   * instead — that creates a persistent pattern rule.
   */
  setOverride: (txId: string, categoryId: string) => void

  /** Remove the manual override for a transaction, restoring rule-based category. */
  removeOverride: (txId: string) => void

  /** Clear all overrides. */
  clearAll: () => void
}

/**
 * Manage per-transaction manual category overrides with localStorage persistence.
 *
 * Overrides are stored under `financial-insights:category-overrides` as a
 * `Record<txId, categoryId>` map and applied on top of rule-based categorization.
 *
 * Override wins over rules. If a user later edits the rules, a transaction with
 * an override keeps its manually assigned category until the override is removed.
 *
 * UI flow (implemented in issues #9 / #11):
 *   1. User clicks a transaction's category badge.
 *   2. Selects a new category from the dropdown.
 *   3. Prompt: "Just this transaction" → setOverride(txId, categoryId)
 *              "All from [counterparty]" → useCategoryRules().addRule(...)
 */
export function useCategoryOverrides(): UseCategoryOverridesResult {
  const [overrides, setOverrides] = useState<CategoryOverrides>(() =>
    readOverridesFromStorage(),
  )

  const setOverride = useCallback((txId: string, categoryId: string) => {
    setOverrides((prev) => {
      const updated = { ...prev, [txId]: categoryId }
      persist(updated)
      return updated
    })
  }, [])

  const removeOverride = useCallback((txId: string) => {
    setOverrides((prev) => {
      const updated = { ...prev }
      delete updated[txId]
      persist(updated)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_OVERRIDES)
    setOverrides({})
  }, [])

  return { overrides, setOverride, removeOverride, clearAll }
}
