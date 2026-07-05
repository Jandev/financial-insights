import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts'
import { DEFAULT_RULES } from '@/lib/categories'
import { cn, formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CATEGORIES = 8

// ─── Category meta ────────────────────────────────────────────────────────────

const CATEGORY_META = new Map(DEFAULT_RULES.map((r) => [r.id, { name: r.name, color: r.color }]))

function getCatMeta(id: string) {
  return CATEGORY_META.get(id) ?? { name: id || 'Uncategorized', color: '#8E8E93' }
}

// ─── Data computation ─────────────────────────────────────────────────────────

interface CategoryLine {
  id: string
  name: string
  color: string
}

interface ChartResult {
  data: Record<string, string | number>[]
  categories: CategoryLine[]
}

function buildChartData(transactions: Transaction[]): ChartResult {
  const expenses = transactions.filter((tx) => tx.amount < 0)

  // Find top categories by total spend
  const catTotals = new Map<string, number>()
  for (const tx of expenses) {
    catTotals.set(tx.category, (catTotals.get(tx.category) ?? 0) + Math.abs(tx.amount))
  }
  const topIds = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CATEGORIES)
    .map(([id]) => id)

  if (topIds.length === 0) return { data: [], categories: [] }

  const topIdSet = new Set(topIds)

  // Aggregate by month + category
  const monthMap = new Map<
    string,
    { label: string; year: number; month: number; amounts: Map<string, number> }
  >()

  for (const tx of expenses) {
    if (!topIdSet.has(tx.category)) continue
    const year = tx.date.getFullYear()
    const month = tx.date.getMonth()
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!monthMap.has(key)) {
      const label = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(
        new Date(year, month),
      )
      monthMap.set(key, { label, year, month, amounts: new Map() })
    }
    const entry = monthMap.get(key)!
    entry.amounts.set(tx.category, (entry.amounts.get(tx.category) ?? 0) + Math.abs(tx.amount))
  }

  const months = [...monthMap.values()].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  )

  const categories: CategoryLine[] = topIds.map((id) => {
    const meta = getCatMeta(id)
    return { id, name: meta.name, color: meta.color }
  })

  const data = months.map(({ label, amounts }) => {
    const point: Record<string, string | number> = { label }
    for (const cat of categories) {
      point[cat.name] = amounts.get(cat.id) ?? 0
    }
    return point
  })

  return { data, categories }
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const items = [...payload]
    .filter((p) => (p.value as number) > 0)
    .sort((a, b) => (b.value as number) - (a.value as number))
  if (items.length === 0) return null
  return (
    <div className="glass-elevated rounded-[8px] border border-border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-text-primary">{label}</p>
      {items.map((p) => (
        <div key={p.dataKey as string} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-text-primary">
            {formatCurrency(p.value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Y-axis formatter ─────────────────────────────────────────────────────────

function fmtY(v: number): string {
  if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`
  return `€${Math.round(v)}`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[]
}

export function MonthlySpendTrendChart({ transactions }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const { data, categories } = useMemo(() => buildChartData(transactions), [transactions])

  function toggleCategory(name: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (data.length === 0 || categories.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <p className="text-sm text-text-muted">No expense data for this period.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Custom clickable legend */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const isHidden = hidden.has(cat.name)
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCategory(cat.name)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[4px] border border-border',
                'bg-bg-elevated px-2 py-1 text-[11px] font-medium',
                'cursor-pointer transition-opacity duration-150',
                isHidden ? 'opacity-35' : 'opacity-100',
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-text-primary">{cat.name}</span>
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tickFormatter={fmtY}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          {categories.map((cat) => (
            <Line
              key={cat.id}
              type="monotone"
              dataKey={cat.name}
              stroke={cat.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              hide={hidden.has(cat.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
