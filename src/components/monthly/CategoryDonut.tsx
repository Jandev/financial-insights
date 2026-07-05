import { useState, useCallback } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Sector,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DonutSlice {
  categoryId: string
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
  /** Currently selected category id, or null */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

// ─── Active shape (enlarged on hover) ────────────────────────────────────────

function ActiveShape(props: PieLabelRenderProps) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill,
  } = props as {
    cx: number; cy: number
    innerRadius: number; outerRadius: number
    startAngle: number; endAngle: number
    fill: string
  }

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
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
  selectedId,
  onSelect,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const handleClick = useCallback(
    (_: unknown, index: number) => {
      const id = slices[index]?.categoryId ?? null
      // Toggle off if clicking the already-selected segment
      onSelect(selectedId === id ? null : id)
    },
    [slices, selectedId, onSelect],
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
            activeIndex={hoverIndex ?? undefined}
            activeShape={ActiveShape}
            onClick={handleClick}
            onMouseEnter={(_, index) => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(null)}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {slices.map((slice) => (
              <Cell
                key={slice.categoryId}
                fill={slice.color}
                opacity={
                  selectedId === null || selectedId === slice.categoryId ? 1 : 0.3
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
