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

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useStore } from '@/store'
import { randomUUID } from '@/lib/uuid'
import { createPersistFns } from '@/lib/persistence'
import { useStorageHydration } from '@/hooks/useStorageHydration'
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
  const setSavingsAccountsState = useStore((s) => s.setSavingsAccountsState)
  const setTagOverridesState = useStore((s) => s.setTagOverridesState)

  const { persistAll } = useMemo(
    () => createPersistFns<SavingsAccount[]>(STORAGE_KEY_SPAARPOTJES, 'spaarpotjes', 'accounts'),
    [],
  )

  const [accounts, setAccounts] = useState<SavingsAccount[]>(() =>
    readSavingsAccountsFromStorage(),
  )

  useEffect(() => {
    setSavingsAccountsState(accounts)
  }, [accounts, setSavingsAccountsState])

  useEffect(() => {
    setTagOverridesState(readTagOverridesFromStorage())
  }, [setTagOverridesState])

  // Re-read from localStorage when server hydration writes fresh data.
  useStorageHydration(readSavingsAccountsFromStorage, (next) => {
    setAccounts(next)
    setSavingsAccountsState(next)
  })

  // Tag overrides are hydration-only today; keep store in sync for recategorize.
  useStorageHydration(readTagOverridesFromStorage, setTagOverridesState)

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
        setSavingsAccountsState(updated)
        return updated
      })
      recategorize()
    },
    [persistAll, recategorize, setSavingsAccountsState],
  )

  const updateAccount = useCallback(
    (id: string, patch: Partial<Omit<SavingsAccount, 'id'>>) => {
      setAccounts((prev) => {
        const updated = prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
        persistAll(updated)
        setSavingsAccountsState(updated)
        return updated
      })
      recategorize()
    },
    [persistAll, recategorize, setSavingsAccountsState],
  )

  const deleteAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => {
        const updated = prev.filter((a) => a.id !== id)
        persistAll(updated)
        setSavingsAccountsState(updated)
        return updated
      })
      recategorize()
    },
    [persistAll, recategorize, setSavingsAccountsState],
  )

  return { accounts, addAccount, updateAccount, deleteAccount }
}
