import type { StateCreator } from 'zustand'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'
import { initialLoadingState } from '@/types/loader'
import {
  categorize,
  mergeRules,
  readRulesFromStorage,
  readOverridesFromStorage,
} from '@/lib/categories'
import type { StoreState } from '../useStore'

export interface TransactionSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  transactions: Transaction[]
  loadingState: LoadingState
  /** Ordered log of every CSV file successfully parsed */
  fileLog: LoadedFileEntry[]

  // ── Actions ────────────────────────────────────────────────────────────────
  setTransactions: (transactions: Transaction[]) => void
  setLoadingState: (state: LoadingState) => void
  logFile: (entry: LoadedFileEntry) => void

  /**
   * Re-categorize all transactions using the current rules and overrides from
   * localStorage. Call this after custom rules or manual overrides change so
   * derived selectors (useCategoryTotals etc.) recompute with fresh data.
   */
  recategorize: () => void
}

export const createTransactionSlice: StateCreator<
  StoreState,
  [],
  [],
  TransactionSlice
> = (set, get) => ({
  transactions: [],
  loadingState: initialLoadingState,
  fileLog: [],

  setTransactions: (transactions) => set({ transactions }),

  setLoadingState: (loadingState) => set({ loadingState }),

  logFile: (entry) =>
    set((s) => ({ fileLog: [...s.fileLog, entry] })),

  recategorize: () => {
    const { transactions } = get()
    if (transactions.length === 0) return

    const customRules = readRulesFromStorage()
    const rules = mergeRules(customRules)
    const overrides = readOverridesFromStorage()

    const recategorized = transactions.map((tx) => {
      const category = overrides[tx.id] ?? categorize(tx, rules)
      return category === tx.category ? tx : { ...tx, category }
    })

    set({ transactions: recategorized })
  },
})
