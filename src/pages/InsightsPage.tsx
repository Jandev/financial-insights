import { Card } from '@/components/ui/Card'

export function InsightsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Insights</h1>
      <Card padding="lg">
        <p className="text-sm text-text-secondary">
          AI-powered financial insights and trends will appear here.
        </p>
      </Card>
    </div>
  )
}
