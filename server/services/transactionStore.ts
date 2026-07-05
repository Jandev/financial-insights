/**
 * Server-side in-memory transaction store — issue #17.
 *
 * Populated by POST /api/llm/transactions/sync whenever the frontend
 * loads (or reloads) its CSV data, or after AI recategorization updates
 * categories. All LLM services (#18, #19, #20, #21) read from here.
 *
 * This store deliberately holds a lean snapshot — no IBANs, no raw
 * descriptions beyond what's needed for LLM context.
 */

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

// ─── Module-level store ───────────────────────────────────────────────────────

let _transactions: TxSnapshot[] = []
let _loadedAt: Date | null = null

export function setTransactions(txs: TxSnapshot[]): void {
  _transactions = txs
  _loadedAt = new Date()
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
