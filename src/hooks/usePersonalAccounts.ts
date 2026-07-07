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

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useStore } from '@/store'
import { createPersistFns } from '@/lib/persistence'
import { useStorageHydration } from '@/hooks/useStorageHydration'
import {
  STORAGE_KEY_PERSONAL_ACCOUNTS,
  readPersonalAccountsFromStorage,
} from '@/lib/personalAccounts'
import type { PersonalAccount } from '@/types/personalAccount'

// ─── Persistence helpers ──────────────────────────────────────────────────────

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
  const setPersonalAccountsState = useStore((s) => s.setPersonalAccountsState)

  const { persistAll } = useMemo(
    () => createPersistFns<PersonalAccount[]>(STORAGE_KEY_PERSONAL_ACCOUNTS, 'personal-accounts', 'accounts'),
    [],
  )

  const [accounts, setAccounts] = useState<PersonalAccount[]>(() =>
    readPersonalAccountsFromStorage(),
  )

  useEffect(() => {
    setPersonalAccountsState(accounts)
  }, [accounts, setPersonalAccountsState])

  // Re-read from localStorage when server hydration writes fresh data.
  useStorageHydration(readPersonalAccountsFromStorage, (next) => {
    setAccounts(next)
    setPersonalAccountsState(next)
  })

  const addAccount = useCallback(
    (account: Omit<PersonalAccount, 'autoDetected'>) => {
      const updated = [...accounts, { ...account, autoDetected: false }]
      setAccounts(updated)
      persistAll(updated)
      setPersonalAccountsState(updated)
      recategorize()
    },
    [accounts, persistAll, recategorize, setPersonalAccountsState],
  )

  const updateAccount = useCallback(
    (iban: string, patch: Partial<Omit<PersonalAccount, 'iban' | 'autoDetected'>>) => {
      const updated = accounts.map((a) =>
        a.iban.toLowerCase() === iban.toLowerCase() ? { ...a, ...patch } : a,
      )
      setAccounts(updated)
      persistAll(updated)
      setPersonalAccountsState(updated)
      recategorize()
    },
    [accounts, persistAll, recategorize, setPersonalAccountsState],
  )

  const deleteAccount = useCallback(
    (iban: string) => {
      const updated = accounts.filter(
        (a) => a.iban.toLowerCase() !== iban.toLowerCase(),
      )
      setAccounts(updated)
      persistAll(updated)
      setPersonalAccountsState(updated)
      recategorize()
    },
    [accounts, persistAll, recategorize, setPersonalAccountsState],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
