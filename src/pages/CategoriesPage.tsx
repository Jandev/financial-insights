import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { cn, monthKeyToLabel } from '@/lib/utils'
import { useActiveTransactions } from '@/store/selectors'
import { useAvailableMonths } from '@/store/selectors'
import { useDefaultMonth } from '@/hooks/useDefaultMonth'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { useStore } from '@/store'
import type { CategoryRule, CategoryRuleDraft } from '@/lib/categories'
import { FALLBACK_CATEGORY_COLOR, FALLBACK_CATEGORY_ICON } from '@/lib/categories'
import { CategoryBarChart } from '@/components/categories/CategoryBarChart'
import { DrilldownPanel } from '@/components/categories/DrilldownPanel'
import { RuleEditor } from '@/components/categories/RuleEditor'
import { AICategorizeButton } from '@/components/ai/AICategorizeButton'
import { MonthNavigator } from '@/components/ui/MonthNavigator'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface GroupedCategoryTotal {
  groupKey: string
  categoryIds: string[]
  name: string
  color: string
  icon: string
  total: number
  count: number
  percentage: number
}

function buildCategoryTotals(
  transactions: ReturnType<typeof useActiveTransactions>,
  rules: CategoryRule[],
): GroupedCategoryTotal[] {
  const meta = new Map(rules.map((r) => [r.id, { name: r.name, color: r.color, icon: r.icon }]))
  const map = new Map<string, Omit<GroupedCategoryTotal, 'percentage'>>()

  for (const tx of transactions) {
    const m = meta.get(tx.category)
    const groupKey = m?.name ?? tx.category
    const existing = map.get(groupKey)
    if (existing) {
      existing.total += Math.abs(tx.amount)
      existing.count += 1
      if (!existing.categoryIds.includes(tx.category)) existing.categoryIds.push(tx.category)
      continue
    }

    map.set(groupKey, {
      groupKey,
      categoryIds: [tx.category],
      name: groupKey,
      color: m?.color ?? FALLBACK_CATEGORY_COLOR,
      icon: m?.icon ?? FALLBACK_CATEGORY_ICON,
      total: Math.abs(tx.amount),
      count: 1,
    })
  }

  const grandTotal = [...map.values()].reduce((s, v) => s + v.total, 0)

  return [...map.values()]
    .map((group) => {
      return {
        ...group,
        percentage: grandTotal > 0 ? (group.total / grandTotal) * 100 : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoriesPage() {
  const active = useActiveTransactions()
  const { rules, customRules, addRule, updateRule, deleteRule, resetToDefaults, defaultNameOverrides, setDefaultNameOverride, removeDefaultNameOverride } =
    useCategoryRules()
  const recategorize = useStore((s) => s.recategorize)
  const aiCategories = useStore((s) => s.aiCategories)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showAIOnly, setShowAIOnly] = useState(false)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')

  // Derive sorted list of months (YYYY-MM, 0-indexed) that have data
  const months = useAvailableMonths(active)

  // Default to most recent month with data; re-sync if transactions load later
  useDefaultMonth(months, selectedMonthKey, setSelectedMonthKey)

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
    () => categoryTotals.find((c) => c.groupKey === selectedKey) ?? null,
    [categoryTotals, selectedKey],
  )

  // Transactions for the drilldown
  const drilldownTransactions = useMemo(() => {
    if (!selectedCategory) return []
    return displayTransactions.filter((tx) => selectedCategory.categoryIds.includes(tx.category))
  }, [displayTransactions, selectedCategory])

  // ── Rule mutations (always followed by recategorize) ──────────────────────
  const handleAddRule = useCallback(
    (draft: CategoryRuleDraft) => {
      addRule(draft)
      // recategorize will fire via the useEffect above
    },
    [addRule],
  )

  const handleUpdateRule = useCallback(
    (id: string, draft: CategoryRuleDraft) => {
      updateRule(id, draft)
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

  const handleRenameDefault = useCallback(
    (id: string, name: string) => {
      setDefaultNameOverride(id, name)
    },
    [setDefaultNameOverride],
  )

  const handleResetDefaultName = useCallback(
    (id: string) => {
      removeDefaultNameOverride(id)
    },
    [removeDefaultNameOverride],
  )

  // ─────────────────────────────────────────────────────────────────────────

  const drilldownOpen = selectedKey !== null && selectedCategory !== null

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
              onChange={(key) => { setSelectedMonthKey(key); setSelectedKey(null) }}
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
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedKey((prev) => (prev === key ? null : key))}
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
              categoryIds={selectedCategory.categoryIds}
              name={selectedCategory.name}
              color={selectedCategory.color}
              transactions={drilldownTransactions}
              onClose={() => setSelectedKey(null)}
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
            defaultNameOverrides={defaultNameOverrides}
            onRenameDefault={handleRenameDefault}
            onResetDefaultName={handleResetDefaultName}
          />
        </Card>
      </div>
    </div>
  )
}
