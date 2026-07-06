import { useEffect, useRef } from 'react'
import { loadAllTransactions } from '@/lib/csvLoader'
import { readRulesFromStorage, readOverridesFromStorage } from '@/lib/categories'
import { readPersonalAccountsFromStorage } from '@/lib/personalAccounts'
import { readSavingsAccountsFromStorage } from '@/hooks/useSavingsAccounts'
import { useStore } from '@/store'
import type { LoadingState } from '@/types/loader'

/**
 * Triggers CSV loading and writes results + progress into the store.
 *
 * Fires once on mount, then again each time `csvLoadKey` is bumped
 * (via `bumpCsvLoadKey()` — e.g. the "Hard CSV refresh" button in Settings).
 *
 * The `hasStartedForKey` ref prevents StrictMode double-execution from
 * triggering two concurrent loads for the same key.
 *
 * In dev (Vite glob), a reload re-parses the same compile-time file set and
 * applies fresh categorization rules. In prod (Express), `/api/transactions`
 * re-reads the filesystem so newly added CSV files are picked up.
 *
 * @returns `{ loadingState }` — same object as `useStore().loadingState`
 */
export function useTransactionLoader() {
  const {
    loadingState,
    csvLoadKey,
    setTransactions,
    setLoadingState,
    logFile,
    setCategorizationRules,
    setCategoryOverridesState,
    setSavingsAccountsState,
    setPersonalAccountsState,
  } = useStore()

  // Tracks which csvLoadKey was last started — prevents double-fire in StrictMode
  const hasStartedForKey = useRef<number>(-1)

  useEffect(() => {
    if (hasStartedForKey.current === csvLoadKey) return
    hasStartedForKey.current = csvLoadKey

    setLoadingState({
      status: 'loading',
      fileCount: 0,
      loadedFiles: 0,
      rowCount: 0,
      currentFile: null,
      errors: [],
    })

    const rules = readRulesFromStorage()
    const overrides = readOverridesFromStorage()
    const savingsAccounts = readSavingsAccountsFromStorage()
    const personalAccounts = readPersonalAccountsFromStorage()

    setCategorizationRules(rules)
    setCategoryOverridesState(overrides)
    setSavingsAccountsState(savingsAccounts)
    setPersonalAccountsState(personalAccounts)

    loadAllTransactions(
      {
        rules,
        overrides,
        personalAccounts,
        savingsAccounts,
      },
      (progress: LoadingState) => setLoadingState(progress),
      (entry) => logFile(entry),
    )
      .then((txns) => setTransactions(txns))
      .catch((err: unknown) => {
        setLoadingState({
          status: 'error',
          fileCount: 0,
          loadedFiles: 0,
          rowCount: 0,
          currentFile: null,
          errors: [err instanceof Error ? err.message : String(err)],
        })
      })
  }, [csvLoadKey, setTransactions, setLoadingState, logFile, setCategorizationRules, setCategoryOverridesState, setSavingsAccountsState, setPersonalAccountsState])

  return { loadingState }
}
