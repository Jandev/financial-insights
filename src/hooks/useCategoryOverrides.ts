import { useCallback } from 'react'
import { type CategoryOverrides } from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'
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
 * Manage per-transaction manual category overrides with server persistence.
 *
 * Overrides live in Zustand (`categoryOverridesState`) and are synced to
 * the server via debounced PUT /api/state/categories (500 ms window).
 * AI-assigned categories (issue #18) are stored separately in `aiCategories`.
 *
 * Override wins over rules. If a user later edits the rules, a transaction with
 * an override keeps its manually assigned category until the override is removed.
 */
export function useCategoryOverrides(): UseCategoryOverridesResult {
  const overrides = useStore((s) => s.categoryOverridesState)
  const setCategoryOverridesState = useStore((s) => s.setCategoryOverridesState)
  const recategorize = useStore((s) => s.recategorize)

  const setOverride = useCallback((txId: string, categoryId: string) => {
    const updated = { ...overrides, [txId]: categoryId }
    setCategoryOverridesState(updated)
    debouncePut('categories', updated)
    recategorize()
  }, [overrides, setCategoryOverridesState, recategorize])

  const removeOverride = useCallback((txId: string) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, txId)) return
    const updated = { ...overrides }
    delete updated[txId]
    setCategoryOverridesState(updated)
    debouncePut('categories', updated)
    recategorize()
  }, [overrides, setCategoryOverridesState, recategorize])

  const clearAll = useCallback(() => {
    setCategoryOverridesState({})
    debouncePut('categories', {})
    recategorize()
  }, [setCategoryOverridesState, recategorize])

  return { overrides, setOverride, removeOverride, clearAll }
}

