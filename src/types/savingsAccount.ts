/**
 * A named savings account (Spaarpotje) registered by the user.
 *
 * Transactions to/from `iban` are automatically assigned:
 *   - Outbound (amount < 0): category `spaarpotje`, tag = `name`
 *   - Inbound  (amount > 0): category `spaarpotje-withdrawal`, tag = `name`
 *
 * Persisted to localStorage (`financial-insights:spaarpotjes`) and synced to
 * the Express state API (`/api/state/spaarpotjes`) when available.
 */
export interface SavingsAccount {
  /** Stable id generated with crypto.randomUUID() */
  id: string
  /** Human-readable name, e.g. "Vakantie" or "Noodfonds" */
  name: string
  /** Counterparty IBAN to match — case-insensitive comparison */
  iban: string
  /** Hex color from the app's predefined palette for chart/badge display */
  color: string
}

/**
 * Predefined color palette for spaarpotjes.
 * Aligned with the macOS system palette used elsewhere in the app.
 */
export const SPAARPOTJE_COLORS = [
  '#00C7BE', // teal  (matches income)
  '#34C759', // green
  '#007AFF', // blue
  '#AF52DE', // purple
  '#FF9500', // orange
  '#FF3B30', // red
  '#A2845E', // brown
  '#5856D6', // indigo
] as const

export type SpaarpotjeColor = (typeof SPAARPOTJE_COLORS)[number]
