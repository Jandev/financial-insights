import { Card } from '@/components/ui/Card'

export function TransactionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>
      <Card padding="lg">
        <p className="text-sm text-text-secondary">
          Transaction table will appear here once CSV files are loaded.
        </p>
      </Card>
    </div>
  )
}
