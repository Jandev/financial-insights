import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from './useStore'
import {
  DEFAULT_RULES,
  isIncomeTransaction,
  isExpenseTransaction,
  FALLBACK_CATEGORY_COLOR,
  FALLBACK_CATEGORY_ICON,
  applyDefaultNameOverrides,
  type CategoryRule,
} from '@/lib/categories'
import { useDefaultNameOverrides } from '@/hooks/useDefaultNameOverrides'
import { formatMonth } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'
import type { Filters } from './slices/filterSlice'
import type { SavingsAccount } from '@/types/savingsAccount'

// ─── Non-excluded transactions ────────────────────────────────────────────────

/**
 * All transactions that are not in the excluded-IDs set.
 * No filter-bar filters applied — this is raw active data used by pages
 * for month-level KPIs and rolling balance (which are factual, not filtered).
 */
export function useNonExcludedTransactions(): Transaction[] {
  const { transactions, excludedIds } = useStore(
    useShallow((s) => ({ transactions: s.transactions, excludedIds: s.excludedIds })),
  )
  return useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )
}

// ─── Available months ─────────────────────────────────────────────────────────

/**
 * Sorted list of zero-based 'YYYY-MM' keys for which at least one non-excluded
 * transaction exists. Accepts an optional pre-computed transaction list to avoid
 * a second store read when the caller already has it.
 */
export function useAvailableMonths(txns?: Transaction[]): string[] {
  const storeResult = useNonExcludedTransactions()
  const source = txns ?? storeResult
  return useMemo(() => {
    const set = new Set<string>()
    for (const tx of source) {
      const y = tx.date.getFullYear()
      const m = tx.date.getMonth()
      set.add(`${y}-${String(m).padStart(2, '0')}`)
    }
    return [...set].sort()
  }, [source])
}

// ─── Read-only category rule list ─────────────────────────────────────────────

/**
 * Read-only selector for the full active rule list (custom + defaults with
 * name overrides applied). Preferred over `useCategoryRules()` for components
 * that only need to display or filter by rules and do not perform mutations.
 *
 * Reads `categorizationRules` (custom rules only) directly from Zustand —
 * already kept in sync by `useCategoryRules` on every mutation — and
 * composes with `DEFAULT_RULES` + the current name-override map.
 *
 * ISP fix — issue #62 item 2.
 */
export function useCategoryRuleList(): CategoryRule[] {
  const categorizationRules = useStore((s) => s.categorizationRules)
  const { overrides } = useDefaultNameOverrides()
  return useMemo(
    () => [...categorizationRules, ...applyDefaultNameOverrides(DEFAULT_RULES, overrides)],
    [categorizationRules, overrides],
  )
}

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
 *   2. Custom user rule (tx.category matches a user-created rule ID) — wins over AI
 *   3. AI category (from aiCategories overlay) — applied when no manual override or custom rule
 *   4. Rule-based category (tx.category) — fallback
 *
 * Manual overrides are read from the synced Zustand categorization state.
 * Custom rule IDs are the IDs of user-created categorization rules — if a transaction
 * was categorised by one of those rules, AI suggestions should not override it.
 */
function applyAIOverlay(
  tx: Transaction,
  aiCategories: Record<string, { category: string; source: 'llm' | 'rule' }>,
  overrides: Record<string, string>,
  customRuleIds: Set<string>,
): Transaction {
  const aiCat = aiCategories[tx.id]
  if (aiCat?.source === 'llm' && !overrides[tx.id] && !customRuleIds.has(tx.category)) {
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
  const { transactions, excludedIds, filters, aiCategories, categoryOverridesState, categorizationRules } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      filters: s.filters,
      aiCategories: s.aiCategories,
      categoryOverridesState: s.categoryOverridesState,
      categorizationRules: s.categorizationRules,
    })),
  )

  return useMemo(() => {
    const customRuleIds = new Set(categorizationRules.map((r) => r.id))
    return transactions
      .filter((tx) => !excludedIds.has(tx.id))
      .map((tx) => applyAIOverlay(tx, aiCategories, categoryOverridesState, customRuleIds))
      .filter((tx) => matchesFilters(tx, filters))
  }, [transactions, excludedIds, filters, aiCategories, categoryOverridesState, categorizationRules])
}

