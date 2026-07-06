/**
 * usePersonalAccounts — CRUD hook for personal account IBAN configuration.
 *
 * Persistence:
 *   - Primary:  localStorage `financial-insights:personal-accounts`
 *   - Secondary: debounced PUT /api/state/personal-accounts (when Express is available)
 *
 * After every mutation `recategorize()` is called so personal-account fallback
 * can be re-applied for transactions still uncategorized after rule matching.
 *
 * Pattern mirrors `useSavingsAccounts`.
 */

import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import { debouncePut } from '@/lib/serverState'
import {
  readPersonalAccountsFromStorage,
  writePersonalAccountsToStorage,
} from '@/lib/personalAccounts'
import type { PersonalAccount } from '@/types/personalAccount'

// ─── Persistence helpers ──────────────────────────────────────────────────────

function persistAll(accounts: PersonalAccount[]): void {
  writePersonalAccountsToStorage(accounts)
  debouncePut('personal-accounts', { accounts })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePersonalAccountsResult {
  /** All configured personal accounts */
  accounts: PersonalAccount[]

  /** Add a new personal account manually (autoDetected = false). */
  addAccount: (account: Omit<PersonalAccount, 'autoDetected'>) => void

  /** Partially update an existing account by IBAN. */
  updateAccount: (iban: string, patch: Partial<Omit<PersonalAccount, 'iban' | 'autoDetected'>>) => void

  /** Remove an account by IBAN. */
  deleteAccount: (iban: string) => void
}

export function usePersonalAccounts(): UsePersonalAccountsResult {
  const recategorize = useStore((s) => s.recategorize)

  const [accounts, setAccounts] = useState<PersonalAccount[]>(() =>
    readPersonalAccountsFromStorage(),
  )

  // Re-read from localStorage when server hydration writes fresh data.
  useEffect(() => {
    const handler = () => {
      setAccounts(readPersonalAccountsFromStorage())
    }
    window.addEventListener('state-hydrated', handler)
    return () => window.removeEventListener('state-hydrated', handler)
  }, [])

  const addAccount = useCallback(
    (account: Omit<PersonalAccount, 'autoDetected'>) => {
      setAccounts((prev) => {
        const updated = [...prev, { ...account, autoDetected: false }]
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  const updateAccount = useCallback(
    (iban: string, patch: Partial<Omit<PersonalAccount, 'iban' | 'autoDetected'>>) => {
      setAccounts((prev) => {
        const updated = prev.map((a) =>
          a.iban.toLowerCase() === iban.toLowerCase() ? { ...a, ...patch } : a,
        )
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  const deleteAccount = useCallback(
    (iban: string) => {
      setAccounts((prev) => {
        const updated = prev.filter(
          (a) => a.iban.toLowerCase() !== iban.toLowerCase(),
        )
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
