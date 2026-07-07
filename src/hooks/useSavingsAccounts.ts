/**
 * useSavingsAccounts — CRUD hook for spaarpotje (savings account) configuration.
 *
 * Persistence:
 *   - State lives in Zustand (`savingsAccountsState`)
 *   - Every mutation fires a debounced PUT /api/state/spaarpotjes (500 ms window)
 *
 * After every mutation `recategorize()` is called so that all transactions
 * with matching counterpartyIbans are immediately re-labelled.
 */

import { useCallback } from 'react'
import { useStore } from '@/store'
import { randomUUID } from '@/lib/uuid'
import { debouncePut } from '@/lib/serverState'
import type { SavingsAccount } from '@/types/savingsAccount'
import { SPAARPOTJE_COLORS } from '@/types/savingsAccount'

// ─── Storage keys (kept for external consumers that still reference them) ─────

export const STORAGE_KEY_SPAARPOTJES = 'financial-insights:spaarpotjes'
export const STORAGE_KEY_TAG_OVERRIDES = 'financial-insights:tag-overrides'

function generateId(): string {
  return randomUUID()
}

/** Pick a default color that isn't already used by another pot (cycles if all taken). */
function nextColor(existing: SavingsAccount[]): string {
  const used = new Set(existing.map((a) => a.color))
  return SPAARPOTJE_COLORS.find((c) => !used.has(c)) ?? SPAARPOTJE_COLORS[0]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSavingsAccountsResult {
  /** All configured spaarpotjes */
  accounts: SavingsAccount[]

  /** Add a new spaarpotje. `id` and `color` are auto-generated if omitted. */
  addAccount: (account: Omit<SavingsAccount, 'id' | 'color'> & { id?: string; color?: string }) => void

  /** Partially update an existing spaarpotje by id. */
  updateAccount: (id: string, patch: Partial<Omit<SavingsAccount, 'id'>>) => void

  /** Remove a spaarpotje by id. */
  deleteAccount: (id: string) => void
}

export function useSavingsAccounts(): UseSavingsAccountsResult {
  const accounts = useStore((s) => s.savingsAccountsState)
  const setSavingsAccountsState = useStore((s) => s.setSavingsAccountsState)
  const recategorize = useStore((s) => s.recategorize)

  const addAccount = useCallback(
    (partial: Omit<SavingsAccount, 'id' | 'color'> & { id?: string; color?: string }) => {
      const account: SavingsAccount = {
        ...partial,
        id: partial.id ?? generateId(),
        color: partial.color ?? nextColor(accounts),
      }
      const updated = [...accounts, account]
      setSavingsAccountsState(updated)
      debouncePut('spaarpotjes', { accounts: updated })
      recategorize()
    },
    [accounts, setSavingsAccountsState, recategorize],
  )

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<SavingsAccount, 'id'>>) => {
      const updated = accounts.map((a) => (a.id === id ? { ...a, ...patch } : a))
      setSavingsAccountsState(updated)
      debouncePut('spaarpotjes', { accounts: updated })
      recategorize()
    },
    [accounts, setSavingsAccountsState, recategorize],
  )

  const deleteAccount = useCallback(
    (id: string) => {
      const updated = accounts.filter((a) => a.id !== id)
      setSavingsAccountsState(updated)
      debouncePut('spaarpotjes', { accounts: updated })
      recategorize()
    },
    [accounts, setSavingsAccountsState, recategorize],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
