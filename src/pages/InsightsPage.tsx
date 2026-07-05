import { useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { RangeSelector, type DateRange } from '@/components/ui/RangeSelector'
import { TopMerchantsTable } from '@/components/insights/TopMerchantsTable'
import { BiggestTransactions } from '@/components/insights/BiggestTransactions'
import { MonthlySpendTrendChart } from '@/components/insights/MonthlySpendTrendChart'
import { IncomeSavingsChart } from '@/components/insights/IncomeSavingsChart'
import { AnomalyAlerts } from '@/components/ai/AnomalyAlerts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDateFrom(range: DateRange): Date | null {
  if (range === 'all') return null
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - months, d.getDate())
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InsightsPage() {
  const [range, setRange] = useState<DateRange>('12m')

  const { transactions, excludedIds } = useStore(
    useShallow((s) => ({ transactions: s.transactions, excludedIds: s.excludedIds })),
  )

  // All non-excluded transactions — mirrors DashboardPage pattern (ignores store filters)
  const allActive = useMemo(
    () => transactions.filter((tx) => !excludedIds.has(tx.id)),
    [transactions, excludedIds],
  )

  // Page-local date window
  const dateFrom = useMemo(() => computeDateFrom(range), [range])

  const activeTxs = useMemo(
    () => (dateFrom ? allActive.filter((tx) => tx.date >= dateFrom) : allActive),
    [allActive, dateFrom],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Insights</h1>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Anomaly alerts — LLM-powered unusual transaction detection */}
      <AnomalyAlerts limit={10} />

      {/* Top 10 Merchants */}
      <Card padding="none">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">Top 10 Merchants</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            By total spend — click a row to view in Transactions
          </p>
        </div>
        <TopMerchantsTable transactions={activeTxs} />
      </Card>

      {/* Biggest Single Transactions */}
      <Card padding="lg">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Biggest Single Transactions
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Click a row to navigate and highlight it in Transactions
          </p>
        </div>
        <BiggestTransactions transactions={activeTxs} />
      </Card>

      {/* Monthly Spend Trend */}
      <Card padding="lg">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Monthly Spend Trend per Category
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Top 8 categories by volume — click legend pills to toggle lines
          </p>
        </div>
        <MonthlySpendTrendChart transactions={activeTxs} />
      </Card>

      {/* Income vs Savings Rate */}
      <Card padding="lg">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">Income vs Savings Rate</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Monthly income and net savings (bars) with savings rate % (line, right axis)
          </p>
        </div>
        <IncomeSavingsChart transactions={activeTxs} />
      </Card>
    </div>
  )
}
