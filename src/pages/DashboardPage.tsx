import { useState, useMemo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AlertCircle } from 'lucide-react'

import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { RangeSelector, type DateRange } from '@/components/ui/RangeSelector'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { MonthlyBarChart } from '@/components/dashboard/MonthlyBarChart'
import { BalanceLineChart } from '@/components/dashboard/BalanceLineChart'
import { TopExpenses } from '@/components/dashboard/TopExpenses'
import { SpaarpotjesWidget } from '@/components/dashboard/SpaarpotjesWidget'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDateFrom(range: DateRange): Date | null {
  if (range === 'all') return null
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
}

function buildBarLabel(date: Date, multiYear: boolean): string {
  const mon = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)
  if (!multiYear) return mon
  return `${mon} '${String(date.getFullYear()).slice(2)}`
}

function monthKeyToLabel(key: string): string {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1),
  )
}

function signedFmt(delta: number): string {
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(delta))}`
}

// ─── Skeleton bone ────────────────────────────────────────────────────────────

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-elevated ${className}`} />
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>('3m')
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  const { transactions, excludedIds, loadingState } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      loadingState: s.loadingState,
    })),
  )

  const isLoading = loadingState.status === 'idle' || loadingState.status === 'loading'
  const hasError = loadingState.status === 'error' && loadingState.errors.length > 0

  // ── All non-excluded transactions (unfiltered) ─────────────────────────────
  const allActive = useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )

  // ── Sorted list of 'YYYY-MM' keys that have at least one transaction ────────
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    for (const tx of allActive) {
      const y = tx.date.getFullYear()
      const m = tx.date.getMonth()
      set.add(`${y}-${String(m).padStart(2, '0')}`)
    }
    return [...set].sort()
  }, [allActive])

  // ── Default to the most recent month once data is loaded ──────────────────
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonthKey)) {
      setSelectedMonthKey(availableMonths[availableMonths.length - 1])
    }
  }, [availableMonths, selectedMonthKey])

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
      // spaarpotje-withdrawal: received FROM savings — not real income, skip
      if (tx.amount > 0 && tx.category !== 'spaarpotje-withdrawal') inc += tx.amount
      else if (tx.amount < 0) exp += Math.abs(tx.amount)
    }
    return { totalIncome: inc, totalExpenses: exp, netSavings: inc - exp }
  }, [monthTxns])

  // ── Trend: selected month vs previous available month (skips empty months) ─
  const trend = useMemo(() => {
    const idx = availableMonths.indexOf(selectedMonthKey)
    if (idx <= 0) return null // no previous month available

    const prevKey = availableMonths[idx - 1]
    const [prevY, prevM] = prevKey.split('-').map(Number)

    const prevTxns = allActive.filter(
      (tx) => tx.date.getFullYear() === prevY && tx.date.getMonth() === prevM,
    )

    const sum = (arr: Transaction[], pred: (t: Transaction) => boolean) =>
      arr.filter(pred).reduce((s, t) => s + Math.abs(t.amount), 0)

    const curInc  = sum(monthTxns, (t) => t.amount > 0 && t.category !== 'spaarpotje-withdrawal')
    const prevInc = sum(prevTxns,  (t) => t.amount > 0 && t.category !== 'spaarpotje-withdrawal')
    const curExp  = sum(monthTxns, (t) => t.amount < 0)
    const prevExp = sum(prevTxns,  (t) => t.amount < 0)

    const prevMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(prevY, prevM, 1),
    )

    return {
      prevMonthName,
      income:   { delta: curInc - prevInc,                              formatted: signedFmt(curInc - prevInc) },
      expenses: { delta: curExp - prevExp,                              formatted: signedFmt(curExp - prevExp) },
      net:      { delta: (curInc - curExp) - (prevInc - prevExp),      formatted: signedFmt((curInc - curExp) - (prevInc - prevExp)) },
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
      if (tx.amount > 0 && tx.category !== 'spaarpotje-withdrawal') e.income += tx.amount
      else if (tx.amount < 0) e.expenses += Math.abs(tx.amount)
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
  const { balanceSeries, balanceStartLabel, balanceEndLabel } = useMemo(() => {
    const sorted = [...allActive].sort((a, b) => a.date.getTime() - b.date.getTime())
    const latestByIban = new Map<string, number>()
    const allPoints: { ts: number; balance: number }[] = []

    for (const tx of sorted) {
      latestByIban.set(tx.iban, tx.balanceAfter)
      const combined = [...latestByIban.values()].reduce((s, b) => s + b, 0)
      allPoints.push({ ts: tx.date.getTime(), balance: combined })
    }

    const points = dateFrom
      ? allPoints.filter((p) => p.ts >= dateFrom.getTime())
      : allPoints

    const fmtPoint = (p: { ts: number; balance: number }) => {
      const d = new Date(p.ts)
      const label = new Intl.DateTimeFormat('nl-NL', { month: 'short', year: 'numeric' }).format(d)
      return `${label}  ${formatCurrency(p.balance)}`
    }

    return {
      balanceSeries:     points,
      balanceStartLabel: points.length ? fmtPoint(points[0])                    : '—',
      balanceEndLabel:   points.length ? fmtPoint(points[points.length - 1])    : '—',
    }
  }, [allActive, dateFrom])

  // ── Top 5 counterparties by spend in the selected month ──────────────────
  const topExpenses = useMemo(() => {
    const map = new Map<string, { total: number; categoryId: string }>()
    for (const tx of monthTxns) {
      if (tx.amount >= 0) continue
      const key = tx.counterpartyName || '(unknown)'
      const cur = map.get(key) ?? { total: 0, categoryId: tx.category }
      cur.total += Math.abs(tx.amount)
      map.set(key, cur)
    }
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([counterpartyName, { total, categoryId }]) => ({ counterpartyName, total, categoryId }))
  }, [monthTxns])

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
