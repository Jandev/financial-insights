import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createTransactionSlice, type TransactionSlice } from './slices/transactionSlice'
import { createExclusionSlice, type ExclusionSlice } from './slices/exclusionSlice'
import { createFilterSlice, type FilterSlice } from './slices/filterSlice'
import { createThemeSlice, applyThemeClass, type ThemeSlice } from './slices/themeSlice'

// ─── Composed store type ──────────────────────────────────────────────────────

export type StoreState = TransactionSlice & ExclusionSlice & FilterSlice & ThemeSlice

// ─── Persisted shape ──────────────────────────────────────────────────────────
// Only these fields survive a browser refresh. Everything else resets to defaults.

interface PersistedShape {
  excludedIds: string[]   // Set → Array for JSON serialization
  theme: 'light' | 'dark'
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStore = create<StoreState>()(
  persist(
    (...args) => ({
      ...createTransactionSlice(...args),
      ...createExclusionSlice(...args),
      ...createFilterSlice(...args),
      ...createThemeSlice(...args),
    }),
    {
      name: 'financial-insights:store',

      // Only persist exclusions and theme — transactions are loaded fresh each
      // session; filters reset intentionally on refresh.
      partialize: (state): PersistedShape => ({
        excludedIds: [...state.excludedIds],
        theme: state.theme,
      }),

      // Rehydrate: convert serialized Array back to Set and re-apply theme class
      merge: (persisted, current) => {
        const p = persisted as PersistedShape
        const rehydrated: StoreState = {
          ...current,
          excludedIds: new Set(p.excludedIds ?? []),
          theme: p.theme ?? 'light',
        }
        return rehydrated
      },

      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme)
      },
    },
  ),
)
