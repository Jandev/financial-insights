/**
 * A personal account IBAN registered by the user.
 *
 * Transactions to/from `iban` can fall back to category `internal-transfer`
 * when no higher-priority rule matches. They are shown distinctly in the UI
 * and still count toward income/expense totals (unlike spaarpotjes).
 *
 * Only manual registration is supported — accounts are added via
 * Settings → Personal Accounts. There is no automatic detection.
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
  /** Always false — kept for schema compatibility with existing persisted data */
  autoDetected: boolean
  /** When false, this account is ignored during categorization */
  enabled: boolean
}
