/**
 * usePersonalAccounts — CRUD hook for personal account IBAN configuration.
 *
 * Persistence:
 *   - State lives in Zustand (`personalAccountsState`)
 *   - Every mutation fires a debounced PUT /api/state/personal-accounts (500 ms window)
 *
 * After every mutation `recategorize()` is called so personal-account fallback
 * can be re-applied for transactions still uncategorized after rule matching.
 */

import { useCallback } from 'react'
import { useStore } from '@/store'
import { debouncePut } from '@/lib/serverState'
import type { PersonalAccount } from '@/types/personalAccount'

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
  const accounts = useStore((s) => s.personalAccountsState)
  const setPersonalAccountsState = useStore((s) => s.setPersonalAccountsState)
  const recategorize = useStore((s) => s.recategorize)

  const addAccount = useCallback(
    (account: Omit<PersonalAccount, 'autoDetected'>) => {
      const updated = [...accounts, { ...account, autoDetected: false }]
      setPersonalAccountsState(updated)
      debouncePut('personal-accounts', { accounts: updated })
      recategorize()
    },
    [accounts, setPersonalAccountsState, recategorize],
  )

  const updateAccount = useCallback(
    (iban: string, patch: Partial<Omit<PersonalAccount, 'iban' | 'autoDetected'>>) => {
      const updated = accounts.map((a) =>
        a.iban.toLowerCase() === iban.toLowerCase() ? { ...a, ...patch } : a,
      )
      setPersonalAccountsState(updated)
      debouncePut('personal-accounts', { accounts: updated })
      recategorize()
    },
    [accounts, setPersonalAccountsState, recategorize],
  )

  const deleteAccount = useCallback(
    (iban: string) => {
      const updated = accounts.filter(
        (a) => a.iban.toLowerCase() !== iban.toLowerCase(),
      )
      setPersonalAccountsState(updated)
      debouncePut('personal-accounts', { accounts: updated })
      recategorize()
    },
    [accounts, setPersonalAccountsState, recategorize],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
