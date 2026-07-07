import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { ExclusionToggle } from '@/components/transactions/ExclusionToggle'
import { ExpandableTransactionText } from '@/components/transactions/ExpandableTransactionText'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { isIncomeTransaction, isExpenseTransaction } from '@/lib/categories'
import type { Transaction } from '@/types/transaction'

// ─── Narrow prop type ─────────────────────────────────────────────────────────

type TxSummary = Pick<Transaction, 'id' | 'date' | 'counterpartyName' | 'description' | 'amount' | 'category'>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  transactions: TxSummary[]
}

// ─── Single list ──────────────────────────────────────────────────────────────

function TxList({
  title,
  txs,
  excludedIds,
  onRowClick,
}: {
  title: string
  txs: TxSummary[]
  excludedIds: Set<string>
  onRowClick: (tx: TxSummary) => void
}) {
  if (txs.length === 0) {
    return (
      <div className="flex-1 min-w-0">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
        <p className="py-4 text-xs text-text-muted">No data for this period.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      <div>
        {txs.map((tx) => {
          const isExcluded = excludedIds.has(tx.id)
          return (
            <div
              key={tx.id}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(tx)}
              onKeyDown={(e) => e.key === 'Enter' && onRowClick(tx)}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2 py-2',
                'cursor-pointer transition-colors duration-100',
                'hover:bg-bg-elevated/60',
                isExcluded && 'opacity-50',
              )}
            >
              {/* Date + name + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">
                    {formatDate(tx.date)}
                  </span>
                  <ExpandableTransactionText
                    text={tx.counterpartyName}
                    emptyText="—"
                    contentLabel="Counterparty"
                    stopPropagation={true}
                    previewClassName="truncate text-sm font-medium text-text-primary"
                  />
                </div>
                {tx.description && (
                  <ExpandableTransactionText
                    text={tx.description}
                    contentLabel="Description"
                    stopPropagation={true}
                    previewClassName="mt-0.5 truncate text-[11px] text-text-muted"
                  />
                )}
              </div>

              {/* Amount */}
              <span
                className={cn(
                  'shrink-0 text-sm font-medium tabular-nums',
                  tx.amount > 0 ? 'text-income' : 'text-expense',
                  isExcluded && 'line-through',
                )}
              >
                {formatCurrency(tx.amount)}
              </span>

              {/* Exclusion toggle — visible on hover */}
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <ExclusionToggle txId={tx.id} isExcluded={isExcluded} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BiggestTransactions({ transactions }: Props) {
  const navigate = useNavigate()
  const excludedIds = useStore((s) => s.excludedIds)

  const topExpenses = useMemo(
    () =>
      [...transactions]
        .filter(isExpenseTransaction)
        .sort((a, b) => a.amount - b.amount)
        .slice(0, 10),
    [transactions],
  )

  const topIncome = useMemo(
    () =>
      [...transactions]
        .filter(isIncomeTransaction)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    [transactions],
  )

  function handleRowClick(tx: TxSummary) {
    navigate(`/transactions?highlight=${tx.id}`)
  }

  return (
    <div className="flex gap-6">
      <TxList
        title="Largest expenses"
        txs={topExpenses}
        excludedIds={excludedIds}
        onRowClick={handleRowClick}
      />
      <div className="w-px shrink-0 bg-border" />
      <TxList
        title="Largest income"
        txs={topIncome}
        excludedIds={excludedIds}
        onRowClick={handleRowClick}
      />
    </div>
  )
}
