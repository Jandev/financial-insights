import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import type { MonthlyCategoryTotal } from '@/types/monthly'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BarListItem = Pick<
  MonthlyCategoryTotal,
  'groupKey' | 'categoryIds' | 'name' | 'color' | 'total' | 'percentage'
>

interface Props {
  items: BarListItem[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryBarList({ items, selectedKey, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-2 text-xs text-text-muted">No data</p>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isSelected = selectedKey === item.groupKey
        const isDimmed = selectedKey !== null && !isSelected

        return (
          <li key={item.groupKey}>
            <button
              type="button"
              onClick={() => onSelect(isSelected ? null : item.groupKey)}
              className={cn(
                'group w-full rounded-[6px] px-1.5 py-1 text-left transition-colors',
                'hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                isSelected && 'bg-bg-elevated',
              )}
            >
              {/* Row: dot + name + amount + percentage */}
              <div className="flex items-center gap-2">
                <span
                  className="mt-px h-2 w-2 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs font-medium transition-colors',
                    isDimmed ? 'text-text-muted' : 'text-text-primary',
                  )}
                >
                  {item.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums transition-colors',
                    isDimmed ? 'text-text-muted' : 'text-text-secondary',
                  )}
                >
                  {formatCurrency(item.total)}
                </span>
                <span
                  className={cn(
                    'w-8 shrink-0 text-right text-xs tabular-nums transition-colors',
                    isDimmed ? 'text-text-muted' : 'text-text-muted',
                  )}
                >
                  {item.percentage.toFixed(0)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bg-elevated">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    background: item.color,
                    opacity: isDimmed ? 0.3 : 1,
                  }}
                />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
