import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

export interface MonthlyBarDatum {
  /** Abbreviated label, e.g. "jan" or "jan '24" */
  label: string
  income: number
  /** Stored as a positive number for chart rendering */
  expenses: number
}

interface Props {
  data: MonthlyBarDatum[]
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-elevated rounded-[8px] border border-border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold capitalize text-text-primary">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey as string} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="capitalize text-text-secondary">{p.name}:</span>
          <span className="font-medium text-text-primary tabular-nums">
            {formatCurrency((p.value as number) ?? 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Y-axis formatter ──────────────────────────────────────────────────────────

function formatYAxis(value: number): string {
  if (value >= 1000) return `€${(value / 1000).toFixed(0)}k`
  return `€${value}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthlyBarChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center">
        <p className="text-sm text-text-muted">No data for selected period</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barCategoryGap="30%" barGap={3}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="rgba(0,0,0,0.06)"
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          dy={6}
          interval="preserveStartEnd"
          style={{ textTransform: 'capitalize' }}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(v) => (
            <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
              {v}
            </span>
          )}
        />
        <Bar dataKey="income"   name="Income"   fill="#34C759" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill="#FF3B30" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
