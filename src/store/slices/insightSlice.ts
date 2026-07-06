import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'

export interface InsightSlice {
  insightCache: Record<string, string>
  setInsight: (period: string, text: string) => void
  clearInsight: (period: string) => void
  bulkSetInsights: (insights: Record<string, string>) => void
}

export const createInsightSlice: StateCreator<StoreState, [], [], InsightSlice> = (set) => ({
  insightCache: {},

  setInsight: (period, text) =>
    set((s) => ({ insightCache: { ...s.insightCache, [period]: text } })),

  clearInsight: (period) =>
    set((s) => {
      const next = { ...s.insightCache }
      delete next[period]
      return { insightCache: next }
    }),

  bulkSetInsights: (insights) =>
    set((s) => ({ insightCache: { ...insights, ...s.insightCache } })),
})
