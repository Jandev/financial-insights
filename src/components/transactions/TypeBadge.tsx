import { cn } from '@/lib/utils'
import type { TransactionCode } from '@/types/transaction'

interface TypeBadgeProps {
  code: TransactionCode
  className?: string
}

const TYPE_META: Record<string, { label: string; classes: string }> = {
  bc: {
    label: 'bc',
    classes: 'bg-income-dim text-income',
  },
  cb: {
    label: 'cb',
    classes: 'bg-accent-dim text-accent',
  },
  ei: {
    label: 'ei',
    classes: 'bg-warn-dim text-warn',
  },
  tb: {
    label: 'tb',
    classes: 'bg-expense-dim text-expense',
  },
  ba: {
    label: 'ba',
    classes: 'bg-bg-elevated text-text-secondary',
  },
  ga: {
    label: 'ga',
    classes: 'bg-bg-elevated text-text-secondary',
  },
  bg: {
    label: 'bg',
    classes: 'bg-bg-elevated text-text-secondary',
  },
  db: {
    label: 'db',
    classes: 'bg-bg-elevated text-text-secondary',
  },
}

/**
 * Small monospace pill badge for transaction codes (bc / cb / ei / tb / …).
 */
export function TypeBadge({ code, className }: TypeBadgeProps) {
  const meta = TYPE_META[code] ?? {
    label: code,
    classes: 'bg-bg-elevated text-text-muted',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[4px] px-1.5 py-0.5',
        'text-[10px] font-semibold leading-none font-mono uppercase tracking-wide',
        meta.classes,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}
