import { useCallback } from 'react'
import { useStore } from '@/store'
import type { AnomalyFinding, LLMProvider } from '@/store/slices/llmTypes'

export function useHydrateLLMState() {
  const checkLLMStatus = useStore((s) => s.checkLLMStatus)
  const setLLMStatusDirect = useStore((s) => s.setLLMStatusDirect)
  const setFindings = useStore((s) => s.setFindings)
  const setDismissedFindingIds = useStore((s) => s.setDismissedFindingIds)
  const bulkSetInsights = useStore((s) => s.bulkSetInsights)

  return useCallback(async (): Promise<void> => {
    const [anomaliesResult, llmStatusResult, dismissedResult, insightsResult] = await Promise.allSettled([
      fetch('/api/state/anomalies').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/llm/status').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/dismissed').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/llm/insights').then((r) => (r.ok ? r.json() : null)),
    ])

    if (anomaliesResult.status === 'fulfilled' && anomaliesResult.value !== null) {
      const findings: AnomalyFinding[] = anomaliesResult.value?.data?.findings ?? []
      setFindings(findings)
    }

    if (dismissedResult.status === 'fulfilled' && dismissedResult.value !== null) {
      const ids: string[] = dismissedResult.value?.data?.ids ?? []
      if (ids.length > 0) {
        setDismissedFindingIds(ids)
      }
    }

    if (insightsResult.status === 'fulfilled' && insightsResult.value !== null) {
      const insights: Record<string, string> = insightsResult.value?.insights ?? {}
      if (Object.keys(insights).length > 0) {
        bulkSetInsights(insights)
      }
    }

    if (llmStatusResult.status === 'fulfilled' && llmStatusResult.value !== null) {
      setLLMStatusDirect(
        llmStatusResult.value as { available: boolean; provider: LLMProvider | null; model: string | null },
      )
      return
    }

    if (llmStatusResult.status === 'rejected') {
      void checkLLMStatus()
    }
  }, [checkLLMStatus, setLLMStatusDirect, setFindings, setDismissedFindingIds, bulkSetInsights])
}
