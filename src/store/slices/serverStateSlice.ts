import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'

export interface ServerStateSlice {
  // ── State ──────────────────────────────────────────────────────────────────

  /**
   * Set on startup based on whether /api/state/summary responds successfully.
   * When false the app falls back to localStorage for all persistence.
   */
  serverStateAvailable: boolean

  /** Timestamp of the last successful write to the Express state API. */
  stateLastSynced: Date | null

  // ── Actions ────────────────────────────────────────────────────────────────

  setServerStateAvailable: (available: boolean) => void
  setStateLastSynced: (date: Date) => void

  /**
   * Replace the current excluded IDs set with the server-hydrated list.
   * Called once on startup by useStateHydration.
   */
  hydrateExclusions: (ids: string[]) => void
}

export const createServerStateSlice: StateCreator<
  StoreState,
  [],
  [],
  ServerStateSlice
> = (set) => ({
  serverStateAvailable: false,
  stateLastSynced: null,

  setServerStateAvailable: (available) => set({ serverStateAvailable: available }),
  setStateLastSynced: (date) => set({ stateLastSynced: date }),

  hydrateExclusions: (ids) => set({ excludedIds: new Set(ids) }),
})
