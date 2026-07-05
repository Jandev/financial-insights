import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'

export type Theme = 'light' | 'dark'

export interface ThemeSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  theme: Theme

  // ── Actions ────────────────────────────────────────────────────────────────
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const createThemeSlice: StateCreator<
  StoreState,
  [],
  [],
  ThemeSlice
> = (set, get) => ({
  theme: 'light',

  setTheme: (theme) => {
    set({ theme })
    applyThemeClass(theme)
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    set({ theme: next })
    applyThemeClass(next)
  },
})

/** Apply / remove the `.dark` class on `<html>` to drive CSS variable switching. */
export function applyThemeClass(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
