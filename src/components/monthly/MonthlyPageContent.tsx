import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Bone } from '@/components/ui/Bone'
import { MonthNavigator } from '@/components/ui/MonthNavigator'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { CategoryDonut } from '@/components/monthly/CategoryDonut'
import { CategoryBarList } from '@/components/monthly/CategoryBarList'
import { MonthlyTransactionList } from '@/components/monthly/MonthlyTransactionList'
import { AIInsightCard } from '@/components/ai/AIInsightCard'
import { cn, formatCurrency } from '@/lib/utils'
import type { MonthlyBreakdown } from '@/hooks/useMonthlyBreakdown'

interface DeltaRowProps {
  label: string
  current: number
  previous: number
  positiveIsGood?: boolean
  signedFmt: (delta: number) => string
  pctFmt: (value: number, prev: number) => string
}

function DeltaRow({ label, current, previous, positiveIsGood = true, signedFmt, pctFmt }: DeltaRowProps) {
  const delta = current - previous
  const isUp = delta > 0
  const isNeutral = delta === 0
  const isGood = isNeutral ? null : positiveIsGood ? isUp : !isUp
  const Icon = isNeutral ? Minus : isUp ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            'h-3 w-3 shrink-0',
            isGood === true && 'text-income',
            isGood === false && 'text-expense',
            isGood === null && 'text-text-muted',
          )}
          strokeWidth={2}
        />
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            isGood === true && 'text-income',
            isGood === false && 'text-expense',
            isGood === null && 'text-text-muted',
          )}
        >
          {signedFmt(delta)}
        </span>
        <span
          className={cn(
            'rounded px-1 py-0.5 text-[10px] font-medium tabular-nums',
            isGood === true && 'bg-income/10 text-income',
            isGood === false && 'bg-expense/10 text-expense',
            isGood === null && 'bg-bg-elevated text-text-muted',
          )}
        >
          {pctFmt(current, previous)}
        </span>
      </div>
    </div>
  )
}

interface MonthlyPageContentProps {
  data: MonthlyBreakdown
}

export function MonthlyPageContent({ data }: MonthlyPageContentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Monthly Overview</h1>
        {!data.isLoading && data.availableMonths.length > 0 && (
          <MonthNavigator
            months={data.availableMonths}
            selected={data.selectedMonthKey}
            onChange={data.handleMonthChange}
          />
        )}
        {data.isLoading && <Bone className="h-7 w-40" />}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {data.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} padding="md">
              <div className="mb-2 flex items-start justify-between">
                <Bone className="h-3 w-20" />
                <Bone className="h-4 w-4 rounded" />
              </div>
              <Bone className="mt-1 h-7 w-28" />
              <Bone className="mt-2 h-2.5 w-16" />
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Income"
              value={formatCurrency(data.totalIncome)}
              subLabel={data.monthLabel}
              trend={
                data.prevTotals
                  ? {
                      delta: data.totalIncome - data.prevTotals.income,
                      deltaFormatted: data.signedFmt(data.totalIncome - data.prevTotals.income),
                      periodLabel: `vs ${data.prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={true}
            />
            <KpiCard
              title="Total Expenses"
              value={formatCurrency(data.totalExpenses)}
              subLabel={data.monthLabel}
              trend={
                data.prevTotals
                  ? {
                      delta: data.totalExpenses - data.prevTotals.expenses,
                      deltaFormatted: data.signedFmt(data.totalExpenses - data.prevTotals.expenses),
                      periodLabel: `vs ${data.prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={false}
            />
            <KpiCard
              title="Net Savings"
              value={formatCurrency(data.netSavings)}
              subLabel={data.monthLabel}
              trend={
                data.prevTotals
                  ? {
                      delta: data.netSavings - data.prevTotals.net,
                      deltaFormatted: data.signedFmt(data.netSavings - data.prevTotals.net),
                      periodLabel: `vs ${data.prevTotals.prevMonthName}`,
                    }
                  : undefined
              }
              positiveIsGood={true}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-[1fr_260px] gap-4">
        <Card padding="lg">
          {data.isLoading ? (
            <div className="space-y-4">
              <Bone className="h-4 w-40" />
              <div className="grid grid-cols-2 gap-6">
                <Bone className="h-[180px] w-full rounded-full" />
                <Bone className="h-[180px] w-full rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Bone key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          ) : data.isEmpty ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-text-muted">No transactions this month</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Spending by Category</h2>
                <span className="text-xs text-text-muted">
                  {data.monthLabel}
                  {data.totalExpenses > 0 && <> · {formatCurrency(data.totalExpenses)} total</>}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <p className="text-xs font-medium text-text-secondary">Income</p>
                  <CategoryDonut
                    slices={data.incomeCategoryTotals}
                    centerTotal={data.totalIncome}
                    centerLabel="Income"
                    selectedKey={data.incomeSelectedKey}
                    onSelect={data.handleIncomeSelect}
                  />
                  <CategoryBarList
                    items={data.incomeCategoryTotals}
                    selectedKey={data.incomeSelectedKey}
                    onSelect={data.handleIncomeSelect}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-text-secondary">Expenses</p>
                  <CategoryDonut
                    slices={data.expenseCategoryTotals}
                    centerTotal={data.totalExpenses}
                    centerLabel="Expenses"
                    selectedKey={data.expenseSelectedKey}
                    onSelect={data.handleExpenseSelect}
                  />
                  <CategoryBarList
                    items={data.expenseCategoryTotals}
                    selectedKey={data.expenseSelectedKey}
                    onSelect={data.handleExpenseSelect}
                  />
                </div>
              </div>
            </>
          )}
        </Card>

        <Card padding="lg">
          {data.isLoading ? (
            <div className="space-y-3">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-20" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Month at a Glance</h2>

              {data.prevTotals ? (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    vs {data.prevTotals.prevMonthName}
                  </p>
                  <div className="divide-y divide-border">
                    <DeltaRow
                      label="Income"
                      current={data.totalIncome}
                      previous={data.prevTotals.income}
                      positiveIsGood={true}
                      signedFmt={data.signedFmt}
                      pctFmt={data.pctFmt}
                    />
                    <DeltaRow
                      label="Expenses"
                      current={data.totalExpenses}
                      previous={data.prevTotals.expenses}
                      positiveIsGood={false}
                      signedFmt={data.signedFmt}
                      pctFmt={data.pctFmt}
                    />
                    <DeltaRow
                      label="Savings"
                      current={data.netSavings}
                      previous={data.prevTotals.net}
                      positiveIsGood={true}
                      signedFmt={data.signedFmt}
                      pctFmt={data.pctFmt}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-muted">No previous month to compare.</p>
              )}
            </>
          )}
        </Card>
      </div>

      {data.selectedMonthKey && !data.isLoading && !data.isEmpty && (
        <AIInsightCard period={data.periodIso} periodLabel={data.monthLabel} />
      )}

      <Card padding="lg">
        {data.isLoading ? (
          <div className="space-y-3">
            <Bone className="h-4 w-48" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Bone className="h-3 w-16" />
                <Bone className="h-3 flex-1" />
                <Bone className="h-5 w-20" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">
                Transactions
                {data.activeFilter && (
                  <span className="ml-2 text-xs font-normal text-text-muted">— filtered by category</span>
                )}
              </h2>
              {data.activeFilter && (
                <button
                  type="button"
                  onClick={data.clearActiveFilter}
                  className="text-xs text-accent hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <MonthlyTransactionList
              transactions={data.allMonthTxns}
              excludedIds={data.excludedIds}
              activeFilter={data.activeFilter}
            />
          </>
        )}
      </Card>
    </div>
  )
}
