import { useState, useMemo, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store'
import { signedFmt, monthKeyToLabel } from '@/lib/utils'
import { isIncomeTransaction, isExpenseTransaction, FALLBACK_CATEGORY_COLOR, type CategoryRule } from '@/lib/categories'
import { useAvailableMonths, useCategoryRuleList } from '@/store/selectors'
import { useDefaultMonth } from '@/hooks/useDefaultMonth'
import type { Transaction } from '@/types/transaction'
import type { MonthlyCategoryTotal } from '@/types/monthly'
import type { ActiveFilter } from '@/components/monthly/MonthlyTransactionList'

function pctFmt(value: number, prev: number): string {
  if (prev === 0) return '—'
  const pct = ((value - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

export function keyToIsoPeriod(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function buildCategoryTotals(txns: Transaction[], rules: CategoryRule[]): MonthlyCategoryTotal[] {
  const meta = new Map(rules.map((rule) => [rule.id, { name: rule.name, color: rule.color }]))
  const map = new Map<string, Omit<MonthlyCategoryTotal, 'percentage'>>()

  for (const tx of txns) {
    const ruleMeta = meta.get(tx.category)
    const groupKey = ruleMeta?.name ?? tx.category
    const existing = map.get(groupKey)
    if (existing) {
      existing.total += Math.abs(tx.amount)
      if (!existing.categoryIds.includes(tx.category)) existing.categoryIds.push(tx.category)
      continue
    }

    map.set(groupKey, {
      groupKey,
      categoryIds: [tx.category],
      name: groupKey,
      color: ruleMeta?.color ?? FALLBACK_CATEGORY_COLOR,
      total: Math.abs(tx.amount),
    })
  }

  const grandTotal = [...map.values()].reduce((sum, value) => sum + value.total, 0)

  return [...map.values()]
    .map((group) => ({
      ...group,
      percentage: grandTotal > 0 ? (group.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

export interface MonthlyBreakdown {
  isLoading: boolean
  isEmpty: boolean
  availableMonths: string[]
  selectedMonthKey: string
  monthLabel: string
  periodIso: string
  totalIncome: number
  totalExpenses: number
  netSavings: number
  prevTotals: {
    prevMonthName: string
    income: number
    expenses: number
    net: number
  } | null
  incomeCategoryTotals: MonthlyCategoryTotal[]
  expenseCategoryTotals: MonthlyCategoryTotal[]
  incomeSelectedKey: string | null
  expenseSelectedKey: string | null
  activeFilter: ActiveFilter | null
  allMonthTxns: Transaction[]
  excludedIds: Set<string>
  handleMonthChange: (key: string) => void
  handleIncomeSelect: (groupKey: string | null) => void
  handleExpenseSelect: (groupKey: string | null) => void
  clearActiveFilter: () => void
  signedFmt: (delta: number) => string
  pctFmt: (value: number, prev: number) => string
}

export function useMonthlyBreakdown(): MonthlyBreakdown {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null)

  const { transactions, excludedIds, loadingState, aiCategories, categoryOverridesState } = useStore(
    useShallow((s) => ({
      transactions: s.transactions,
      excludedIds: s.excludedIds,
      loadingState: s.loadingState,
      aiCategories: s.aiCategories,
      categoryOverridesState: s.categoryOverridesState,
    })),
  )

  const rules = useCategoryRuleList()

  const isLoading = loadingState.status === 'idle' || loadingState.status === 'loading'

  const allActive = useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )

  const availableMonths = useAvailableMonths(allActive)

  useDefaultMonth(availableMonths, selectedMonthKey, setSelectedMonthKey)

  const handleMonthChange = useCallback((key: string) => {
    setSelectedMonthKey(key)
    setActiveFilter(null)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tagName = (e.target as HTMLElement)?.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

      setSelectedMonthKey((previous) => {
        const idx = availableMonths.indexOf(previous)
        if (idx === -1) return previous
        if (e.key === 'ArrowLeft' && idx > 0) return availableMonths[idx - 1]
        if (e.key === 'ArrowRight' && idx < availableMonths.length - 1) return availableMonths[idx + 1]
        return previous
      })
      setActiveFilter(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [availableMonths])

  const allMonthTxns = useMemo(() => {
    if (!selectedMonthKey) return []
    const [year, month] = selectedMonthKey.split('-').map(Number)
    return transactions.filter((tx) => tx.date.getFullYear() === year && tx.date.getMonth() === month)
  }, [transactions, selectedMonthKey])

  const monthTxns = useMemo(
    () => allMonthTxns.filter((tx) => !excludedIds.has(tx.id)),
    [allMonthTxns, excludedIds],
  )

  const effectiveMonthTxns = useMemo(() => {
    return monthTxns.map((tx) => {
      const aiCat = aiCategories[tx.id]
      if (aiCat?.source === 'llm' && !categoryOverridesState[tx.id]) {
        return { ...tx, category: aiCat.category }
      }
      return tx
    })
  }, [monthTxns, aiCategories, categoryOverridesState])

  const incomeTxns = useMemo(() => effectiveMonthTxns.filter(isIncomeTransaction), [effectiveMonthTxns])
  const expenseTxns = useMemo(() => effectiveMonthTxns.filter(isExpenseTransaction), [effectiveMonthTxns])

  const totalIncome = useMemo(() => incomeTxns.reduce((sum, tx) => sum + tx.amount, 0), [incomeTxns])
  const totalExpenses = useMemo(() => expenseTxns.reduce((sum, tx) => sum + Math.abs(tx.amount), 0), [expenseTxns])
  const netSavings = totalIncome - totalExpenses

  const prevTotals = useMemo(() => {
    const idx = availableMonths.indexOf(selectedMonthKey)
    if (idx <= 0) return null

    const prevKey = availableMonths[idx - 1]
    const [prevYear, prevMonth] = prevKey.split('-').map(Number)
    const prevTxns = allActive.filter(
      (tx) => tx.date.getFullYear() === prevYear && tx.date.getMonth() === prevMonth,
    )

    const prevIncome = prevTxns.filter(isIncomeTransaction).reduce((sum, tx) => sum + tx.amount, 0)
    const prevExpenses = prevTxns.filter(isExpenseTransaction).reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

    return {
      prevMonthName: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
        new Date(prevYear, prevMonth, 1),
      ),
      income: prevIncome,
      expenses: prevExpenses,
      net: prevIncome - prevExpenses,
    }
  }, [availableMonths, selectedMonthKey, allActive])

  const incomeCategoryTotals = useMemo(() => buildCategoryTotals(incomeTxns, rules), [incomeTxns, rules])
  const expenseCategoryTotals = useMemo(() => buildCategoryTotals(expenseTxns, rules), [expenseTxns, rules])

  const incomeSelectedKey = activeFilter?.type === 'income' ? activeFilter.groupKey : null
  const expenseSelectedKey = activeFilter?.type === 'expense' ? activeFilter.groupKey : null

  const handleIncomeSelect = useCallback((groupKey: string | null) => {
    if (!groupKey) {
      setActiveFilter(null)
      return
    }

    const selected = incomeCategoryTotals.find((category) => category.groupKey === groupKey)
    if (!selected) {
      setActiveFilter(null)
      return
    }

    setActiveFilter({
      groupKey: selected.groupKey,
      categoryIds: selected.categoryIds,
      type: 'income',
    })
  }, [incomeCategoryTotals])

  const handleExpenseSelect = useCallback((groupKey: string | null) => {
    if (!groupKey) {
      setActiveFilter(null)
      return
    }

    const selected = expenseCategoryTotals.find((category) => category.groupKey === groupKey)
    if (!selected) {
      setActiveFilter(null)
      return
    }

    setActiveFilter({
      groupKey: selected.groupKey,
      categoryIds: selected.categoryIds,
      type: 'expense',
    })
  }, [expenseCategoryTotals])

  return {
    isLoading,
    isEmpty: monthTxns.length === 0 && !isLoading,
    availableMonths,
    selectedMonthKey,
    monthLabel: monthKeyToLabel(selectedMonthKey),
    periodIso: selectedMonthKey ? keyToIsoPeriod(selectedMonthKey) : '',
    totalIncome,
    totalExpenses,
    netSavings,
    prevTotals,
    incomeCategoryTotals,
    expenseCategoryTotals,
    incomeSelectedKey,
    expenseSelectedKey,
    activeFilter,
    allMonthTxns,
    excludedIds,
    handleMonthChange,
    handleIncomeSelect,
    handleExpenseSelect,
    clearActiveFilter: () => setActiveFilter(null),
    signedFmt,
    pctFmt,
  }
}
