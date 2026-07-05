import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from './useStore'
import { DEFAULT_RULES, readOverridesFromStorage, type CategoryRule } from '@/lib/categories'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { formatMonth } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'
import type { Filters } from './slices/filterSlice'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyTotal {
  year: number
  month: number
  /** Formatted label, e.g. "juni 2024" */
  label: string
  income: number
  expenses: number
  net: number
}

export interface CategoryTotal {
  categoryId: string
  /** Display name from rules (falls back to categoryId) */
  name: string
  /** Hex color from rules (falls back to #8E8E93) */
  color: string
  /** Lucide icon name from rules (falls back to 'HelpCircle') */
  icon: string
  /** Sum of absolute amounts for active transactions in this category */
  total: number
  count: number
  /** Percentage of total absolute spend across all categories */
  percentage: number
}

export interface BalancePoint {
  date: Date
  balance: number
}

export interface BalanceSeries {
  iban: string
  points: BalancePoint[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Test whether a transaction satisfies the active filters.
 * Exported so pages can use it independently (e.g. for stats rows).
 */
export function matchesFilters(tx: Transaction, filters: Filters): boolean {
  if (filters.search) {
    const q = filters.search.toLowerCase()
    const inName = tx.counterpartyName.toLowerCase().includes(q)
    const inDesc = tx.description.toLowerCase().includes(q)
    if (!inName && !inDesc) return false
  }

  if (filters.dateFrom && tx.date < filters.dateFrom) return false
  if (filters.dateTo && tx.date > filters.dateTo) return false

  if (filters.categories.length > 0 && !filters.categories.includes(tx.category)) return false

  if (
    filters.transactionCodes.length > 0 &&
    !filters.transactionCodes.includes(tx.transactionCode)
  )
    return false

  if (filters.amountMin !== null && Math.abs(tx.amount) < filters.amountMin) return false
  if (filters.amountMax !== null && Math.abs(tx.amount) > filters.amountMax) return false

  return true
}

/** Build a lookup map from categoryId → rule metadata. Covers custom + default rules. */
function buildCategoryMeta(rules: CategoryRule[]): Map<string, { name: string; color: string; icon: string }> {
  return new Map(rules.map((r) => [r.id, { name: r.name, color: r.color, icon: r.icon }]))
}

/**
 * Apply the AI category overlay to a transaction.
 *
 * Priority order:
 *   1. Manual override (already baked into tx.category via recategorize()) — wins
 *   2. AI category (from aiCategories overlay) — applied when no manual override
 *   3. Rule-based category (tx.category) — fallback
 *
 * Manual overrides are detected by reading categoryOverrides from localStorage.
 * This is synchronous and cheap. Reactivity is ensured because recategorize()
 * always triggers a store update → useMemo dependency changes → fresh read.
 */
function applyAIOverlay(
  tx: Transaction,
  aiCategories: Record<string, { category: string; source: 'llm' | 'rule' }>,
  overrides: Record<string, string>,
): Transaction {
  const aiCat = aiCategories[tx.id]
  if (aiCat?.source === 'llm' && !overrides[tx.id]) {
    return { ...tx, category: aiCat.category }
  }
  return tx
}

// ─── Derived selector hooks ───────────────────────────────────────────────────

/**
 * Transactions that pass the active filters AND are not excluded.
 * AI category overlay is applied: aiCategories[tx.id] overrides tx.category
 * unless the transaction has a manual category override.
 * Used by charts and KPI cards.
 */
export function useActiveTransactions(): Transaction[] {
  const { transactions, excludedIds, filters, aiCategories } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      filters: s.filters,
      aiCategories: s.aiCategories,
    })),
  )

  return useMemo(() => {
    const overrides = readOverridesFromStorage()
    return transactions
      .filter((tx) => !excludedIds.has(tx.id))
      .map((tx) => applyAIOverlay(tx, aiCategories, overrides))
      .filter((tx) => matchesFilters(tx, filters))
  }, [transactions, excludedIds, filters, aiCategories])
}

/**
 * Transactions that pass the active filters, regardless of exclusion.
 * Used by the table (excluded rows are shown at reduced opacity, not hidden).
 * When `filters.showExcluded` is false, excluded rows are hidden entirely.
 * AI category overlay is applied consistently with useActiveTransactions.
 */
