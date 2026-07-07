/**
 * SpaarpotjesWidget — Dashboard widget showing per-goal savings balance.
 *
 * Rendered on the DashboardPage below the main KPI row when at least one
 * spaarpotje is configured. Each pot gets a card showing its current balance
 * (sum of deposits minus withdrawals).
 */

import { PiggyBank } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'
import { useSpaarpotjeBalances } from '@/store/selectors'
import { useSavingsAccounts } from '@/hooks/useSavingsAccounts'

export function SpaarpotjesWidget() {
  const { accounts } = useSavingsAccounts()
  const balances = useSpaarpotjeBalances(accounts)

  if (!accounts.length) return null

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <PiggyBank className="h-4 w-4 text-text-secondary" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-text-primary">Spaarpotjes</h2>
      </div>

      {/* One card per pot — auto-fit so fewer than 4 pots don't leave blank columns */}
      <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        {balances.map(({ account, balance, depositCount, withdrawalCount }) => (
          <Card key={account.id} padding="md" className="flex flex-col gap-1 min-w-0">
            {/* Title row with color dot */}
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: account.color }}
              />
              <span className="text-xs text-text-secondary truncate">{account.name}</span>
            </div>

            {/* Balance */}
            <p
              className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight truncate"
              style={{ color: balance >= 0 ? account.color : 'var(--color-expense)' }}
            >
              {formatCurrency(balance)}
            </p>

            {/* Sub-label: transaction counts */}
            <p className="text-xs text-text-muted truncate">
              {depositCount} {depositCount === 1 ? 'deposit' : 'deposits'}
              {withdrawalCount > 0 && (
                <>, {withdrawalCount} {withdrawalCount === 1 ? 'opname' : 'opnames'}</>
              )}
            </p>
          </Card>
        ))}
      </div>
    </div>
  )
}
