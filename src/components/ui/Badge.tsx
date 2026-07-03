import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'accent' | 'income' | 'expense' | 'warn' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  /** Show the small coloured dot. Defaults to true. */
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, { wrapper: string; dot: string }> = {
  accent: {
    wrapper: 'bg-accent-dim text-accent',
    dot: 'bg-accent',
  },
  income: {
    wrapper: 'bg-income-dim text-income',
    dot: 'bg-income',
  },
  expense: {
    wrapper: 'bg-expense-dim text-expense',
    dot: 'bg-expense',
  },
  warn: {
    wrapper: 'bg-warn-dim text-warn',
    dot: 'bg-warn',
  },
  muted: {
    wrapper: 'bg-bg-elevated text-text-secondary',
    dot: 'bg-text-muted',
  },
}

/**
 * Pill badge with a coloured dot + label.
 * Used for category tags, status indicators, and trend labels.
 */
const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'muted', dot = true, className, children, ...props }, ref) => {
    const styles = variantStyles[variant]
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1',
          'text-[11px] font-medium leading-none',
          styles.wrapper,
          className,
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    )
  },
)
Badge.displayName = 'Badge'

export { Badge, type BadgeVariant }
