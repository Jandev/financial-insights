/**
 * A personal account IBAN registered by the user.
 *
 * Transactions to/from `iban` are automatically assigned category
 * `internal-transfer` and shown distinctly in the UI. They still count
 * toward income/expense totals (unlike spaarpotjes).
 *
 * Auto-detected entries are seeded from Rabobank `tb` (own-bank-transfer)
 * counterparty IBANs on first CSV load. Users can disable or delete them.
 *
 * Persisted to localStorage (`financial-insights:personal-accounts`) and
 * synced to the Express state API (`/api/state/personal-accounts`) when
 * available.
 */
export interface PersonalAccount {
  /** Counterparty IBAN to match — case-insensitive comparison */
  iban: string
  /** User-editable nickname, e.g. "Boodschappenrekening" */
  label: string
  /** Account type hint for display */
  type: 'payment' | 'savings' | 'joint' | 'other'
  /** true = seeded by Rabobank tb-scan, false = added manually */
  autoDetected: boolean
  /** When false, this account is ignored during categorization */
  enabled: boolean
}
