/**
 * Non-React storage helpers for personal accounts.
 * Safe to call from csvLoader.ts (outside React render cycle).
 */

import type { PersonalAccount } from '@/types/personalAccount'

export const STORAGE_KEY_PERSONAL_ACCOUNTS = 'financial-insights:personal-accounts'

/**
 * Read personal accounts from localStorage.
 * Returns an empty array when nothing is stored or the value is unparseable.
 */
export function readPersonalAccountsFromStorage(): PersonalAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PERSONAL_ACCOUNTS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PersonalAccount[]) : []
  } catch {
    return []
  }
}

/**
 * Write personal accounts to localStorage.
 */
export function writePersonalAccountsToStorage(accounts: PersonalAccount[]): void {
  localStorage.setItem(STORAGE_KEY_PERSONAL_ACCOUNTS, JSON.stringify(accounts))
}

/**
 * Seed new auto-detected IBANs from Rabobank `tb` transactions into storage.
 * Only adds IBANs not already present. Ignores empty/blank strings.
 * Returns true if storage was updated (new accounts were added).
 */
export function seedAutoDetectedIbans(ibans: string[]): boolean {
  const current = readPersonalAccountsFromStorage()
  const existing = new Set(current.map((a) => a.iban.toLowerCase()))
  const newAccounts: PersonalAccount[] = []

  for (const iban of ibans) {
    const normalized = iban.trim()
    if (!normalized || existing.has(normalized.toLowerCase())) continue
    newAccounts.push({
      iban: normalized,
      label: '',
      type: 'payment',
      autoDetected: true,
      enabled: true,
    })
  }

  if (newAccounts.length === 0) return false
  writePersonalAccountsToStorage([...current, ...newAccounts])
  return true
}
