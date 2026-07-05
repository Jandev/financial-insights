import { useState, useMemo, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CategoryDonut, type DonutSlice } from '@/components/monthly/CategoryDonut'
import { CategoryBarList, type BarListItem } from '@/components/monthly/CategoryBarList'
import {
  MonthlyTransactionList,
  type ActiveFilter,
} from '@/components/monthly/MonthlyTransactionList'
import { DEFAULT_RULES, isIncomeTransaction, isExpenseTransaction } from '@/lib/categories'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signedFmt(delta: number): string {
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(delta))}`
}

function pctFmt(value: number, prev: number): string {
  if (prev === 0) return '—'
  const pct = ((value - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

function monthKeyToLabel(key: string): string {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1),
  )
}

function monthKeyToShortLabel(key: string): string {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(y, m, 1))
}

/** Build category breakdown totals from a list of transactions. */
function buildCategoryTotals(txns: Transaction[]): {
  categoryId: string
  name: string
  color: string
  total: number
  percentage: number
}[] {
  const meta = new Map(DEFAULT_RULES.map((r) => [r.id, { name: r.name, color: r.color }]))
  const map = new Map<string, number>()

  for (const tx of txns) {
    map.set(tx.category, (map.get(tx.category) ?? 0) + Math.abs(tx.amount))
  }

  const grandTotal = [...map.values()].reduce((s, v) => s + v, 0)

  return [...map.entries()]
    .map(([categoryId, total]) => {
      const m = meta.get(categoryId)
      return {
        categoryId,
        name: m?.name ?? categoryId,
        color: m?.color ?? '#8E8E93',
        total,
        percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

// ─── Skeleton bone ────────────────────────────────────────────────────────────

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-elevated ${className}`} />
}

// ─── Trend delta row (Month at a Glance) ─────────────────────────────────────

interface DeltaRowProps {
  label: string
  current: number
  previous: number
  /** When false: a lower value is "good" (expenses) */
  positiveIsGood?: boolean
}

