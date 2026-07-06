import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useStore } from '@/store'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { cn, formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MerchantRow {
  key: string
  displayName: string
  rank: number
  total: number
  count: number
  avgAmount: number
  topCategoryName: string
  topCategoryColor: string
}

type SortCol = 'rank' | 'total' | 'count' | 'avg'
type SortDir = 'asc' | 'desc'

interface Props {
  transactions: Transaction[]
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function computeMerchants(
  transactions: Transaction[],
  categoryMetaById: Map<string, { name: string; color: string }>,
): MerchantRow[] {
  const map = new Map<
    string,
    {
      displayName: string
      total: number
      count: number
      categories: Map<string, { count: number; color: string }>
    }
  >()

  for (const tx of transactions) {
    if (tx.amount >= 0) continue
    const key = tx.counterpartyName.trim().toLowerCase()
    if (!key) continue

    const meta = categoryMetaById.get(tx.category) ?? {
      name: tx.category || 'Uncategorized',
      color: '#8E8E93',
    }

    const entry = map.get(key)
    if (!entry) {
      map.set(key, {
        displayName: tx.counterpartyName.trim(),
        total: Math.abs(tx.amount),
        count: 1,
        categories: new Map([[meta.name, { count: 1, color: meta.color }]]),
      })
    } else {
      entry.total += Math.abs(tx.amount)
      entry.count += 1
      const categoryEntry = entry.categories.get(meta.name)
      if (categoryEntry) {
        categoryEntry.count += 1
      } else {
        entry.categories.set(meta.name, { count: 1, color: meta.color })
      }
    }
  }

  return [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([key, { displayName, total, count, categories }], i) => {
      // Modal category for this merchant
      let topCatName = ''
      let topCatColor = '#8E8E93'
      let topCatCnt = 0
      for (const [name, cat] of categories) {
        if (cat.count > topCatCnt) {
          topCatName = name
          topCatColor = cat.color
          topCatCnt = cat.count
        }
      }

      return {
        key,
        displayName,
        rank: i + 1,
        total,
        count,
        avgAmount: count > 0 ? total / count : 0,
        topCategoryName: topCatName,
        topCategoryColor: topCatColor,
      }
    })
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} className="shrink-0 opacity-30" />
  if (dir === 'asc') return <ArrowUp size={11} className="shrink-0" />
  return <ArrowDown size={11} className="shrink-0" />
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TopMerchantsTable({ transactions }: Props) {
  const [sortCol, setSortCol] = useState<SortCol>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const navigate = useNavigate()
  const { rules } = useCategoryRules()
  const setFilter = useStore((s) => s.setFilter)
  const clearFilters = useStore((s) => s.clearFilters)

  const categoryMetaById = useMemo(() => {
    const colorByName = new Map<string, string>()
    for (const rule of rules) {
      if (!colorByName.has(rule.name)) colorByName.set(rule.name, rule.color)
    }

    const byId = new Map<string, { name: string; color: string }>()
    for (const rule of rules) {
      byId.set(rule.id, {
        name: rule.name,
        color: colorByName.get(rule.name) ?? rule.color,
      })
    }
    return byId
  }, [rules])

  const merchants = useMemo(
    () => computeMerchants(transactions, categoryMetaById),
    [transactions, categoryMetaById],
  )

  const sorted = useMemo(() => {
    return [...merchants].sort((a, b) => {
      let diff = 0
      if (sortCol === 'rank') diff = a.rank - b.rank
      else if (sortCol === 'total') diff = a.total - b.total
      else if (sortCol === 'count') diff = a.count - b.count
      else diff = a.avgAmount - b.avgAmount
      return sortDir === 'asc' ? diff : -diff
    })
  }, [merchants, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function handleRowClick(merchant: MerchantRow) {
    clearFilters()
    setFilter('search', merchant.displayName)
    navigate('/transactions')
  }

  if (merchants.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No expense data for this period.
      </p>
    )
  }

  function thBtn(col: SortCol, label: string, right = false) {
    return (
      <button
        type="button"
        onClick={() => handleSort(col)}
        className={cn(
          'flex items-center gap-1 text-xs font-medium text-text-secondary cursor-pointer select-none',
          right && 'justify-end w-full',
        )}
      >
        {label}
        <SortIcon active={sortCol === col} dir={sortDir} />
      </button>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="w-8 px-3 py-2.5 text-left">{thBtn('rank', '#')}</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary">
              Merchant
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary">
              Category
            </th>
            <th className="px-3 py-2.5 text-right">{thBtn('total', 'Total', true)}</th>
            <th className="px-3 py-2.5 text-right">{thBtn('count', 'Txns', true)}</th>
            <th className="px-3 py-2.5 text-right">{thBtn('avg', 'Average', true)}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.key}
              onClick={() => handleRowClick(row)}
              className="border-b border-border/50 hover:bg-bg-elevated/40 cursor-pointer transition-colors duration-100"
            >
              <td className="px-3 py-2 text-xs tabular-nums text-text-muted">{row.rank}</td>
              <td className="px-3 py-2">
                <span className="text-sm font-medium text-text-primary">{row.displayName}</span>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-bg-elevated px-2 py-1 text-[11px] font-medium text-text-primary">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.topCategoryColor }}
                  />
                  {row.topCategoryName}
                </span>
              </td>
              <td className="px-3 py-2 text-right text-sm font-medium tabular-nums text-expense">
                {formatCurrency(row.total)}
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-text-secondary">
                {row.count}
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-text-secondary">
                {formatCurrency(row.avgAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
