import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createTransactionSlice, type TransactionSlice } from './slices/transactionSlice'
import { createExclusionSlice, type ExclusionSlice } from './slices/exclusionSlice'
import { createFilterSlice, type FilterSlice } from './slices/filterSlice'
import { createThemeSlice, applyThemeClass, type ThemeSlice } from './slices/themeSlice'
import { createServerStateSlice, type ServerStateSlice } from './slices/serverStateSlice'
import { createLLMStatusSlice, type LLMStatusSlice } from './slices/llmStatusSlice'
import { createAICategoriesSlice, type AICategoriesSlice } from './slices/aiCategoriesSlice'
import { createAnomalySlice, type AnomalySlice } from './slices/anomalySlice'
import { createInsightSlice, type InsightSlice } from './slices/insightSlice'
import { createChatSlice, type ChatSlice } from './slices/chatSlice'

// ─── Composed store type ──────────────────────────────────────────────────────

export type StoreState =
  TransactionSlice &
  ExclusionSlice &
  FilterSlice &
  ThemeSlice &
  ServerStateSlice &
  LLMStatusSlice &
  AICategoriesSlice &
  AnomalySlice &
  InsightSlice &
  ChatSlice

// ─── Persisted shape ──────────────────────────────────────────────────────────
// Only these fields survive a browser refresh. Everything else resets to
// defaults and is re-hydrated from the server on mount by useStateSync.

interface PersistedShape {
  theme: 'light' | 'dark'
  dismissedFindingIds: string[] // Set → Array for JSON serialization
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStore = create<StoreState>()(
  persist(
    (...args) => ({
      ...createTransactionSlice(...args),
      ...createExclusionSlice(...args),
      ...createFilterSlice(...args),
      ...createThemeSlice(...args),
      ...createServerStateSlice(...args),
      ...createLLMStatusSlice(...args),
      ...createAICategoriesSlice(...args),
      ...createAnomalySlice(...args),
      ...createInsightSlice(...args),
      ...createChatSlice(...args),
    }),
    {
      name: 'financial-insights:store',

      // Only persist UI preferences — all app state is re-hydrated from the
      // server on mount (issue #70).
      partialize: (state): PersistedShape => ({
        theme: state.theme,
        dismissedFindingIds: [...state.dismissedFindingIds],
      }),

      // Rehydrate: convert serialized Arrays back to Sets and re-apply theme class
      merge: (persisted, current) => {
        const p = persisted as PersistedShape
        const rehydrated: StoreState = {
          ...current,
          theme: p.theme ?? 'light',
          dismissedFindingIds: new Set(p.dismissedFindingIds ?? []),
        }
        return rehydrated
      },

      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme)
      },
    },
  ),
)
