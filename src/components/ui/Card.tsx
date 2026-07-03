import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Extra padding variant. Defaults to 'md' (p-4). */
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

/**
 * Liquid Glass card panel.
 * Applies the .glass-card surface (translucent base + shimmer + backdrop-blur).
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding = 'md', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('glass-card', paddingMap[padding], className)}
      {...props}
    >
      {children}
    </div>
  ),
)
Card.displayName = 'Card'

export { Card }
