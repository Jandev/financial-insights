import { Card } from '@/components/ui/Card'

export function CategoriesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Categories</h1>
      <Card padding="lg">
        <p className="text-sm text-text-secondary">
          Spending by category will appear here.
        </p>
      </Card>
    </div>
  )
}