export function useFilteredTransactions(): Transaction[] {
  const { transactions, excludedIds, filters, aiCategories, findings, dismissedFindingIds } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      filters: s.filters,
      aiCategories: s.aiCategories,
      findings: s.findings,
      dismissedFindingIds: s.dismissedFindingIds,
    })),
  )

  return useMemo(() => {
    const overrides = readOverridesFromStorage()
    // Build active finding ID set once for O(1) lookup
    const activeFlaggedIds = filters.showFlaggedOnly
      ? new Set(findings.filter((f) => !dismissedFindingIds.has(f.transactionId)).map((f) => f.transactionId))
      : null
    return transactions
      .map((tx) => applyAIOverlay(tx, aiCategories, overrides))
      .filter((tx) => {
        if (!matchesFilters(tx, filters)) return false
        if (!filters.showExcluded && excludedIds.has(tx.id)) return false
        if (activeFlaggedIds && !activeFlaggedIds.has(tx.id)) return false
        return true
      })
  }, [transactions, excludedIds, filters, aiCategories, findings, dismissedFindingIds])
}

/** Number of currently excluded transactions. */
export function useExcludedCount(): number {
  return useStore((s) => s.excludedIds.size)
}

/**
 * Active transactions grouped by year + month, ordered chronologically.
 * Each entry sums income (amount > 0) and expenses (amount < 0) separately.
 */
export function useMonthlyTotals(): MonthlyTotal[] {
  const active = useActiveTransactions()

  return useMemo(() => {
    const map = new Map<string, MonthlyTotal>()

    for (const tx of active) {
      const year = tx.date.getFullYear()
      const month = tx.date.getMonth()
      const key = `${year}-${String(month).padStart(2, '0')}`

      if (!map.has(key)) {
        map.set(key, {
          year,
          month,
          label: formatMonth(new Date(year, month, 1)),
          income: 0,
          expenses: 0,
          net: 0,
        })
      }

      const entry = map.get(key)!
      if (tx.amount > 0) {
        entry.income += tx.amount
      } else {
        entry.expenses += tx.amount
      }
      entry.net += tx.amount
    }

    return [...map.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    )
  }, [active])
}

/**
 * Active transactions grouped by category, sorted descending by total spend.
 * Enriched with name / color / icon from the full ruleset (custom + default).
 * `percentage` is relative to the sum of ALL category totals.
 */
export function useCategoryTotals(): CategoryTotal[] {
  const active = useActiveTransactions()
  const { rules } = useCategoryRules()

  return useMemo(() => {
    const meta = buildCategoryMeta(rules)
    const map = new Map<string, { total: number; count: number }>()

    for (const tx of active) {
      const existing = map.get(tx.category) ?? { total: 0, count: 0 }
      existing.total += Math.abs(tx.amount)
      existing.count += 1
      map.set(tx.category, existing)
    }

    const grandTotal = [...map.values()].reduce((s, v) => s + v.total, 0)

    const totals: CategoryTotal[] = [...map.entries()].map(([categoryId, { total, count }]) => {
      const m = meta.get(categoryId)
      return {
        categoryId,
        name: m?.name ?? categoryId,
        color: m?.color ?? '#8E8E93',
        icon: m?.icon ?? 'HelpCircle',
        total,
        count,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }
    })

    return totals.sort((a, b) => b.total - a.total)
  }, [active, rules])
}

/**
 * Balance-after-transaction series, one per IBAN, ordered chronologically.
 * Uses ALL non-excluded transactions (ignoring filters — balance is factual,
 * not a filtered view).
 */
export function useBalanceSeries(): BalanceSeries[] {
  const { transactions, excludedIds } = useStore(
    useShallow((s) => ({ transactions: s.transactions, excludedIds: s.excludedIds })),
  )

  return useMemo(() => {
    const byIban = new Map<string, BalancePoint[]>()

    const sorted = [...transactions]
      .filter((tx) => !excludedIds.has(tx.id))
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    for (const tx of sorted) {
      const points = byIban.get(tx.iban) ?? []
      points.push({ date: tx.date, balance: tx.balanceAfter })
      byIban.set(tx.iban, points)
    }

    return [...byIban.entries()].map(([iban, points]) => ({ iban, points }))
  }, [transactions, excludedIds])
}

// Keep DEFAULT_RULES re-exported for any consumers that still reference it
export { DEFAULT_RULES }
