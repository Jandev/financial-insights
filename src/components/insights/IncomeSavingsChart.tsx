import { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  type TooltipContentProps,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

// ─── Data computation ─────────────────────────────────────────────────────────

interface MonthDatum {
  label: string
  income: number
  savings: number
  /** null when income is 0 (avoid divide-by-zero on the line) */
  savingsRate: number | null
}

function buildChartData(transactions: Transaction[]): MonthDatum[] {
  const map = new Map<
    string,
    { year: number; month: number; income: number; expenses: number }
  >()

  for (const tx of transactions) {
    const year = tx.date.getFullYear()
    const month = tx.date.getMonth()
    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, { year, month, income: 0, expenses: 0 })
    const entry = map.get(key)!
    if (tx.amount > 0) entry.income += tx.amount
    else entry.expenses += tx.amount
  }

  return [...map.values()]
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map(({ year, month, income, expenses }) => {
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: '2-digit',
      }).format(new Date(year, month))
      const savings = income + expenses // net (expenses already negative)
      const savingsRate = income > 0 ? (savings / income) * 100 : null
      return { label, income, savings, savingsRate }
    })
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-elevated rounded-[8px] border border-border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-text-primary">{label}</p>
      {payload.map((p) => {
        const val = p.value as number | null
        if (val === null || val === undefined) return null
        const isRate = p.dataKey === 'savingsRate'
        return (
          <div key={p.dataKey as string} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-text-secondary">{p.name}:</span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-text-primary">
              {isRate ? `${val.toFixed(1)}%` : formatCurrency(val)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Axis formatters ──────────────────────────────────────────────────────────

function fmtEuro(v: number): string {
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(0)}k`
  return `€${Math.round(v)}`
}

function fmtPct(v: number): string {
  return `${Math.round(v)}%`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[]
}

export function IncomeSavingsChart({ transactions }: Props) {
  const data = useMemo(() => buildChartData(transactions), [transactions])

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <p className="text-sm text-text-muted">No data for this period.</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} barCategoryGap="30%" barGap={4}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={fmtEuro}
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={fmtPct}
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
          formatter={(v) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>}
        />

        {/* Income bar */}
        <Bar
          yAxisId="left"
          dataKey="income"
          name="Income"
          fill="#34C759"
          radius={[3, 3, 0, 0]}
        />

        {/* Net savings bar — green when positive, red when negative */}
        <Bar
          yAxisId="left"
          dataKey="savings"
          name="Net savings"
          radius={[3, 3, 0, 0]}
        >
          {data.map((entry, i) => (
            <Cell
              key={`savings-${i}`}
              fill={entry.savings >= 0 ? '#34C759' : '#FF3B30'}
              fillOpacity={0.55}
            />
          ))}
        </Bar>

        {/* Savings rate % line on right axis */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="savingsRate"
          name="Savings rate"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
