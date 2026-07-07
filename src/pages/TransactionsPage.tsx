import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { FilterBar } from '@/components/transactions/FilterBar'
import { StatsRow } from '@/components/transactions/StatsRow'
import { TransactionTable } from '@/components/transactions/TransactionTable'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { AICategorizeButton } from '@/components/ai/AICategorizeButton'
import { useAvailableMonths } from '@/store/selectors'
import { useDefaultMonth } from '@/hooks/useDefaultMonth'
import { keyToIsoPeriod } from '@/hooks/useMonthlyBreakdown'

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight') ?? undefined

  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const months = useAvailableMonths()
  useDefaultMonth(months, selectedMonthKey, setSelectedMonthKey)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>
        <div className="flex items-center gap-3">
          {months.length > 0 && (
            <MonthNavigator
              months={months}
              selected={selectedMonthKey}
              onChange={setSelectedMonthKey}
            />
          )}
          {selectedMonthKey && (
            <AICategorizeButton period={keyToIsoPeriod(selectedMonthKey)} />
          )}
        </div>
      </div>

      <FilterBar />
      <StatsRow />

      <Card padding="none">
        <TransactionTable highlightId={highlightId} />
      </Card>
    </div>
  )
}
