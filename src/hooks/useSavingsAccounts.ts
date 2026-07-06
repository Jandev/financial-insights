/**
 * useSavingsAccounts — CRUD hook for spaarpotje (savings account) configuration.
 *
 * Persistence:
 *   - Primary:  localStorage `financial-insights:spaarpotjes`
 *   - Secondary: debounced PUT /api/state/spaarpotjes (when Express is available)
 *
 * After every mutation `recategorize()` is called so that all transactions
 * with matching counterpartyIbans are immediately re-labelled.
 *
 * Pattern mirrors `useCategoryRules`.
 */

import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import { debouncePut } from '@/lib/serverState'
import { randomUUID } from '@/lib/uuid'
import type { SavingsAccount } from '@/types/savingsAccount'
import { SPAARPOTJE_COLORS } from '@/types/savingsAccount'

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEY_SPAARPOTJES = 'financial-insights:spaarpotjes'
export const STORAGE_KEY_TAG_OVERRIDES = 'financial-insights:tag-overrides'

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function readSavingsAccountsFromStorage(): SavingsAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SPAARPOTJES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavingsAccount[]) : []
  } catch {
    return []
  }
}

export function readTagOverridesFromStorage(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TAG_OVERRIDES)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string[]>)
      : {}
  } catch {
    return {}
  }
}

function persistLocal(accounts: SavingsAccount[]): void {
  localStorage.setItem(STORAGE_KEY_SPAARPOTJES, JSON.stringify(accounts))
}

function persistAll(accounts: SavingsAccount[]): void {
  persistLocal(accounts)
  debouncePut('spaarpotjes', { accounts })
}

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
  const recategorize = useStore((s) => s.recategorize)

  const [accounts, setAccounts] = useState<SavingsAccount[]>(() =>
    readSavingsAccountsFromStorage(),
  )

  // Re-read from localStorage when server hydration writes fresh data.
  useEffect(() => {
    const handler = () => {
      setAccounts(readSavingsAccountsFromStorage())
    }
    window.addEventListener('state-hydrated', handler)
    return () => window.removeEventListener('state-hydrated', handler)
  }, [])

  const addAccount = useCallback(
    (partial: Omit<SavingsAccount, 'id' | 'color'> & { id?: string; color?: string }) => {
      setAccounts((prev) => {
        const account: SavingsAccount = {
          ...partial,
          id: partial.id ?? generateId(),
          color: partial.color ?? nextColor(prev),
        }
        const updated = [...prev, account]
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<SavingsAccount, 'id'>>) => {
      setAccounts((prev) => {
        const updated = prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  const deleteAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => {
        const updated = prev.filter((a) => a.id !== id)
        persistAll(updated)
        return updated
      })
      recategorize()
    },
    [recategorize],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
