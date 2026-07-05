import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatCurrency } from '@/lib/utils'
import { useFilteredTransactions, useStore } from '@/store'

/**
 * Summary row below the filter bar.
 * Shows counts and totals for the currently visible (non-excluded) transactions.
 */
export function StatsRow() {
  const filteredTxs = useFilteredTransactions()
  const excludedIds = useStore(useShallow((s) => s.excludedIds))

  const stats = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    let visibleCount = 0

    for (const tx of filteredTxs) {
      if (excludedIds.has(tx.id)) continue
      visibleCount++
      if (tx.amount > 0) totalIn += tx.amount
      else totalOut += tx.amount
    }

    return {
      total: filteredTxs.length,
      visible: visibleCount,
      totalIn,
      totalOut,
      net: totalIn + totalOut,
    }
  }, [filteredTxs, excludedIds])

  if (filteredTxs.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted px-0.5">
      <span>
        Showing{' '}
        <span className="text-text-secondary font-medium">{stats.visible}</span>
        {stats.visible !== stats.total && (
          <> of {stats.total}</>
        )}{' '}
        transaction{stats.total !== 1 ? 's' : ''}
      </span>

      <span className="text-border hidden sm:block">·</span>

      <span>
        Total in:{' '}
        <span className="text-income font-medium tabular-nums">{formatCurrency(stats.totalIn)}</span>
      </span>

      <span className="text-border hidden sm:block">·</span>

      <span>
        Total out:{' '}
        <span className="text-expense font-medium tabular-nums">
          {formatCurrency(stats.totalOut)}
        </span>
      </span>

      <span className="text-border hidden sm:block">·</span>

      <span>
        Net:{' '}
        <span
          className={`font-medium tabular-nums ${stats.net >= 0 ? 'text-income' : 'text-expense'}`}
        >
          {formatCurrency(stats.net)}
        </span>
      </span>
    </div>
  )
}
