import type { StateCreator } from 'zustand'
import { debouncePut } from '@/lib/serverState'
import type { StoreState } from '../useStore'
import type { AnomalyFinding } from './llmTypes'

export interface AnomalySlice {
  findings: AnomalyFinding[]
  dismissedFindingIds: Set<string>
  setFindings: (findings: AnomalyFinding[]) => void
  dismissFinding: (id: string) => void
  restoreFinding: (id: string) => void
  setDismissedFindingIds: (ids: string[]) => void
}

export const createAnomalySlice: StateCreator<StoreState, [], [], AnomalySlice> = (set) => ({
  findings: [],
  dismissedFindingIds: new Set(),

  setFindings: (findings) => set({ findings }),

  dismissFinding: (id) => {
    set((s) => {
      const next = new Set([...s.dismissedFindingIds, id])
      debouncePut('dismissed', { ids: [...next] })
      return { dismissedFindingIds: next }
    })
  },

  restoreFinding: (id) => {
    set((s) => {
      const next = new Set(s.dismissedFindingIds)
      next.delete(id)
      debouncePut('dismissed', { ids: [...next] })
      return { dismissedFindingIds: next }
    })
  },

  setDismissedFindingIds: (ids) =>
    set((s) => ({ dismissedFindingIds: new Set([...s.dismissedFindingIds, ...ids]) })),
})
