import { Eye, EyeOff } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

interface ExclusionToggleProps {
  txId: string
  isExcluded: boolean
  className?: string
}

/**
 * Per-row eye / eye-off toggle.
 * Excluded rows are hidden from charts and calculations but remain visible
 * in the table at reduced opacity.
 */
export function ExclusionToggle({ txId, isExcluded, className }: ExclusionToggleProps) {
  const toggleExclusion = useStore((s) => s.toggleExclusion)

  return (
    <Tooltip
      content={
        isExcluded
          ? 'Hidden from charts & calculations — click to restore'
          : 'Click to hide from charts & calculations'
      }
      side="left"
      delayDuration={600}
    >
      <button
        type="button"
        onClick={() => toggleExclusion(txId)}
        aria-label={isExcluded ? 'Restore transaction' : 'Hide transaction'}
        className={cn(
          'inline-flex items-center justify-center rounded-md w-7 h-7',
          'transition-colors duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          isExcluded
            ? 'text-text-muted hover:text-expense'
            : 'text-text-secondary hover:text-text-primary',
          className,
        )}
      >
        {isExcluded ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </Tooltip>
  )
}
