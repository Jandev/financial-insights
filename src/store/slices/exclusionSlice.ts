import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'

export interface ExclusionSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  /** Set of transaction IDs hidden from charts and totals */
  excludedIds: Set<string>

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Toggle the excluded state of a single transaction */
  toggleExclusion: (id: string) => void

  /** Exclude multiple transactions at once */
  bulkExclude: (ids: string[]) => void

  /** Restore all exclusions globally (not filter-scoped) */
  restoreAll: () => void

  /**
   * Restore exclusions for a specific subset of IDs only.
   * Used by the table's "Restore all" button which operates on the
   * currently-filtered rows only, leaving other exclusions untouched.
   */
  restoreFiltered: (ids: string[]) => void
}

export const createExclusionSlice: StateCreator<
  StoreState,
  [],
  [],
  ExclusionSlice
> = (set) => ({
  excludedIds: new Set(),

  toggleExclusion: (id) =>
    set((s) => {
      const next = new Set(s.excludedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { excludedIds: next }
    }),

  bulkExclude: (ids) =>
    set((s) => {
      const next = new Set(s.excludedIds)
      ids.forEach((id) => next.add(id))
      return { excludedIds: next }
    }),

  restoreAll: () => set({ excludedIds: new Set() }),

  restoreFiltered: (ids) =>
    set((s) => {
      const next = new Set(s.excludedIds)
      ids.forEach((id) => next.delete(id))
      return { excludedIds: next }
    }),
})
