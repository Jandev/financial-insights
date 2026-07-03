/**
 * Known Rabobank transaction codes.
 * The `(string & {})` suffix keeps autocomplete for known values while
 * accepting any string a future bank adapter might produce.
 */
export type TransactionCode =
  | 'bc' // Betaalkaart — card payment
  | 'cb' // Creditboeking — incoming credit / Tikkie
  | 'ei' // Europese Incasso — SEPA direct debit
  | 'tb' // Tussenrekening / overboeking — bank transfer
  | 'ba' // ATM withdrawal
  | 'ga' // ATM (variant)
  | 'bg' // Batch payment
  | 'db' // Bank costs / debit interest
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {})

/**
 * A normalized transaction usable throughout the app,
 * regardless of which bank or file format it was loaded from.
 */
export interface Transaction {
  /** Globally unique: `{bankId}-{sequenceNumber}` */
  id: string

  /** Identifier of the bank adapter that produced this record, e.g. `'rabobank'` */
  bankId: string

  /** Original filename the transaction was loaded from */
  sourceFile: string

  // ── Account ──────────────────────────────────────────────────────────────
  iban: string
  currency: string
  bic: string
  sequenceNumber: string

  // ── Dates ─────────────────────────────────────────────────────────────────
  date: Date
  valueDate: Date

  // ── Amounts ───────────────────────────────────────────────────────────────
  amount: number
  balanceAfter: number

  // ── Counterparty ──────────────────────────────────────────────────────────
  counterpartyIban: string
  counterpartyName: string
  counterpartyBic: string
  ultimateParty: string
  initiatingParty: string

  // ── Transaction metadata ───────────────────────────────────────────────────
  transactionCode: TransactionCode
  batchId: string
  transactionReference: string
  mandateReference: string
  creditorId: string
  paymentReference: string

  // ── Description ───────────────────────────────────────────────────────────
  /** Omschrijving-1/-2/-3 joined and trimmed */
  description: string
  returnReason: string

  // ── FX (nullable when not a foreign-currency transaction) ─────────────────
  originalAmount: number | null
  originalCurrency: string | null
  exchangeRate: number | null

  // ── App-level state (set by the app, not the parser) ──────────────────────
  /** Category assigned by the categorization engine or user. Default: `''` */
  category: string

  /** When true the transaction is excluded from charts and totals */
  isExcluded: boolean
}
