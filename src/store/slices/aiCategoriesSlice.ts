import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'
import type { AICategoryResult } from './llmTypes'

export interface AICategoriesSlice {
  aiCategories: Record<string, AICategoryResult>
  setAiCategories: (categories: Record<string, AICategoryResult>) => void
  clearAiCategories: () => void
  removeAiCategory: (txId: string) => void
}

export const createAICategoriesSlice: StateCreator<StoreState, [], [], AICategoriesSlice> = (set, get) => ({
  aiCategories: {},

  setAiCategories: (categories) => set({ aiCategories: categories }),

  clearAiCategories: () => set({ aiCategories: {} }),

  removeAiCategory: (txId) => {
    const updated = { ...get().aiCategories }
    delete updated[txId]
    set({ aiCategories: updated })
  },
})
