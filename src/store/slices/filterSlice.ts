import type { StateCreator } from 'zustand'
import type { TransactionCode } from '@/types/transaction'
import type { StoreState } from '../useStore'

export interface Filters {
  /** Substring search against counterpartyName + description */
  search: string
  dateFrom: Date | null
  dateTo: Date | null
  /** Category IDs to include; empty = all */
  categories: string[]
  /** Transaction codes to include; empty = all */
  transactionCodes: TransactionCode[]
  amountMin: number | null
  amountMax: number | null
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  dateFrom: null,
  dateTo: null,
  categories: [],
  transactionCodes: [],
  amountMin: null,
  amountMax: null,
}

export interface FilterSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  /**
   * Active filter state. NOT persisted — resets to defaults on page refresh.
   * Filters control which transactions are included in charts, KPIs, and tables.
   */
  filters: Filters

  // ── Actions ────────────────────────────────────────────────────────────────
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  clearFilters: () => void
}

export const createFilterSlice: StateCreator<
  StoreState,
  [],
  [],
  FilterSlice
> = (set) => ({
  filters: { ...DEFAULT_FILTERS },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  clearFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
})
