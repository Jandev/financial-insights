/**
 * Insight context builder — issue #20.
 *
 * Computes a statistics object from the in-memory transaction store for a
 * given period. No LLM calls — pure arithmetic. The result is passed as
 * context to the LLM in the insights route.
 */

import type { TxSnapshot } from './transactionStore.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsightContext {
  period: string
  periodLabel: string
  totalIncome: number
  totalExpenses: number
  netSavings: number
  savingsRate: number          // % of income saved
  prevPeriodDelta: {
    income: number             // % change vs previous comparable period
    expenses: number
    net: number
  } | null
  topCategories: Array<{
    name: string
    amount: number
    transactionCount: number
    pctOfExpenses: number
    vsLastPeriod: number | null  // % change
  }>
  topMerchants: Array<{ name: string; amount: number; count: number }>
  biggestSingleExpense: { counterparty: string; amount: number; date: string } | null
  biggestSingleIncome: { counterparty: string; amount: number; date: string } | null
  transactionCount: number
  unusualFlags: number         // count of anomaly candidates (passed in separately)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByPeriod(txs: TxSnapshot[], period: string): TxSnapshot[] {
  if (period === 'all-time') return txs
  return txs.filter((tx) => tx.date.startsWith(period))
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / Math.abs(previous)) * 100
}

function prevPeriod(period: string): string | null {
  if (period === 'all-time') return null
  if (/^\d{4}-\d{2}$/.test(period)) {
    // Monthly — go back one month
    const [y, m] = period.split('-').map(Number)
    const prev = new Date(y, m - 2, 1) // m-2 because months are 0-indexed
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  }
  if (/^\d{4}$/.test(period)) {
    return String(parseInt(period, 10) - 1)
  }
  return null
}

function periodLabel(period: string): string {
  if (period === 'all-time') return 'All Time'
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  }
  return period
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildInsightContext(txs: TxSnapshot[], period: string): InsightContext {
  const current = filterByPeriod(txs, period)
  const prev = prevPeriod(period)
  const prevTxs = prev ? filterByPeriod(txs, prev) : []

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalIncome = current.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalExpenses = current.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const netSavings = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // ── Previous period delta ──────────────────────────────────────────────────
  let prevPeriodDelta: InsightContext['prevPeriodDelta'] = null
  if (prevTxs.length > 0) {
    const prevIncome = prevTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const prevExpenses = prevTxs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    const prevNet = prevIncome - prevExpenses
    prevPeriodDelta = {
      income: pctChange(totalIncome, prevIncome),
      expenses: pctChange(totalExpenses, prevExpenses),
      net: pctChange(netSavings, prevNet),
    }
  }

  // ── Top categories ─────────────────────────────────────────────────────────
  const byCategory = new Map<string, { amount: number; count: number }>()
  for (const tx of current.filter((t) => t.amount < 0)) {
    const e = byCategory.get(tx.category) ?? { amount: 0, count: 0 }
    e.amount += Math.abs(tx.amount)
    e.count += 1
    byCategory.set(tx.category, e)
  }

  // Previous period by category for delta
  const prevByCategory = new Map<string, number>()
  for (const tx of prevTxs.filter((t) => t.amount < 0)) {
    prevByCategory.set(tx.category, (prevByCategory.get(tx.category) ?? 0) + Math.abs(tx.amount))
  }

  const topCategories = [...byCategory.entries()]
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 6)
    .map(([name, { amount, count }]) => {
      const prevAmount = prevByCategory.get(name)
      return {
        name,
        amount,
        transactionCount: count,
        pctOfExpenses: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        vsLastPeriod: prevAmount != null ? pctChange(amount, prevAmount) : null,
      }
    })

  // ── Top merchants ──────────────────────────────────────────────────────────
  const byMerchant = new Map<string, { amount: number; count: number }>()
  for (const tx of current.filter((t) => t.amount < 0 && t.counterpartyName)) {
    const e = byMerchant.get(tx.counterpartyName) ?? { amount: 0, count: 0 }
    e.amount += Math.abs(tx.amount)
    e.count += 1
    byMerchant.set(tx.counterpartyName, e)
  }
  const topMerchants = [...byMerchant.entries()]
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 5)
    .map(([name, { amount, count }]) => ({ name, amount, count }))

  // ── Biggest transactions ───────────────────────────────────────────────────
  const expenses = current.filter((t) => t.amount < 0)
  const biggestExpense =
    expenses.length > 0
      ? expenses.reduce((a, b) => (Math.abs(a.amount) > Math.abs(b.amount) ? a : b))
      : null

  const incomes = current.filter((t) => t.amount > 0)
  const biggestIncome =
    incomes.length > 0 ? incomes.reduce((a, b) => (a.amount > b.amount ? a : b)) : null

  return {
    period,
    periodLabel: periodLabel(period),
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    prevPeriodDelta,
    topCategories,
    topMerchants,
    biggestSingleExpense: biggestExpense
      ? { counterparty: biggestExpense.counterpartyName, amount: biggestExpense.amount, date: biggestExpense.date }
      : null,
    biggestSingleIncome: biggestIncome
      ? { counterparty: biggestIncome.counterpartyName, amount: biggestIncome.amount, date: biggestIncome.date }
      : null,
    transactionCount: current.length,
    unusualFlags: 0, // populated by the route if anomaly data is available
  }
}
