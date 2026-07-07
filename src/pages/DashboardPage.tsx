import { useState, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'

import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { Bone } from '@/components/ui/Bone'
import { RangeSelector, type DateRange } from '@/components/ui/RangeSelector'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { MonthlyBarChart } from '@/components/dashboard/MonthlyBarChart'
import { BalanceLineChart } from '@/components/dashboard/BalanceLineChart'
import { TopExpenses } from '@/components/dashboard/TopExpenses'
import { SpaarpotjesWidget } from '@/components/dashboard/SpaarpotjesWidget'
import { formatCurrency, computeDateFrom, monthKeyToLabel, signedFmt } from '@/lib/utils'
import { isIncomeTransaction, isExpenseTransaction } from '@/lib/categories'
import { useNonExcludedTransactions, useAvailableMonths, useCategoryRuleList } from '@/store/selectors'
import { useDefaultMonth } from '@/hooks/useDefaultMonth'
import { useRollingBalance } from '@/hooks/useRollingBalance'
import type { Transaction } from '@/types/transaction'

// ─── Local helpers ────────────────────────────────────────────────────────────

function buildBarLabel(date: Date, multiYear: boolean): string {
  const mon = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)
  if (!multiYear) return mon
  return `${mon} '${String(date.getFullYear()).slice(2)}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>('3m')
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  const loadingState = useStore((s) => s.loadingState)
  const isLoading = loadingState.status === 'idle' || loadingState.status === 'loading'
  const hasError = loadingState.status === 'error' && loadingState.errors.length > 0

  // ── All non-excluded transactions (unfiltered) ─────────────────────────────
  const allActive = useNonExcludedTransactions()
  const availableMonths = useAvailableMonths(allActive)

  // ── Default to the most recent month once data is loaded ──────────────────
  useDefaultMonth(availableMonths, selectedMonthKey, setSelectedMonthKey)

  // ── Category name lookup for Top Expenses ─────────────────────────────────
  const rules = useCategoryRuleList()

  // ── Transactions for the selected calendar month (KPIs + Top Expenses) ─────
  const monthTxns = useMemo(() => {
    if (!selectedMonthKey) return []
    const [y, m] = selectedMonthKey.split('-').map(Number)
    return allActive.filter(
      (tx) => tx.date.getFullYear() === y && tx.date.getMonth() === m,
    )
  }, [allActive, selectedMonthKey])

  // ── Page-local date window (charts) ───────────────────────────────────────
  const dateFrom = useMemo(() => computeDateFrom(range), [range])

  // ── Transactions within the selected range (charts) ───────────────────────
  const activeTxns = useMemo(
    () => allActive.filter((tx) => !dateFrom || tx.date >= dateFrom),
    [allActive, dateFrom],
  )

  // ── Current balance: sum of latest balanceAfter per IBAN ──────────────────
  const currentBalance = useMemo(() => {
    const latestByIban = new Map<string, number>()
    const sorted = [...allActive].sort((a, b) => a.date.getTime() - b.date.getTime())
    for (const tx of sorted) latestByIban.set(tx.iban, tx.balanceAfter)
    return [...latestByIban.values()].reduce((s, b) => s + b, 0)
  }, [allActive])

  // ── KPI totals for the selected month ────────────────────────────────────
  const { totalIncome, totalExpenses, netSavings } = useMemo(() => {
    let inc = 0
    let exp = 0
    for (const tx of monthTxns) {
      if (isIncomeTransaction(tx)) inc += tx.amount
      else if (isExpenseTransaction(tx)) exp += Math.abs(tx.amount)
    }
    return { totalIncome: inc, totalExpenses: exp, netSavings: inc - exp }
  }, [monthTxns])

  // ── Trend: selected month vs previous available month (skips empty months) ─
  const trend = useMemo(() => {
    const idx = availableMonths.indexOf(selectedMonthKey)
    if (idx <= 0) return null

    const prevKey = availableMonths[idx - 1]
    const [prevY, prevM] = prevKey.split('-').map(Number)

    const prevTxns = allActive.filter(
      (tx) => tx.date.getFullYear() === prevY && tx.date.getMonth() === prevM,
    )

    const sum = (arr: Transaction[], pred: (t: Transaction) => boolean) =>
      arr.filter(pred).reduce((s, t) => s + Math.abs(t.amount), 0)

    const curInc  = sum(monthTxns, isIncomeTransaction)
    const prevInc = sum(prevTxns,  isIncomeTransaction)
    const curExp  = sum(monthTxns, isExpenseTransaction)
    const prevExp = sum(prevTxns,  isExpenseTransaction)

    const prevMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(prevY, prevM, 1),
    )

    return {
      prevMonthName,
      income:   { delta: curInc - prevInc,                         formatted: signedFmt(curInc - prevInc) },
      expenses: { delta: curExp - prevExp,                         formatted: signedFmt(curExp - prevExp) },
      net:      { delta: (curInc - curExp) - (prevInc - prevExp), formatted: signedFmt((curInc - curExp) - (prevInc - prevExp)) },
    }
  }, [availableMonths, selectedMonthKey, monthTxns, allActive])

  // ── Monthly bar chart data (range-scoped) ─────────────────────────────────
  const monthlyBarData = useMemo(() => {
    const map = new Map<string, { year: number; month: number; income: number; expenses: number }>()
    for (const tx of activeTxns) {
      const y = tx.date.getFullYear()
      const m = tx.date.getMonth()
      const key = `${y}-${String(m).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, { year: y, month: m, income: 0, expenses: 0 })
      const e = map.get(key)!
      if (isIncomeTransaction(tx)) e.income += tx.amount
      else if (isExpenseTransaction(tx)) e.expenses += Math.abs(tx.amount)
    }
    const entries = [...map.values()].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    )
    const multiYear = new Set(entries.map((e) => e.year)).size > 1
    return entries.map((e) => ({
      label:    buildBarLabel(new Date(e.year, e.month, 1), multiYear),
      income:   e.income,
      expenses: e.expenses,
    }))
  }, [activeTxns])

  // ── Combined balance series (range-scoped, aggregated across IBANs) ────────
  const { balanceSeries, balanceStartLabel, balanceEndLabel } = useRollingBalance(allActive, dateFrom)

  // ── Top 5 counterparties by spend in the selected month ──────────────────
  const categoryNameById = useMemo(() => {
    return new Map(rules.map((r) => [r.id, r.name]))
  }, [rules])

  const topExpenses = useMemo(() => {
    const map = new Map<string, { total: number; categories: Map<string, number> }>()
    for (const tx of monthTxns) {
      if (tx.amount >= 0) continue
      const key = tx.counterpartyName || '(unknown)'
      const categoryName = categoryNameById.get(tx.category) ?? tx.category
      const cur = map.get(key) ?? { total: 0, categories: new Map<string, number>() }
      cur.total += Math.abs(tx.amount)
      cur.categories.set(categoryName, (cur.categories.get(categoryName) ?? 0) + 1)
      map.set(key, cur)
    }

    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([counterpartyName, { total, categories }]) => {
        let topCategoryName = ''
        let topCount = 0
        for (const [name, count] of categories) {
          if (count > topCount) {
            topCategoryName = name
            topCount = count
          }
        }
        return { counterpartyName, total, categoryName: topCategoryName }
      })
  }, [monthTxns, categoryNameById])

  // ─────────────────────────────────────────────────────────────────────────────

  const selectedMonthLabel = monthKeyToLabel(selectedMonthKey)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        {!isLoading && <RangeSelector value={range} onChange={setRange} />}
      </div>

      {/* Error banner — non-blocking */}
      {hasError && (
        <div className="flex gap-3 rounded-[8px] border border-expense/20 bg-expense-dim px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-expense" strokeWidth={2} />
          <div>
            <p className="text-sm font-medium text-expense">
              {loadingState.errors.length}{' '}
              {loadingState.errors.length === 1 ? 'file' : 'files'} failed to load
            </p>
            <ul className="mt-1 space-y-0.5">
              {loadingState.errors.map((e, i) => (
                <li key={i} className="truncate font-mono text-[11px] text-expense/80">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Month navigator + KPI row */}
      <div className="space-y-3">
        {isLoading ? (
          <Bone className="h-7 w-48" />
        ) : (
          <MonthNavigator
            months={availableMonths}
            selected={selectedMonthKey}
            onChange={setSelectedMonthKey}
          />
        )}

        <div className="grid grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
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
                title="Current Balance"
                value={formatCurrency(currentBalance)}
                subLabel="As of today"
              />
              <KpiCard
                title="Income"
                value={formatCurrency(totalIncome)}
                subLabel={selectedMonthLabel}
                trend={
                  trend
                    ? {
                        delta:          trend.income.delta,
                        deltaFormatted: trend.income.formatted,
                        periodLabel:    `vs ${trend.prevMonthName}`,
                      }
                    : undefined
                }
                positiveIsGood={true}
              />
              <KpiCard
                title="Expenses"
                value={formatCurrency(totalExpenses)}
                subLabel={selectedMonthLabel}
                trend={
                  trend
                    ? {
                        delta:          trend.expenses.delta,
                        deltaFormatted: trend.expenses.formatted,
                        periodLabel:    `vs ${trend.prevMonthName}`,
                      }
                    : undefined
                }
                positiveIsGood={false}
              />
              <KpiCard
                title="Net Savings"
                value={formatCurrency(netSavings)}
                subLabel={selectedMonthLabel}
                trend={
                  trend
                    ? {
                        delta:          trend.net.delta,
                        deltaFormatted: trend.net.formatted,
                        periodLabel:    `vs ${trend.prevMonthName}`,
                      }
                    : undefined
                }
                positiveIsGood={true}
              />
            </>
          )}
        </div>
      </div>

      {/* Spaarpotjes per-goal balances (only rendered when pots are configured) */}
      {!isLoading && <SpaarpotjesWidget />}

      {/* Main row: bar chart (range) + top expenses (month) */}
      <div className="grid grid-cols-[1fr_280px] gap-4">
        <Card padding="lg">
          {isLoading ? (
            <div className="space-y-3">
              <Bone className="h-4 w-48" />
              <Bone className="h-[240px] w-full" />
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-sm font-semibold text-text-primary">
                Monthly Income vs Expenses
              </h2>
              <MonthlyBarChart data={monthlyBarData} />
            </>
          )}
        </Card>

        <Card padding="lg">
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-12" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Bone className="h-3 w-24" />
                    <Bone className="h-2.5 w-16" />
                  </div>
                  <Bone className="h-3 w-14" />
                </div>
              ))}
            </div>
          ) : (
            <TopExpenses entries={topExpenses} />
          )}
        </Card>
      </div>

      {/* Running balance line chart (range-scoped) */}
      <Card padding="lg">
        {isLoading ? (
          <div className="space-y-3">
            <Bone className="h-4 w-36" />
            <Bone className="h-[160px] w-full" />
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-text-primary">Running Balance</h2>
            <BalanceLineChart
              data={balanceSeries}
              startLabel={balanceStartLabel}
              endLabel={balanceEndLabel}
            />
          </>
        )}
      </Card>
    </div>
  )
}
