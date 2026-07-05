import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** Sorted list of 'YYYY-MM' keys that have data — empty months never appear */
  months: string[]
  selected: string
  onChange: (key: string) => void
}

function keyToLabel(key: string): string {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  )
}

export function MonthNavigator({ months, selected, onChange }: Props) {
  const idx = months.indexOf(selected)
  const hasPrev = idx > 0
  const hasNext = idx < months.length - 1

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => hasPrev && onChange(months[idx - 1])}
        disabled={!hasPrev}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors',
          hasPrev
            ? 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
            : 'cursor-not-allowed text-text-muted/40',
        )}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>

      <span className="min-w-[120px] text-center text-sm font-semibold text-text-primary">
        {keyToLabel(selected)}
      </span>

      <button
        onClick={() => hasNext && onChange(months[idx + 1])}
        disabled={!hasNext}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors',
          hasNext
            ? 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
            : 'cursor-not-allowed text-text-muted/40',
        )}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  )
}
