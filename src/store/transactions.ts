import { create } from 'zustand'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'
import { initialLoadingState } from '@/types/loader'

interface TransactionStore {
  transactions: Transaction[]
  loadingState: LoadingState
  /** Ordered log of every CSV file that was successfully parsed */
  fileLog: LoadedFileEntry[]

  setTransactions: (transactions: Transaction[]) => void
  /** Replace the entire loading state object. */
  setLoadingState: (state: LoadingState) => void
  /** Append one entry to the file log (called once per successfully parsed file). */
  logFile: (entry: LoadedFileEntry) => void
}

/**
 * Minimal transaction store — holds loaded transactions and their loading state.
 *
 * Issue #6 will expand this with exclusion toggles, filters, and persistence.
 */
export const useTransactionStore = create<TransactionStore>()((set) => ({
  transactions: [],
  loadingState: initialLoadingState,
  fileLog: [],

  setTransactions: (transactions) => set({ transactions }),
  setLoadingState: (loadingState) => set({ loadingState }),
  logFile: (entry) => set((s) => ({ fileLog: [...s.fileLog, entry] })),
}))
