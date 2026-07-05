import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useActiveTransactions } from '@/store/selectors'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { useStore } from '@/store'
import type { CategoryRule } from '@/lib/categories'
import type { CategoryTotal } from '@/store/selectors'
import { CategoryBarChart } from '@/components/categories/CategoryBarChart'
import { DrilldownPanel } from '@/components/categories/DrilldownPanel'
import { RuleEditor } from '@/components/categories/RuleEditor'
import { AICategorizeButton } from '@/components/ai/AICategorizeButton'
import { MonthNavigator } from '@/components/ui/MonthNavigator'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthKeyToLabel(key: string): string {
  if (!key) return ''
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1),
  )
}

function buildCategoryTotals(
  transactions: ReturnType<typeof useActiveTransactions>,
  rules: CategoryRule[],
): CategoryTotal[] {
  const meta = new Map(rules.map((r) => [r.id, { name: r.name, color: r.color, icon: r.icon }]))
  const map = new Map<string, { total: number; count: number }>()

  for (const tx of transactions) {
    const entry = map.get(tx.category) ?? { total: 0, count: 0 }
    entry.total += Math.abs(tx.amount)
    entry.count += 1
    map.set(tx.category, entry)
  }

  const grandTotal = [...map.values()].reduce((s, v) => s + v.total, 0)

  return [...map.entries()]
    .map(([categoryId, { total, count }]) => {
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
    .sort((a, b) => b.total - a.total)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoriesPage() {
  const active = useActiveTransactions()
  const { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults } =
    useCategoryRules()
  const recategorize = useStore((s) => s.recategorize)
  const aiCategories = useStore((s) => s.aiCategories)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAIOnly, setShowAIOnly] = useState(false)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  // Derive sorted list of months (YYYY-MM, 0-indexed) that have data
  const months = useMemo(() => {
    const keys = new Set(
      active.map((tx) => {
        const d = new Date(tx.date)
        return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      }),
    )
    return [...keys].sort()
  }, [active])

  // Default to most recent month with data; re-sync if transactions load later
  useEffect(() => {
    if (months.length > 0 && (!selectedMonthKey || !months.includes(selectedMonthKey))) {
      setSelectedMonthKey(months[months.length - 1])
    }
  }, [months, selectedMonthKey])

  // Filter active transactions to the selected month
  const monthTransactions = useMemo(() => {
    if (!selectedMonthKey) return active
    const [y, m] = selectedMonthKey.split('-').map(Number)
    return active.filter((tx) => {
      const d = new Date(tx.date)
      return d.getFullYear() === y && d.getMonth() === m
    })
  }, [active, selectedMonthKey])

  // Whether any AI-categorized transactions exist in the current month
  const hasAiCategories = useMemo(
    () => monthTransactions.some((tx) => aiCategories[tx.id]?.source === 'llm'),
    [monthTransactions, aiCategories],
  )

  // Auto-clear AI-only filter when AI categories are removed
  useEffect(() => {
    if (!hasAiCategories) setShowAIOnly(false)
  }, [hasAiCategories])

  // When showAIOnly is on, restrict to AI-categorized transactions only
  const displayTransactions = useMemo(
    () => showAIOnly ? monthTransactions.filter((tx) => aiCategories[tx.id]?.source === 'llm') : monthTransactions,
    [monthTransactions, aiCategories, showAIOnly],
  )

  // Recategorize whenever rules change (customRules is the changing part)
  useEffect(() => {
    recategorize()
    // recategorize reads from localStorage which was already updated synchronously
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRules])

  // Compute category totals using displayTransactions (respects AI-only filter)
  const categoryTotals = useMemo(() => buildCategoryTotals(displayTransactions, rules), [displayTransactions, rules])

  // Selected category metadata
  const selectedCategory = useMemo(
    () => categoryTotals.find((c) => c.categoryId === selectedId) ?? null,
    [categoryTotals, selectedId],
  )

  // Transactions for the drilldown
  const drilldownTransactions = useMemo(() => {
    if (!selectedId) return []
    return displayTransactions.filter((tx) => tx.category === selectedId)
  }, [displayTransactions, selectedId])

  // ── Rule mutations (always followed by recategorize) ──────────────────────
  const handleAddRule = useCallback(
    (draft: Omit<CategoryRule, 'id'>) => {
      addRule(draft)
      // recategorize will fire via the useEffect above
    },
    [addRule],
  )

  const handleUpdateRule = useCallback(
    (id: string, patch: Partial<Omit<CategoryRule, 'id'>>) => {
      updateRule(id, patch)
    },
    [updateRule],
  )

  const handleDeleteRule = useCallback(
    (id: string) => {
      deleteRule(id)
    },
    [deleteRule],
  )

  const handleResetToDefaults = useCallback(() => {
    resetToDefaults()
  }, [resetToDefaults])

  // ─────────────────────────────────────────────────────────────────────────

  const drilldownOpen = selectedId !== null && selectedCategory !== null

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Categories</h1>
        <div className="flex items-center gap-3">
          {months.length > 0 && (
            <MonthNavigator
              months={months}
              selected={selectedMonthKey}
              onChange={(key) => { setSelectedMonthKey(key); setSelectedId(null) }}
            />
          )}
          {hasAiCategories && (
            <button
              type="button"
              onClick={() => setShowAIOnly((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer',
                showAIOnly
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              )}
            >
              <span className="text-[10px]">✦</span>
              AI only
            </button>
          )}
          <AICategorizeButton />
        </div>
      </div>

      {/* Bar chart */}
      <Card padding="lg">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">
          Spending by Category{selectedMonthKey ? ` — ${monthKeyToLabel(selectedMonthKey)}` : ''}
        </h2>
        <CategoryBarChart
          data={categoryTotals}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        />
      </Card>

      {/* Bottom row */}
      <div
        className={
          drilldownOpen
            ? 'grid grid-cols-2 gap-4 items-start'
            : 'grid grid-cols-1 gap-4'
        }
      >
        {/* Drilldown panel */}
        {drilldownOpen && (
          <Card padding="lg" className="min-h-[320px] flex flex-col">
            <DrilldownPanel
              categoryId={selectedCategory.categoryId}
              name={selectedCategory.name}
              color={selectedCategory.color}
              transactions={drilldownTransactions}
              onClose={() => setSelectedId(null)}
            />
          </Card>
        )}

        {/* Rule editor */}
        <Card padding="lg" className="min-h-[320px] flex flex-col">
          <RuleEditor
            customRules={customRules}
            onAdd={handleAddRule}
            onUpdate={handleUpdateRule}
            onDelete={handleDeleteRule}
            onResetToDefaults={handleResetToDefaults}
          />
        </Card>
      </div>
    </div>
  )
}
