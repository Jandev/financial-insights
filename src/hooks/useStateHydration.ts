/**
 * useStateHydration — issues #22, #17.
 *
 * Thin composition hook:
 * - probes `/api/health` for server availability
 * - hydrates categorization state
 * - hydrates LLM/anomaly/insight state
 * - emits `state-hydrated` and re-runs recategorization
 */

import { useEffect } from 'react'
import { useStore } from '@/store'
import { useServerAvailability } from '@/hooks/hydration/useServerAvailability'
import { useHydrateCategorizationState } from '@/hooks/hydration/useHydrateCategorizationState'
import { useHydrateLLMState } from '@/hooks/hydration/useHydrateLLMState'

const HYDRATION_EVENT = 'state-hydrated'

export function useStateHydration(): void {
  const recategorize = useStore((s) => s.recategorize)
  const checkServerAvailability = useServerAvailability()
  const hydrateCategorizationState = useHydrateCategorizationState()
  const hydrateLLMState = useHydrateLLMState()

  useEffect(() => {
    let cancelled = false

    async function hydrate(): Promise<void> {
      const serverAvailable = await checkServerAvailability()
      if (!serverAvailable) {
        console.log('[state] Express not available — using localStorage fallback')
        return
      }

      await Promise.all([
        hydrateCategorizationState(),
        hydrateLLMState(),
      ])

      if (cancelled) return

      window.dispatchEvent(new CustomEvent(HYDRATION_EVENT))
      recategorize()
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [checkServerAvailability, hydrateCategorizationState, hydrateLLMState, recategorize])
}
