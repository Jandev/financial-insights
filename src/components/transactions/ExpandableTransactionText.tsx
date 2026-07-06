import { type KeyboardEvent, type MouseEvent } from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { cn } from '@/lib/utils'

interface ExpandableTransactionTextProps {
  text?: string | null
  emptyText?: string
  previewClassName?: string
  contentLabel?: string
  stopPropagation?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export function ExpandableTransactionText({
  text,
  emptyText = '—',
  previewClassName,
  contentLabel,
  stopPropagation = false,
  side = 'top',
  align = 'start',
}: ExpandableTransactionTextProps) {
  const value = (text ?? '').trim()

  if (!value) {
    return <span className={cn('block', previewClassName)}>{emptyText}</span>
  }

  function stopEventPropagation(
    event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>,
  ) {
    if (stopPropagation) event.stopPropagation()
  }

  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          title="Click to view full text"
          className={cn(
            'block w-full cursor-pointer text-left',
            'transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-0',
            previewClassName,
          )}
          onClick={stopEventPropagation}
          onKeyDown={stopEventPropagation}
        >
          {value}
        </button>
      </RadixPopover.Trigger>

      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 rounded-lg border border-border bg-bg-elevated p-3 shadow-lg',
            'w-[min(36rem,calc(100vw-2rem))] max-h-[60vh] overflow-auto',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onClick={(e) => stopPropagation && e.stopPropagation()}
        >
          {contentLabel && (
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {contentLabel}
            </p>
          )}
          <p className="select-text whitespace-pre-wrap break-words text-xs leading-relaxed text-text-primary">
            {value}
          </p>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
