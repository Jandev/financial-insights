import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'

export interface ServerStateSlice {
  // ── State ──────────────────────────────────────────────────────────────────

  /** Timestamp of the last successful write to the Express state API. */
  stateLastSynced: Date | null

  // ── Actions ────────────────────────────────────────────────────────────────

  setStateLastSynced: (date: Date) => void

  /**
   * Replace the current excluded IDs set with the server-hydrated list.
   * Called by useStateSync on mount and during background polling.
   */
  hydrateExclusions: (ids: string[]) => void
}

export const createServerStateSlice: StateCreator<
  StoreState,
  [],
  [],
  ServerStateSlice
> = (set) => ({
  stateLastSynced: null,

  setStateLastSynced: (date) => set({ stateLastSynced: date }),

  hydrateExclusions: (ids) => set({ excludedIds: new Set(ids) }),
})
