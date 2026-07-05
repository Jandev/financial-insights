import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createTransactionSlice, type TransactionSlice } from './slices/transactionSlice'
import { createExclusionSlice, type ExclusionSlice } from './slices/exclusionSlice'
import { createFilterSlice, type FilterSlice } from './slices/filterSlice'
import { createThemeSlice, applyThemeClass, type ThemeSlice } from './slices/themeSlice'
import { createServerStateSlice, type ServerStateSlice } from './slices/serverStateSlice'
import { createLLMSlice, type LLMSlice } from './slices/llmSlice'

// ─── Composed store type ──────────────────────────────────────────────────────

export type StoreState = TransactionSlice & ExclusionSlice & FilterSlice & ThemeSlice & ServerStateSlice & LLMSlice

// ─── Persisted shape ──────────────────────────────────────────────────────────
// Only these fields survive a browser refresh. Everything else resets to defaults.

interface PersistedShape {
  excludedIds: string[]        // Set → Array for JSON serialization
  theme: 'light' | 'dark'
  dismissedFindingIds: string[] // Set → Array for JSON serialization
  insightCache: Record<string, string>
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
      ...createLLMSlice(...args),
    }),
    {
      name: 'financial-insights:store',

      // Only persist exclusions and theme — transactions are loaded fresh each
      // session; filters reset intentionally on refresh. Server state fields are
      // runtime-only (determined on startup via /api/state/summary fetch).
      partialize: (state): PersistedShape => ({
        excludedIds: [...state.excludedIds],
        theme: state.theme,
        dismissedFindingIds: [...state.dismissedFindingIds],
        insightCache: state.insightCache,
      }),

      // Rehydrate: convert serialized Arrays back to Sets and re-apply theme class
      merge: (persisted, current) => {
        const p = persisted as PersistedShape
        const rehydrated: StoreState = {
          ...current,
          excludedIds: new Set(p.excludedIds ?? []),
          theme: p.theme ?? 'light',
          dismissedFindingIds: new Set(p.dismissedFindingIds ?? []),
          insightCache: p.insightCache ?? {},
        }
        return rehydrated
      },

      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme)
      },
    },
  ),
)
