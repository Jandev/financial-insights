import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'
import type { AICategoryResult } from './llmTypes'

export interface AICategoriesSlice {
  aiCategories: Record<string, AICategoryResult>
  setAiCategories: (categories: Record<string, AICategoryResult>) => void
  clearAiCategories: () => void
}

export const createAICategoriesSlice: StateCreator<StoreState, [], [], AICategoriesSlice> = (set) => ({
  aiCategories: {},

  setAiCategories: (categories) => set({ aiCategories: categories }),

  clearAiCategories: () => set({ aiCategories: {} }),
})
