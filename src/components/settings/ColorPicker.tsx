import { cn } from '@/lib/utils'
import { SPAARPOTJE_COLORS } from '@/types/savingsAccount'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {SPAARPOTJE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
            value === color ? 'ring-2 ring-offset-1 ring-offset-bg-elevated ring-white/50 scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}
