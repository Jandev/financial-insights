/**
 * Server-side in-memory transaction store — issue #17.
 *
 * Populated by POST /api/llm/transactions/sync whenever the frontend
 * loads (or reloads) its CSV data, or after AI recategorization updates
 * categories. All LLM services (#18, #19, #20, #21) read from here.
 *
 * This store deliberately holds a lean snapshot — no IBANs, no raw
 * descriptions beyond what's needed for LLM context.
 *
 * Persistence (Option C): setTransactions() asynchronously writes the
 * snapshot to data/state/transactions.json via StateStore so the store
 * survives server restarts. loadFromDisk() is called at startup to
 * pre-populate _transactions before any LLM request arrives.
 */

import type { StateStore } from './stateStore.js'

export interface TxSnapshot {
  id: string
  date: string          // ISO date string YYYY-MM-DD
  amount: number        // positive = credit, negative = debit
  balanceAfter: number
  counterpartyName: string
  description: string
  transactionCode: string
  category: string      // effective category (AI override or rule-based)
}

const PERSISTENCE_KEY = 'transactions'

// ─── Module-level store ───────────────────────────────────────────────────────

let _transactions: TxSnapshot[] = []
let _loadedAt: Date | null = null

export function setTransactions(txs: TxSnapshot[], stateStore?: StateStore): void {
  _transactions = txs
  _loadedAt = new Date()

  if (stateStore) {
    // Fire-and-forget — don't block the sync response on disk I/O
    stateStore.write<TxSnapshot[]>(PERSISTENCE_KEY, txs).catch((err) => {
      console.warn('[transactionStore] Failed to persist to disk:', err)
    })
  }
}

/**
 * Load transactions from disk into the in-memory store.
 * Called once at server startup so the store is pre-populated before
 * any LLM request arrives (survives server restarts).
 */
export async function loadFromDisk(stateStore: StateStore): Promise<void> {
  try {
    const txs = await stateStore.read<TxSnapshot[]>(PERSISTENCE_KEY)
    if (Array.isArray(txs) && txs.length > 0) {
      _transactions = txs
      _loadedAt = new Date()
      console.log(`[transactionStore] Loaded ${txs.length} transactions from disk`)
    }
  } catch (err) {
    console.warn('[transactionStore] Could not load transactions from disk:', err)
  }
}

export function getTransactions(): TxSnapshot[] {
  return _transactions
}

export function getLoadedAt(): Date | null {
  return _loadedAt
}

export function getCount(): number {
  return _transactions.length
}

export function isLoaded(): boolean {
  return _transactions.length > 0
}

// ─── Query helpers used by LLM services ──────────────────────────────────────

/** Transactions in a given month (YYYY-MM) */
export function getByMonth(period: string): TxSnapshot[] {
  return _transactions.filter((tx) => tx.date.startsWith(period))
}

/** Transactions in a given year (YYYY) */
export function getByYear(year: string): TxSnapshot[] {
  return _transactions.filter((tx) => tx.date.startsWith(year))
}

/** All transactions in a date range (inclusive) */
export function getByDateRange(startDate: string, endDate: string): TxSnapshot[] {
  return _transactions.filter((tx) => tx.date >= startDate && tx.date <= endDate)
}

/** Unique months present in the store, sorted ascending */
export function getAvailableMonths(): string[] {
  const months = new Set(_transactions.map((tx) => tx.date.slice(0, 7)))
  return [...months].sort()
}
