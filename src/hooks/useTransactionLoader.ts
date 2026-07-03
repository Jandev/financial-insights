import { useEffect, useRef } from 'react'
import { loadAllTransactions } from '@/lib/csvLoader'
import { useTransactionStore } from '@/store/transactions'
import type { LoadingState } from '@/types/loader'

/**
 * Triggers CSV loading on mount and writes results + progress into the
 * transaction store. Loading fires exactly once per app session.
 *
 * Render a `<LoadingScreen>` while `loadingState.status` is `'idle'` or
 * `'loading'`; switch to the main layout when it becomes `'success'` or
 * `'error'`.
 *
 * @returns `{ loadingState }` — same object as `useTransactionStore().loadingState`
 */
export function useTransactionLoader() {
  const { loadingState, setTransactions, setLoadingState, logFile } = useTransactionStore()

  // Guard against React Strict Mode double-invocation and re-renders
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    setLoadingState({
      status: 'loading',
      fileCount: 0,
      loadedFiles: 0,
      rowCount: 0,
      currentFile: null,
      errors: [],
    })

    loadAllTransactions(
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
  }, [setTransactions, setLoadingState, logFile])

  return { loadingState }
}
