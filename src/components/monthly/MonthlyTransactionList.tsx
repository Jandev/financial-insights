import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CategoryBadge } from '@/components/transactions/CategoryBadge'
import { ExclusionToggle } from '@/components/transactions/ExclusionToggle'
import { useCategoryOverrides } from '@/hooks/useCategoryOverrides'
import type { Transaction } from '@/types/transaction'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveFilter {
  categoryId: string
  type: 'income' | 'expense'
}

interface Props {
  transactions: Transaction[]
  excludedIds: Set<string>
  activeFilter: ActiveFilter | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthlyTransactionList({ transactions, excludedIds, activeFilter }: Props) {
  const { overrides } = useCategoryOverrides()

  const rows = useMemo(() => {
    let txns = [...transactions]

    // Apply category + type filter when set
    if (activeFilter) {
      txns = txns.filter(
        (tx) =>
          tx.category === activeFilter.categoryId &&
          (activeFilter.type === 'income' ? tx.amount > 0 : tx.amount < 0),
      )
    }

    // Sort date descending
    txns.sort((a, b) => b.date.getTime() - a.date.getTime())
    return txns
  }, [transactions, activeFilter])

  if (rows.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center">
        <p className="text-sm text-text-muted">
          {activeFilter ? 'No transactions for this category' : 'No transactions this month'}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="pb-2 text-left text-xs font-medium text-text-muted">Date</th>
            <th className="pb-2 text-left text-xs font-medium text-text-muted">Counterparty</th>
            <th className="pb-2 text-left text-xs font-medium text-text-muted">Category</th>
            <th className="pb-2 text-right text-xs font-medium text-text-muted">Amount</th>
            <th className="pb-2 text-right text-xs font-medium text-text-muted" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((tx) => {
            const isExcluded = excludedIds.has(tx.id)
            return (
              <tr
                key={tx.id}
                className={cn(
                  'transition-opacity',
                  isExcluded ? 'opacity-35' : 'opacity-100',
                )}
              >
                {/* Date */}
                <td className="py-2 pr-4 text-xs tabular-nums text-text-secondary">
                  {formatDate(tx.date)}
                </td>

                {/* Counterparty */}
                <td className="py-2 pr-4">
                  <span className="block max-w-[200px] truncate text-xs text-text-primary">
                    {tx.counterpartyName || '(unknown)'}
                  </span>
                  {tx.description && (
                    <span className="block max-w-[200px] truncate text-[10px] text-text-muted">
                      {tx.description}
                    </span>
                  )}
                </td>

                {/* Category badge */}
                <td className="py-2 pr-4">
                  <CategoryBadge tx={tx} overrides={overrides} />
                </td>

                {/* Amount */}
                <td
                  className={cn(
                    'py-2 pr-2 text-right text-xs font-medium tabular-nums',
                    tx.amount > 0 ? 'text-income' : 'text-expense',
                  )}
                >
                  {formatCurrency(tx.amount)}
                </td>

                {/* Exclusion toggle */}
                <td className="py-2 pl-1 text-right">
                  <ExclusionToggle txId={tx.id} isExcluded={isExcluded} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
