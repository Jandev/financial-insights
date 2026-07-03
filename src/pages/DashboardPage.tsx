import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Monthly Income',   value: '€ 0',   variant: 'income'  },
          { label: 'Monthly Expenses', value: '€ 0',   variant: 'expense' },
          { label: 'Net Savings',      value: '€ 0',   variant: 'accent'  },
          { label: 'Transactions',     value: '0',     variant: 'muted'   },
        ].map(({ label, value, variant }) => (
          <Card key={label} padding="md">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs text-text-secondary">{label}</span>
              <Badge variant={variant as 'income' | 'expense' | 'accent' | 'muted'} dot>
                {variant}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            <p className="text-xs text-text-muted mt-1">vs last month</p>
          </Card>
        ))}
      </div>

      <Card padding="lg">
        <p className="text-sm text-text-secondary">
          Charts and transaction data will appear here once CSV files are loaded.
        </p>
      </Card>
    </div>
  )
}
