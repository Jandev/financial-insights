import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  /**
   * Solid accent fill — use sparingly per HIG: only primary actions
   * (e.g. "Save", "Confirm"). Not for toolbar clusters.
   */
  primary:
    'bg-accent text-white hover:opacity-90 active:opacity-80 shadow-sm',
  /**
   * Transparent with border — secondary actions, toggles
   */
  ghost:
    'bg-transparent border border-border text-text-secondary hover:bg-bg-elevated active:bg-bg-surface',
  /**
   * Expense-coloured — destructive / negative actions
   */
  destructive:
    'bg-expense-dim text-expense border border-expense/20 hover:bg-expense hover:text-white active:opacity-90',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-8 px-4 text-[13px] gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
}

/**
 * macOS-style button.
 * Only `primary` uses the filled accent — all other interactive elements
 * (nav items, toggles) handle their own highlight state.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-all duration-150 select-none cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { Button, type ButtonVariant, type ButtonSize }