function DeltaRow({ label, current, previous, positiveIsGood = true }: DeltaRowProps) {
  const delta = current - previous
  const isUp = delta > 0
  const isNeutral = delta === 0
  const isGood = isNeutral ? null : positiveIsGood ? isUp : !isUp
  const Icon = isNeutral ? Minus : isUp ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            'h-3 w-3 shrink-0',
            isGood === true && 'text-income',
            isGood === false && 'text-expense',
            isGood === null && 'text-text-muted',
          )}
          strokeWidth={2}
        />
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            isGood === true && 'text-income',
            isGood === false && 'text-expense',
            isGood === null && 'text-text-muted',
          )}
        >
          {signedFmt(delta)}
        </span>
        <span
          className={cn(
            'rounded px-1 py-0.5 text-[10px] font-medium tabular-nums',
            isGood === true && 'bg-income/10 text-income',
            isGood === false && 'bg-expense/10 text-expense',
            isGood === null && 'bg-bg-elevated text-text-muted',
          )}
        >
          {pctFmt(current, previous)}
        </span>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthlyPage() {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null)

  const { transactions, excludedIds, loadingState } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      loadingState: s.loadingState,
    })),
  )

  const isLoading = loadingState.status === 'idle' || loadingState.status === 'loading'

  // ── All non-excluded transactions (no global filters) ─────────────────────
  const allActive = useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )

  // ── Sorted 'YYYY-MM' keys with at least one transaction ──────────────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    for (const tx of allActive) {
      const y = tx.date.getFullYear()
      const m = tx.date.getMonth()
      set.add(`${y}-${String(m).padStart(2, '0')}`)
    }
    return [...set].sort()
  }, [allActive])

  // ── Default to most recent month once data loads ──────────────────────────
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonthKey)) {
      setSelectedMonthKey(availableMonths[availableMonths.length - 1])
    }
  }, [availableMonths, selectedMonthKey])

  // ── Reset category filter on month change ─────────────────────────────────
  const handleMonthChange = useCallback((key: string) => {
    setSelectedMonthKey(key)
    setActiveFilter(null)
  }, [])

  // ── Keyboard ← / → navigation ────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

      setSelectedMonthKey((prev) => {
        const idx = availableMonths.indexOf(prev)
        if (idx === -1) return prev
        if (e.key === 'ArrowLeft' && idx > 0) return availableMonths[idx - 1]
        if (e.key === 'ArrowRight' && idx < availableMonths.length - 1)
          return availableMonths[idx + 1]
        return prev
      })
      setActiveFilter(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [availableMonths])

  // ── All transactions for selected month (include excluded — list shows them) ─
  const allMonthTxns = useMemo(() => {
    if (!selectedMonthKey) return []
    const [y, m] = selectedMonthKey.split('-').map(Number)
    return transactions.filter(
      (tx) => tx.date.getFullYear() === y && tx.date.getMonth() === m,
    )
  }, [transactions, selectedMonthKey])

  // ── Non-excluded transactions for selected month (KPIs + charts) ──────────
  const monthTxns = useMemo(
    () => allMonthTxns.filter((tx) => !excludedIds.has(tx.id)),
    [allMonthTxns, excludedIds],
  )

  const incomeTxns = useMemo(
    // Spaarpotje deposits/withdrawals are excluded — not real income/expense
    () => monthTxns.filter(isIncomeTransaction),
    [monthTxns],
  )
  const expenseTxns = useMemo(() => monthTxns.filter(isExpenseTransaction), [monthTxns])

  // ── KPI totals ────────────────────────────────────────────────────────────
  const totalIncome = useMemo(
    () => incomeTxns.reduce((s, tx) => s + tx.amount, 0),
    [incomeTxns],
  )
  const totalExpenses = useMemo(
    () => expenseTxns.reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [expenseTxns],
  )
  const netSavings = totalIncome - totalExpenses

  // ── Previous month totals (for trend) ────────────────────────────────────
  const prevTotals = useMemo(() => {
    const idx = availableMonths.indexOf(selectedMonthKey)
    if (idx <= 0) return null
    const prevKey = availableMonths[idx - 1]
    const [py, pm] = prevKey.split('-').map(Number)
    const prevTxns = allActive.filter(
      (tx) => tx.date.getFullYear() === py && tx.date.getMonth() === pm,
    )
    const prevInc = prevTxns
      .filter(isIncomeTransaction)
      .reduce((s, t) => s + t.amount, 0)
    const prevExp = prevTxns
      .filter(isExpenseTransaction)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    return {
      prevMonthName: monthKeyToShortLabel(prevKey),
      income: prevInc,
      expenses: prevExp,
      net: prevInc - prevExp,
    }
  }, [availableMonths, selectedMonthKey, allActive])

  // ── Category totals for pie charts + bar lists ────────────────────────────
  const incomeCategoryTotals = useMemo(
    () => buildCategoryTotals(incomeTxns),
    [incomeTxns],
  )
  const expenseCategoryTotals = useMemo(
    () => buildCategoryTotals(expenseTxns),
    [expenseTxns],
  )

  // ── Donut slice helpers ───────────────────────────────────────────────────
  const incomeSlices = useMemo<DonutSlice[]>(
    () =>
      incomeCategoryTotals.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        total: c.total,
        percentage: c.percentage,
      })),
    [incomeCategoryTotals],
  )
  const expenseSlices = useMemo<DonutSlice[]>(
    () =>
      expenseCategoryTotals.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        total: c.total,
        percentage: c.percentage,
      })),
    [expenseCategoryTotals],
  )

  const incomeBarItems = useMemo<BarListItem[]>(
    () =>
      incomeCategoryTotals.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        total: c.total,
        percentage: c.percentage,
      })),
    [incomeCategoryTotals],
  )
  const expenseBarItems = useMemo<BarListItem[]>(
    () =>
      expenseCategoryTotals.map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        total: c.total,
        percentage: c.percentage,
      })),
    [expenseCategoryTotals],
  )

  // ── Active filter helpers ─────────────────────────────────────────────────
  const incomeSelectedId =
    activeFilter?.type === 'income' ? activeFilter.categoryId : null
  const expenseSelectedId =
    activeFilter?.type === 'expense' ? activeFilter.categoryId : null

  function handleIncomeSelect(id: string | null) {
    setActiveFilter(id ? { categoryId: id, type: 'income' } : null)
  }
  function handleExpenseSelect(id: string | null) {
    setActiveFilter(id ? { categoryId: id, type: 'expense' } : null)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const isEmpty = monthTxns.length === 0 && !isLoading

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Monthly Overview</h1>
        {!isLoading && availableMonths.length > 0 && (
          <MonthNavigator
            months={availableMonths}
            selected={selectedMonthKey}
            onChange={handleMonthChange}
          />
        )}
        {isLoading && <Bone className="h-7 w-40" />}
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} padding="md">
              <div className="mb-2 flex items-start justify-between">
                <Bone className="h-3 w-20" />
                <Bone className="h-4 w-4 rounded" />
              </div>
              <Bone className="mt-1 h-7 w-28" />
              <Bone className="mt-2 h-2.5 w-16" />
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Income"
              value={formatCurrency(totalIncome)}
              subLabel={monthKeyToLabel(selectedMonthKey)}
              trend={
                prevTotals
                  ? {
                      delta: totalIncome - prevTotals.income,
                      deltaFormatted: signedFmt(totalIncome - prevTotals.income),
                      periodLabel: `vs ${prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={true}
            />
            <KpiCard
              title="Total Expenses"
              value={formatCurrency(totalExpenses)}
              subLabel={monthKeyToLabel(selectedMonthKey)}
              trend={
                prevTotals
                  ? {
                      delta: totalExpenses - prevTotals.expenses,
                      deltaFormatted: signedFmt(totalExpenses - prevTotals.expenses),
                      periodLabel: `vs ${prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={false}
            />
            <KpiCard
              title="Net Savings"
              value={formatCurrency(netSavings)}
              subLabel={monthKeyToLabel(selectedMonthKey)}
              trend={
                prevTotals
                  ? {
                      delta: netSavings - prevTotals.net,
                      deltaFormatted: signedFmt(netSavings - prevTotals.net),
                      periodLabel: `vs ${prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={true}
            />
          </>
        )}
      </div>

      {/* ── Category section + Month at a Glance ────────────────────────────── */}
      <div className="grid grid-cols-[1fr_260px] gap-4">
        {/* Main card: two donuts + two bar lists */}
        <Card padding="lg">
          {isLoading ? (
            <div className="space-y-4">
              <Bone className="h-4 w-40" />
              <div className="grid grid-cols-2 gap-6">
                <Bone className="h-[180px] w-full rounded-full" />
                <Bone className="h-[180px] w-full rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Bone key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-text-muted">No transactions this month</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  Spending by Category
                </h2>
                <span className="text-xs text-text-muted">
                  {monthKeyToLabel(selectedMonthKey)}
                  {totalExpenses > 0 && (
                    <> · {formatCurrency(totalExpenses)} total</>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* ── Income column ── */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-text-secondary">Income</p>
                  <CategoryDonut
                    slices={incomeSlices}
                    centerTotal={totalIncome}
                    centerLabel="Income"
                    selectedId={incomeSelectedId}
                    onSelect={handleIncomeSelect}
                  />
                  <CategoryBarList
                    items={incomeBarItems}
                    selectedId={incomeSelectedId}
                    onSelect={handleIncomeSelect}
                  />
                </div>

                {/* ── Expenses column ── */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-text-secondary">Expenses</p>
                  <CategoryDonut
                    slices={expenseSlices}
                    centerTotal={totalExpenses}
                    centerLabel="Expenses"
                    selectedId={expenseSelectedId}
                    onSelect={handleExpenseSelect}
                  />
                  <CategoryBarList
                    items={expenseBarItems}
                    selectedId={expenseSelectedId}
                    onSelect={handleExpenseSelect}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Month at a Glance sidebar */}
        <Card padding="lg">
          {isLoading ? (
            <div className="space-y-3">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-20" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                Month at a Glance
              </h2>

              {prevTotals ? (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    vs {prevTotals.prevMonthName}
                  </p>
                  <div className="divide-y divide-border">
                    <DeltaRow
                      label="Income"
                      current={totalIncome}
                      previous={prevTotals.income}
                      positiveIsGood={true}
                    />
                    <DeltaRow
                      label="Expenses"
                      current={totalExpenses}
                      previous={prevTotals.expenses}
                      positiveIsGood={false}
                    />
                    <DeltaRow
                      label="Savings"
                      current={netSavings}
                      previous={prevTotals.net}
                      positiveIsGood={true}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  No previous month to compare.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ── Transaction list ────────────────────────────────────────────────── */}
      <Card padding="lg">
        {isLoading ? (
          <div className="space-y-3">
            <Bone className="h-4 w-48" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Bone className="h-3 w-16" />
                <Bone className="h-3 flex-1" />
                <Bone className="h-5 w-20" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Transactions
                {activeFilter && (
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    — filtered by category
                  </span>
                )}
              </h2>
              {activeFilter && (
                <button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className="text-xs text-accent hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <MonthlyTransactionList
              transactions={allMonthTxns}
              excludedIds={excludedIds}
              activeFilter={activeFilter}
            />
          </>
        )}
      </Card>
    </div>
  )
}
