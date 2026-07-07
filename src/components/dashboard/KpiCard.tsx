import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export interface KpiTrend {
  /** Signed delta vs previous period (positive = up, negative = down) */
  delta: number
  /** Formatted delta string, e.g. "+€ 450" or "−€ 120" */
  deltaFormatted: string
  /** Label appended after delta, e.g. "vs May" or "this month" */
  periodLabel: string
}

interface Props {
  title: string
  value: string
  subLabel: string
  trend?: KpiTrend
  /** Override arrow direction — useful when a lower expense is "good" */
  positiveIsGood?: boolean
}

export function KpiCard({ title, value, subLabel, trend, positiveIsGood = true }: Props) {
  const trendUp = trend ? trend.delta > 0 : null
  const trendNeutral = trend ? trend.delta === 0 : null

  const trendGood =
    trend === undefined || trendNeutral
      ? null
      : positiveIsGood
        ? trendUp
        : !trendUp

  const TrendIcon = trendNeutral ? Minus : trendUp ? TrendingUp : TrendingDown

  return (
    <Card padding="md" className="flex flex-col gap-1 min-w-0">
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs text-text-secondary truncate">{title}</span>
        {trend && !trendNeutral && (
          <TrendIcon
            className={cn(
              'h-4 w-4 shrink-0',
              trendGood === true  && 'text-income',
              trendGood === false && 'text-expense',
              trendGood === null  && 'text-text-muted',
            )}
            strokeWidth={2}
          />
        )}
      </div>
      <p className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-text-primary truncate">{value}</p>
      <p className="text-xs text-text-muted truncate">
        {trend ? (
          <>
            <span
              className={cn(
                'font-medium',
                trendGood === true  && 'text-income',
                trendGood === false && 'text-expense',
              )}
            >
              {trend.deltaFormatted}
            </span>{' '}
            {trend.periodLabel}
          </>
        ) : (
          subLabel
        )}
      </p>
    </Card>
  )
}
