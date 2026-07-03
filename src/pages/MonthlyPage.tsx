import { Card } from '@/components/ui/Card'

export function MonthlyPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Monthly Overview</h1>
      <Card padding="lg">
        <p className="text-sm text-text-secondary">
          Monthly income vs expenses breakdown will appear here.
        </p>
      </Card>
    </div>
  )
}
