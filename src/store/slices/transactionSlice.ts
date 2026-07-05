import type { StateCreator } from 'zustand'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'
import { initialLoadingState } from '@/types/loader'
import {
  categorize,
  mergeRules,
  readRulesFromStorage,
  readOverridesFromStorage,
  matchSpaarpotje,
} from '@/lib/categories'
import {
  readSavingsAccountsFromStorage,
  readTagOverridesFromStorage,
} from '@/hooks/useSavingsAccounts'
import type { StoreState } from '../useStore'

export interface TransactionSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  transactions: Transaction[]
  loadingState: LoadingState
  /** Ordered log of every CSV file successfully parsed */
  fileLog: LoadedFileEntry[]
  /** Incremented to trigger a fresh CSV reload (e.g. "Hard CSV refresh") */
  csvLoadKey: number

  // ── Actions ────────────────────────────────────────────────────────────────
  setTransactions: (transactions: Transaction[]) => void
  setLoadingState: (state: LoadingState) => void
  logFile: (entry: LoadedFileEntry) => void
  /** Bump csvLoadKey to trigger useTransactionLoader to reload CSV data. */
  bumpCsvLoadKey: () => void

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
  csvLoadKey: 0,

  setTransactions: (transactions) => set({ transactions }),

  setLoadingState: (loadingState) => set({ loadingState }),

  logFile: (entry) =>
    set((s) => ({ fileLog: [...s.fileLog, entry] })),

  bumpCsvLoadKey: () =>
    set((s) => ({ csvLoadKey: s.csvLoadKey + 1, fileLog: [] })),

  recategorize: () => {
    const { transactions } = get()
    if (transactions.length === 0) return

    const customRules = readRulesFromStorage()
    const rules = mergeRules(customRules)
    const overrides = readOverridesFromStorage()
    const spaarpotjes = readSavingsAccountsFromStorage()
    const tagOverrides = readTagOverridesFromStorage()

    const recategorized = transactions.map((tx) => {
      // 1. Spaarpotje IBAN match — highest priority, overrides all rules
      const potMatch = matchSpaarpotje(tx, spaarpotjes)
      if (potMatch) {
        const tags = tagOverrides[tx.id] ?? [potMatch.tag]
        return { ...tx, category: potMatch.category, tags }
      }

      // 2. Manual category override, then rule-based categorization
      const category = overrides[tx.id] ?? categorize(tx, rules)
      const tags = tagOverrides[tx.id] ?? []

      return category === tx.category && tags.length === 0 && (tx.tags ?? []).length === 0
        ? tx
        : { ...tx, category, tags }
    })

    set({ transactions: recategorized })
  },
})
