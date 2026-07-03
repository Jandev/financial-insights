import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useTransactionStore } from '@/store/transactions'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLatestMonth(txns: Transaction[]): { year: number; month: number } | null {
  if (txns.length === 0) return null
  const latest = txns.reduce((a, b) => (a.date > b.date ? a : b))
  return { year: latest.date.getFullYear(), month: latest.date.getMonth() }
}

function getEarliestDate(txns: Transaction[]): Date | null {
  if (txns.length === 0) return null
  return txns.reduce((a, b) => (a.date < b.date ? a : b)).date
}

function getLatestDate(txns: Transaction[]): Date | null {
  if (txns.length === 0) return null
  return txns.reduce((a, b) => (a.date > b.date ? a : b)).date
}

// ─── Skeleton atoms ───────────────────────────────────────────────────────────

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-elevated ${className}`} />
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { transactions, loadingState } = useTransactionStore()

  const isLoading = loadingState.status === 'idle' || loadingState.status === 'loading'
  const hasError = loadingState.status === 'error' && loadingState.errors.length > 0

  // ── Derive KPI data for the most-recent loaded month ──────────────────────
  const { income, expenses, net, monthCount, monthLabel, recentTxns, dateRangeLabel } =
    useMemo(() => {
      const latestMonth = getLatestMonth(transactions)

      const monthTxns =
        latestMonth !== null
          ? transactions.filter(
              (t) =>
                !t.isExcluded &&
                t.date.getFullYear() === latestMonth.year &&
                t.date.getMonth() === latestMonth.month,
            )
          : []

      const income = monthTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = monthTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
      const net = income + expenses

      const monthLabel =
        latestMonth !== null
          ? formatMonth(new Date(latestMonth.year, latestMonth.month, 1))
          : '—'

      const recentTxns = [...transactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5)

      const earliest = getEarliestDate(transactions)
      const latest = getLatestDate(transactions)
      const dateRangeLabel =
        earliest && latest ? `${formatDate(earliest)} – ${formatDate(latest)}` : null

      return { income, expenses, net, monthCount: monthTxns.length, monthLabel, recentTxns, dateRangeLabel }
    }, [transactions])

  const kpis = [
    { label: 'Income',       value: formatCurrency(income),            variant: 'income'  as const },
    { label: 'Expenses',     value: formatCurrency(Math.abs(expenses)), variant: 'expense' as const },
    { label: 'Net Savings',  value: formatCurrency(net),               variant: net >= 0 ? 'income' as const : 'expense' as const },
    { label: 'Transactions', value: monthCount.toLocaleString('nl-NL'), variant: 'muted'   as const },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        {!isLoading && transactions.length > 0 && (
          <span className="text-xs text-text-muted">
            {transactions.length.toLocaleString('nl-NL')} transactions loaded
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </span>
        )}
      </div>

      {/* Error banner — non-blocking, shows alongside data */}
      {hasError && (
        <div className="flex gap-3 rounded-[8px] border border-expense/20 bg-expense-dim px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-expense" strokeWidth={2} />
          <div>
            <p className="text-sm font-medium text-expense">
              {loadingState.errors.length}{' '}
              {loadingState.errors.length === 1 ? 'file' : 'files'} failed to load
            </p>
            <ul className="mt-1 space-y-0.5">
              {loadingState.errors.map((e, i) => (
                <li key={i} className="truncate font-mono text-[11px] text-expense/80">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} padding="md">
                <div className="mb-2 flex items-start justify-between">
                  <Bone className="h-3 w-20" />
                  <Bone className="h-4 w-10 rounded-[4px]" />
                </div>
                <Bone className="h-7 w-28 mt-1" />
                <Bone className="h-2.5 w-16 mt-2" />
              </Card>
            ))
          : kpis.map(({ label, value, variant }) => (
              <Card key={label} padding="md">
                <div className="mb-2 flex items-start justify-between">
                  <span className="text-xs text-text-secondary">{label}</span>
                  <Badge variant={variant} dot>{variant}</Badge>
                </div>
                <p className="text-2xl font-bold text-text-primary">{value}</p>
                <p className="text-xs text-text-muted mt-1 capitalize">{monthLabel}</p>
              </Card>
            ))}
      </div>

      {/* Recent transactions */}
      <Card padding="lg">
        {isLoading ? (
          <>
            <Bone className="mb-4 h-4 w-40" />
            <ul className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-1.5">
                  <Bone className="h-3 w-10 shrink-0" />
                  <Bone className="h-3 flex-1" />
                  <Bone className="h-4 w-8 shrink-0 rounded-[4px]" />
                  <Bone className="h-3 w-20 shrink-0" />
                </li>
              ))}
            </ul>
          </>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-text-muted">
            No transactions found. Check that CSV files are present in{' '}
            <code className="font-mono text-[11px]">data/transactions/</code>.
          </p>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold text-text-primary">
              Recent transactions
            </h2>
            <ul className="space-y-1">
              {recentTxns.map((txn) => (
                <li
                  key={txn.id}
                  className="flex items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-bg-elevated"
                >
                  <span className="w-12 shrink-0 text-[11px] text-text-muted">
                    {formatDate(txn.date)}
                  </span>
                  <span className="flex-1 truncate text-[13px] text-text-primary">
                    {txn.counterpartyName || txn.description || '—'}
                  </span>
                  <Badge variant="muted" dot={false} className="shrink-0 font-mono uppercase">
                    {txn.transactionCode}
                  </Badge>
                  <span
                    className={[
                      'w-24 shrink-0 text-right text-[13px] font-medium tabular-nums',
                      txn.amount >= 0 ? 'text-income' : 'text-expense',
                    ].join(' ')}
                  >
                    {formatCurrency(txn.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
