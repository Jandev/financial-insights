import { useCallback } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Sector,
  ResponsiveContainer,
  type PieSectorDataItem,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DonutSlice {
  groupKey: string
  categoryIds: string[]
  name: string
  color: string
  total: number
  percentage: number
}

interface Props {
  slices: DonutSlice[]
  /** Grand total shown in the center label */
  centerTotal: number
  /** Label above the total, e.g. "Income" or "Expenses" */
  centerLabel: string
  /** Currently selected group key, or null */
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

// ─── Active shape (enlarged on hover) ────────────────────────────────────────

function ActiveShape(props: PieSectorDataItem) {
  const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '' } = props

  return (
    <g>
      <Sector
        cx={cx as number}
        cy={cy as number}
        innerRadius={innerRadius}
        outerRadius={(outerRadius as number) + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={1}
      />
    </g>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryDonut({
  slices,
  centerTotal,
  centerLabel,
  selectedKey,
  onSelect,
}: Props) {
  const handleClick = useCallback(
    (_: unknown, index: number) => {
      const key = slices[index]?.groupKey ?? null
      onSelect(selectedKey === key ? null : key)
    },
    [slices, selectedKey, onSelect],
  )

  if (slices.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-xs text-text-muted">No data</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="total"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={72}
            paddingAngle={2}
            activeShape={ActiveShape}
            onClick={handleClick}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {slices.map((slice) => (
              <Cell
                key={slice.groupKey}
                fill={slice.color}
                opacity={
                  selectedKey === null || selectedKey === slice.groupKey ? 1 : 0.3
                }
                stroke="none"
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — absolutely positioned over the donut hole */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {centerLabel}
        </span>
        <span className="mt-0.5 text-sm font-bold tabular-nums text-text-primary">
          {formatCurrency(centerTotal)}
        </span>
      </div>
    </div>
  )
}
