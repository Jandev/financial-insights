import { Card } from '@/components/ui/Card'
import { FilterBar } from '@/components/transactions/FilterBar'
import { StatsRow } from '@/components/transactions/StatsRow'
import { TransactionTable } from '@/components/transactions/TransactionTable'

export function TransactionsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>

      <FilterBar />
      <StatsRow />

      <Card padding="none">
        <TransactionTable />
      </Card>
    </div>
  )
}
