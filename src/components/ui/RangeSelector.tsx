import { cn } from '@/lib/utils'

export type DateRange = '3m' | '6m' | '12m' | 'all'

const OPTIONS: { value: DateRange; label: string }[] = [
  { value: '3m',  label: '3m'  },
  { value: '6m',  label: '6m'  },
  { value: '12m', label: '12m' },
  { value: 'all', label: 'All' },
]

interface Props {
  value: DateRange
  onChange: (value: DateRange) => void
}

export function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center rounded-[8px] border border-border bg-bg-elevated p-[3px] gap-[2px]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-[6px] px-3 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-base',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
