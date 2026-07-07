import type { StateCreator } from 'zustand'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'
import { initialLoadingState } from '@/types/loader'
import {
  buildCategorizedTransactions,
  type CategoryOverrides,
  type CategoryRule,
} from '@/lib/categories'
import type { SavingsAccount } from '@/types/savingsAccount'
import type { PersonalAccount } from '@/types/personalAccount'
import type { StoreState } from '../useStore'

export interface TransactionSlice {
  // ── State ──────────────────────────────────────────────────────────────────
  transactions: Transaction[]
  loadingState: LoadingState
  /** Ordered log of every CSV file successfully parsed */
  fileLog: LoadedFileEntry[]
  /** Incremented to trigger a fresh CSV reload (e.g. "Hard CSV refresh") */
  csvLoadKey: number

  /** Categorization dependencies synced by hooks/hydration. */
  categorizationRules: CategoryRule[]
  categoryOverridesState: CategoryOverrides
  savingsAccountsState: SavingsAccount[]
  tagOverridesState: Record<string, string[]>
  personalAccountsState: PersonalAccount[]

  // ── Actions ────────────────────────────────────────────────────────────────
  setTransactions: (transactions: Transaction[]) => void
  setLoadingState: (state: LoadingState) => void
  logFile: (entry: LoadedFileEntry) => void
  /** Bump csvLoadKey to trigger useTransactionLoader to reload CSV data. */
  bumpCsvLoadKey: () => void
  setCategorizationRules: (rules: CategoryRule[]) => void
  setCategoryOverridesState: (overrides: CategoryOverrides) => void
  setSavingsAccountsState: (accounts: SavingsAccount[]) => void
  setTagOverridesState: (overrides: Record<string, string[]>) => void
  setPersonalAccountsState: (accounts: PersonalAccount[]) => void

  /**
   * Re-categorize all transactions using current categorization inputs from
   * Zustand state. Call this after rules, overrides, or account settings
   * change so derived selectors recompute with fresh data.
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
  categorizationRules: [],
  categoryOverridesState: {},
  savingsAccountsState: [],
  tagOverridesState: {},
  personalAccountsState: [],

  setTransactions: (transactions) => set({ transactions }),

  setLoadingState: (loadingState) => set({ loadingState }),

  logFile: (entry) =>
    set((s) => ({ fileLog: [...s.fileLog, entry] })),

  bumpCsvLoadKey: () =>
    set((s) => ({ csvLoadKey: s.csvLoadKey + 1, fileLog: [] })),

  setCategorizationRules: (categorizationRules) => set({ categorizationRules }),

  setCategoryOverridesState: (categoryOverridesState) => set({ categoryOverridesState }),

  setSavingsAccountsState: (savingsAccountsState) => set({ savingsAccountsState }),

  setTagOverridesState: (tagOverridesState) => set({ tagOverridesState }),

  setPersonalAccountsState: (personalAccountsState) => set({ personalAccountsState }),

  recategorize: () => {
    const {
      transactions,
      categorizationRules,
      categoryOverridesState,
      savingsAccountsState,
      tagOverridesState,
      personalAccountsState,
    } = get()

    if (transactions.length === 0) return

    const recategorized = buildCategorizedTransactions(transactions, {
      rules: categorizationRules,
      overrides: categoryOverridesState,
      savingsAccounts: savingsAccountsState,
      tagOverrides: tagOverridesState,
      personalAccounts: personalAccountsState,
    })

    set({ transactions: recategorized })
  },
})
