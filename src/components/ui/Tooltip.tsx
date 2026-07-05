import { type ReactNode } from 'react'
import { Tooltip as RadixTooltip } from 'radix-ui'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  /** Delay in ms before tooltip opens. Default 400. */
  delayDuration?: number
}

/**
 * Accessible tooltip built on Radix UI.
 * Wrap any trigger element — tooltip appears after a short hover delay.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  delayDuration = 400,
}: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className={cn(
              'z-50 max-w-xs rounded-md px-2.5 py-1.5',
              'bg-bg-elevated border border-border shadow-lg',
              'text-[11px] leading-snug text-text-primary',
              'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
              className,
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-border" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
