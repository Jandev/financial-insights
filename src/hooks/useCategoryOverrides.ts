import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  STORAGE_KEY_OVERRIDES,
  readOverridesFromStorage,
  type CategoryOverrides,
} from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'
import { createPersistFns } from '@/lib/persistence'
import { useStorageHydration } from '@/hooks/useStorageHydration'
import { useStore } from '@/store'

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
 * Manage per-transaction manual category overrides with localStorage + server
 * persistence.
 *
 * Overrides are stored under `financial-insights:category-overrides` as a
 * `Record<txId, categoryId>` map and applied on top of rule-based categorization.
 *
 * When the Express state API is available, every mutation also fires a
 * debounced PUT /api/state/categories (500 ms window). AI-assigned categories
 * (issue #18) are stored separately in the Zustand `aiCategories` overlay and
 * do not share this key.
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
  const setCategoryOverridesState = useStore((s) => s.setCategoryOverridesState)

  const { persistAll } = useMemo(
    () => createPersistFns<CategoryOverrides>(STORAGE_KEY_OVERRIDES, 'categories'),
    [],
  )

  const [overrides, setOverrides] = useState<CategoryOverrides>(() =>
    readOverridesFromStorage(),
  )

  useEffect(() => {
    setCategoryOverridesState(overrides)
  }, [overrides, setCategoryOverridesState])

  // Re-read from localStorage when server hydration writes fresh data
  useStorageHydration(readOverridesFromStorage, (next) => {
    setOverrides(next)
    setCategoryOverridesState(next)
  })

  const setOverride = useCallback((txId: string, categoryId: string) => {
    // Compute and persist synchronously so recategorize() reads fresh data
    // in the same event handler. React state setter callbacks are deferred
    // to the render phase — putting persistAll inside them causes recategorize()
    // to read stale localStorage before the write happens.
    const updated = { ...readOverridesFromStorage(), [txId]: categoryId }
    persistAll(updated)
    setOverrides(updated)
    setCategoryOverridesState(updated)
  }, [persistAll, setCategoryOverridesState])

  const removeOverride = useCallback((txId: string) => {
    const current = readOverridesFromStorage()
    if (!Object.prototype.hasOwnProperty.call(current, txId)) return
    const updated = { ...current }
    delete updated[txId]
    persistAll(updated)
    setOverrides(updated)
    setCategoryOverridesState(updated)
  }, [persistAll, setCategoryOverridesState])

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_OVERRIDES)
    debouncePut('categories', {})
    setOverrides({})
    setCategoryOverridesState({})
  }, [setCategoryOverridesState])

  return { overrides, setOverride, removeOverride, clearAll }
}