/**
 * Transactions that pass the active filters, regardless of exclusion.
 * Used by the table (excluded rows are shown at reduced opacity, not hidden).
 * When `filters.showExcluded` is false, excluded rows are hidden entirely.
 * AI category overlay is applied consistently with useActiveTransactions.
 */
export function useFilteredTransactions(): Transaction[] {
  const { transactions, excludedIds, filters, aiCategories, findings, dismissedFindingIds, categoryOverridesState, categorizationRules } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      filters: s.filters,
      aiCategories: s.aiCategories,
      findings: s.findings,
      dismissedFindingIds: s.dismissedFindingIds,
      categoryOverridesState: s.categoryOverridesState,
      categorizationRules: s.categorizationRules,
    })),
  )

  return useMemo(() => {
    const customRuleIds = new Set(categorizationRules.map((r) => r.id))
    // Build active finding ID set once for O(1) lookup
    const activeFlaggedIds = filters.showFlaggedOnly
      ? new Set(findings.filter((f) => !dismissedFindingIds.has(f.transactionId)).map((f) => f.transactionId))
      : null
    return transactions
      .map((tx) => applyAIOverlay(tx, aiCategories, categoryOverridesState, customRuleIds))
      .filter((tx) => {
        if (!matchesFilters(tx, filters)) return false
        if (!filters.showExcluded && excludedIds.has(tx.id)) return false
        if (activeFlaggedIds && !activeFlaggedIds.has(tx.id)) return false
        return true
      })
  }, [transactions, excludedIds, filters, aiCategories, findings, dismissedFindingIds, categoryOverridesState, categorizationRules])
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
      if (isIncomeTransaction(tx)) {
        entry.income += tx.amount
      } else if (isExpenseTransaction(tx)) {
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
  const rules = useCategoryRuleList()

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
        color: m?.color ?? FALLBACK_CATEGORY_COLOR,
        icon: m?.icon ?? FALLBACK_CATEGORY_ICON,
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

// ─── Spaarpotje balance selectors ─────────────────────────────────────────────

export interface SpaarpotjeBalance {
  /** The savings account this balance belongs to */
  account: SavingsAccount
  /**
   * Net savings balance:
   *   +amount for every `spaarpotje` tx (deposit, amount was negative)
   *   -amount for every `spaarpotje-withdrawal` tx (withdrawal, amount was positive)
   *
   * Computed as: -Σ(tx.amount) for all spaarpotje-related transactions with matching tag.
   */
  balance: number
  /** Count of deposit transactions */
  depositCount: number
  /** Count of withdrawal transactions */
  withdrawalCount: number
}

/**
 * Per-spaarpotje balance from tagged transactions.
 *
 * Accepts the list of configured savings accounts so the caller (SettingsPage,
 * DashboardPage) controls which hook provides them — no extra hook coupling here.
 *
 * Uses ALL non-excluded transactions (no date filter — balance is factual).
 */
export function useSpaarpotjeBalances(accounts: SavingsAccount[]): SpaarpotjeBalance[] {
  const { transactions, excludedIds } = useStore(
    useShallow((s) => ({ transactions: s.transactions, excludedIds: s.excludedIds })),
  )

  return useMemo(() => {
    if (!accounts.length) return []

    // Build a map: potName → { balance, depositCount, withdrawalCount }
    const map = new Map<
      string,
      { balance: number; depositCount: number; withdrawalCount: number }
    >(accounts.map((a) => [a.name, { balance: 0, depositCount: 0, withdrawalCount: 0 }]))

    for (const tx of transactions) {
      if (excludedIds.has(tx.id)) continue
      if (
        tx.category !== 'spaarpotje' &&
        tx.category !== 'spaarpotje-withdrawal'
      )
        continue

      const tag = tx.tags?.[0]
      if (!tag || !map.has(tag)) continue

      const entry = map.get(tag)!
      // -amount: deposit (amount < 0) → +balance; withdrawal (amount > 0) → -balance
      entry.balance += -tx.amount
      if (tx.category === 'spaarpotje') entry.depositCount += 1
      else entry.withdrawalCount += 1
    }

    return accounts.map((account) => ({
      account,
      ...(map.get(account.name) ?? { balance: 0, depositCount: 0, withdrawalCount: 0 }),
    }))
  }, [accounts, transactions, excludedIds])
}
