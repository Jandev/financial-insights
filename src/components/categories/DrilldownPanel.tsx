import { useMemo } from 'react'
import { X } from 'lucide-react'
import { Popover as RadixPopover } from 'radix-ui'
import { formatCurrency, formatDateFull, cn } from '@/lib/utils'
import { ExclusionToggle } from '@/components/transactions/ExclusionToggle'
import { CategoryPickerDropdown } from '@/components/transactions/CategoryBadge'
import { useStore } from '@/store'
import type { Transaction } from '@/types/transaction'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DrilldownPanelProps {
  categoryId: string
  name: string
  color: string
  transactions: Transaction[]
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DrilldownPanel({
  categoryId,
  name,
  color,
  transactions,
  onClose,
}: DrilldownPanelProps) {
  const excludedIds = useStore((s) => s.excludedIds)

  const active = useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )

  const total = useMemo(
    () => active.reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [active],
  )

  const isUncategorized = categoryId === 'uncategorized'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-semibold text-text-primary flex-1 truncate">{name}</h2>
        <span className="text-xs text-text-muted shrink-0">
          {formatCurrency(total)} · {active.length} tx
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer shrink-0"
          aria-label="Close drilldown"
        >
          <X size={13} />
        </button>
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No transactions.</p>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border/50">
              {transactions.map((tx) => {
                const isExcluded = excludedIds.has(tx.id)
                return (
                  <tr
                    key={tx.id}
                    className={cn(
                      'group transition-colors duration-100',
                      isExcluded ? 'opacity-40' : 'hover:bg-bg-elevated/60',
                    )}
                  >
                    {/* Date */}
                    <td className="py-1.5 pr-2 whitespace-nowrap text-text-muted tabular-nums shrink-0 w-[80px]">
                      {formatDateFull(tx.date)}
                    </td>

                    {/* Counterparty */}
                    <td className="py-1.5 pr-2 text-text-secondary truncate max-w-0 w-full">
                      <span className="block truncate">{tx.counterpartyName || '—'}</span>
                    </td>

                    {/* Amount */}
                    <td
                      className={cn(
                        'py-1.5 pr-1.5 text-right tabular-nums font-medium whitespace-nowrap',
                        tx.amount < 0 ? 'text-expense' : 'text-income',
                      )}
                    >
                      {formatCurrency(tx.amount)}
                    </td>

                    {/* Assign button (uncategorized only) */}
                    {isUncategorized && (
                      <td className="py-1.5 pl-0.5 w-0">
                        <QuickAssignButton tx={tx} />
                      </td>
                    )}

                    {/* Exclusion toggle */}
                    <td className="py-1.5 w-8 text-right">
                      <ExclusionToggle txId={tx.id} isExcluded={isExcluded} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Quick-assign button (uncategorized transactions) ─────────────────────────

function QuickAssignButton({ tx }: { tx: Transaction }) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium',
            'border border-border text-text-muted',
            'hover:border-accent/40 hover:text-accent hover:bg-accent-dim',
            'transition-colors duration-150 cursor-pointer whitespace-nowrap',
          )}
          title="Assign category"
        >
          Assign
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          className={cn(
            'z-50 rounded-lg shadow-lg',
            'bg-bg-elevated border border-border',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RadixPopover.Close asChild>
            <CategoryPickerDropdown tx={tx} onClose={() => {}} />
          </RadixPopover.Close>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
