import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'
import type { LLMProvider } from './llmTypes'

export interface LLMStatusSlice {
  llmAvailable: boolean
  llmProvider: LLMProvider | null
  llmModel: string | null
  checkLLMStatus: () => Promise<void>
  setLLMStatusDirect: (data: { available: boolean; provider: LLMProvider | null; model: string | null }) => void
}

export const createLLMStatusSlice: StateCreator<StoreState, [], [], LLMStatusSlice> = (set) => ({
  llmAvailable: false,
  llmProvider: null,
  llmModel: null,

  checkLLMStatus: async () => {
    try {
      const res = await fetch('/api/llm/status')
      if (!res.ok) {
        set({ llmAvailable: false, llmProvider: null, llmModel: null })
        return
      }

      const data = (await res.json()) as {
        available: boolean
        provider: LLMProvider | null
        model: string | null
      }

      set({
        llmAvailable: data.available,
        llmProvider: data.provider,
        llmModel: data.model,
      })
    } catch {
      set({ llmAvailable: false, llmProvider: null, llmModel: null })
    }
  },

  setLLMStatusDirect: (data) =>
    set({
      llmAvailable: data.available,
      llmProvider: data.provider,
      llmModel: data.model,
    }),
})
