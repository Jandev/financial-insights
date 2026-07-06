/**
 * Non-React storage helpers for personal accounts.
 * Safe to call from csvLoader.ts (outside React render cycle).
 *
 * Personal accounts are manually configured only. IBANs are no longer
 * auto-detected from Rabobank `tb` transfers — users must add them explicitly
 * in Settings → Personal Accounts.
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
