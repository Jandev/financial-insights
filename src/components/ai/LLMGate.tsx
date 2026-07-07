/**
 * LLM availability gate — issue #17.
 *
 * Wraps any AI feature button/element. When the LLM is unavailable,
 * disables the element and shows a tooltip explaining why.
 */

import { useStore } from '@/store'
import { Tooltip } from '@/components/ui/Tooltip'
import type { ReactNode } from 'react'

interface LLMGateProps {
  children: ReactNode
  /** Optionally override the unavailable message */
  unavailableMessage?: string
}

export function LLMGate({ children, unavailableMessage }: LLMGateProps) {
  const llmAvailable = useStore((s) => s.llmAvailable)

  if (llmAvailable) return <>{children}</>

  const msg =
    unavailableMessage ??
    'Configure AI credentials in .env to use AI features'

  return (
    <Tooltip content={msg}>
      <span className="cursor-not-allowed opacity-40 pointer-events-none">{children}</span>
    </Tooltip>
  )
}
