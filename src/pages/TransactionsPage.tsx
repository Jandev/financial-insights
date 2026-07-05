import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { FilterBar } from '@/components/transactions/FilterBar'
import { StatsRow } from '@/components/transactions/StatsRow'
import { TransactionTable } from '@/components/transactions/TransactionTable'

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight') ?? undefined

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>

      <FilterBar />
      <StatsRow />

      <Card padding="none">
        <TransactionTable highlightId={highlightId} />
      </Card>
    </div>
  )
}
