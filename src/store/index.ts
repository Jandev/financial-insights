// ─── Single entry point for the store ────────────────────────────────────────
//
// Always import from '@/store' rather than individual slice files.
// This keeps consumer code stable if the internal structure changes.

// Core store
export { useStore } from './useStore'
export type { StoreState } from './useStore'

// Slice types — useful for typing props and hook return values
export type { TransactionSlice } from './slices/transactionSlice'
export type { ExclusionSlice } from './slices/exclusionSlice'
export type { FilterSlice, Filters } from './slices/filterSlice'
export type { ThemeSlice, Theme } from './slices/themeSlice'
export type { ServerStateSlice } from './slices/serverStateSlice'
export type {
  LLMSlice,
  LLMProvider,
  AICategoryResult,
  AnomalyFinding,
  Severity,
  ChatMessage,
} from './slices/llmSlice'

// Derived selector hooks
export {
  useActiveTransactions,
  useFilteredTransactions,
  useExcludedCount,
  useMonthlyTotals,
  useCategoryTotals,
  useBalanceSeries,
  matchesFilters,
} from './selectors'

// Selector types
export type {
  MonthlyTotal,
  CategoryTotal,
  BalancePoint,
  BalanceSeries,
} from './selectors'
