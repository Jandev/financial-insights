import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_RULES } from '@/lib/categories'

export interface TopExpenseEntry {
  counterpartyName: string
  categoryId: string
  total: number
}

interface Props {
  entries: TopExpenseEntry[]
}

// Build a lookup map from categoryId → display name
const CATEGORY_NAMES = new Map(DEFAULT_RULES.map((r) => [r.id, r.name]))

export function TopExpenses({ entries }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Top Expenses</h2>
        <Link
          to="/transactions?sort=amount"
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">No expenses in selected period</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {entry.counterpartyName || '—'}
                </p>
                <p className="text-[11px] text-text-muted">
                  {CATEGORY_NAMES.get(entry.categoryId) ?? entry.categoryId}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-expense">
                −{formatCurrency(entry.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
