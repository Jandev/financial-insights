import type { Transaction } from '@/types/transaction'
import type { BankAdapter } from './types'
import { rabobankAdapter } from './rabobank'

/**
 * The adapter registry.
 *
 * To add support for a new bank, create a new adapter file (e.g. `ing.ts`)
 * and add it here. No other files need to change.
 *
 * Adapters are tried in order; the first match wins.
 */
const registry: BankAdapter[] = [
  rabobankAdapter,
  // ingAdapter,
  // snsAdapter,
]

/**
 * Find the first adapter whose `detect()` returns true for the given file.
 *
 * @param filename  - Base filename (e.g. `CSV_A_NL00RABO..._202406.csv`)
 * @param content   - Full decoded file content (used to inspect the header row)
 */
export function getAdapter(filename: string, content: string): BankAdapter | null {
  const firstLine = content.split('\n')[0] ?? ''
  return registry.find((a) => a.detect(filename, firstLine)) ?? null
}

/**
 * Parse a single file into transactions using the first matching adapter.
 * Returns an empty array and logs a warning if no adapter is found.
 */
export function parseFile(filename: string, content: string): Transaction[] {
  const adapter = getAdapter(filename, content)

  if (!adapter) {
    console.warn(`[parsers] No adapter found for: ${filename}`)
    return []
  }

  return adapter.parse(content, filename)
}

export type { BankAdapter }
