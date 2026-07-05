import { useState, useMemo, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { useActiveTransactions } from '@/store/selectors'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { useStore } from '@/store'
import type { CategoryRule } from '@/lib/categories'
import type { CategoryTotal } from '@/store/selectors'
import { CategoryBarChart } from '@/components/categories/CategoryBarChart'
import { DrilldownPanel } from '@/components/categories/DrilldownPanel'
import { RuleEditor } from '@/components/categories/RuleEditor'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Recategorize whenever rules change (customRules is the changing part)
  useEffect(() => {
    recategorize()
    // recategorize reads from localStorage which was already updated synchronously
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRules])

  // Compute category totals using the full merged ruleset for correct metadata
  const categoryTotals = useMemo(() => buildCategoryTotals(active, rules), [active, rules])

  // Selected category metadata
  const selectedCategory = useMemo(
    () => categoryTotals.find((c) => c.categoryId === selectedId) ?? null,
    [categoryTotals, selectedId],
  )

  // Transactions for the drilldown
  const drilldownTransactions = useMemo(() => {
    if (!selectedId) return []
    return active.filter((tx) => tx.category === selectedId)
  }, [active, selectedId])

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
      <h1 className="text-2xl font-bold text-text-primary">Categories</h1>

      {/* Bar chart */}
      <Card padding="lg">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">
          Spending by Category
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
