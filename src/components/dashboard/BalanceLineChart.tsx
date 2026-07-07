import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'

export interface BalancePoint {
  /** Unix timestamp (ms) — used as numeric X value */
  ts: number
  balance: number
}

interface Props {
  data: BalancePoint[]
  /** Formatted label for the start of the range, e.g. "jun 2024  €8.120" */
  startLabel: string
  /** Formatted label for the end of the range, e.g. "mei 2025  €12.450" */
  endLabel: string
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  const date = new Date(point.payload.ts as number)
  return (
    <div className="glass-elevated rounded-[8px] border border-border px-3 py-2 text-xs shadow-lg">
      <p className="text-text-muted">{formatDate(date)}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-text-primary">
        {formatCurrency((point.value as number) ?? 0)}
      </p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BalanceLineChart({ data, startLabel, endLabel }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center">
        <p className="text-sm text-text-muted">No balance data available</p>
      </div>
    )
  }

  return (
    <div>
      {/* Range summary row */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs text-text-muted">
        <span>{startLabel}</span>
        <span className="text-text-muted/50">→</span>
        <span className="font-semibold text-accent">{endLabel}</span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.18} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <XAxis dataKey="ts" hide />
          <Tooltip content={ChartTooltip} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#balanceGradient)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
