import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import { cn, formatCurrency } from '@/lib/utils'
import type { CategoryTotal } from '@/store/selectors'

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CategoryTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload as CategoryTotal
  return (
    <div className="glass-elevated rounded-lg p-2.5 text-xs space-y-1 min-w-[160px]">
      <div className="flex items-center gap-1.5 font-semibold text-text-primary">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
        {d.name}
      </div>
      <div className="text-text-secondary space-y-0.5 pl-3.5">
        <p>{formatCurrency(d.total)}</p>
        <p>{d.count} transaction{d.count !== 1 ? 's' : ''}</p>
        <p>{d.percentage.toFixed(1)}% of total</p>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CategoryBarChartProps {
  data: CategoryTotal[]
  selectedId: string | null
  onSelect: (categoryId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryBarChart({ data, selectedId, onSelect }: CategoryBarChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No spending data for the current filters.
      </p>
    )
  }

  // Give the Y-axis enough space to show full category names
  const maxNameLen = Math.max(...data.map((d) => d.name.length))
  const yAxisWidth = Math.min(Math.max(80, maxNameLen * 7), 160)

  // Bar height: 28px per category + some padding
  const chartHeight = Math.max(data.length * 36 + 20, 120)

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
      >
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={yAxisWidth}
          tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={CategoryTooltip}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar
          dataKey="total"
          radius={[0, 4, 4, 0]}
          cursor="pointer"
          maxBarSize={28}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(barData: any) => onSelect((barData as CategoryTotal).categoryId)}
        >
          {data.map((entry) => (
            <Cell
              key={entry.categoryId}
              fill={entry.color}
              opacity={selectedId && selectedId !== entry.categoryId ? 0.4 : 1}
              className={cn('transition-opacity duration-150')}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
