import Papa from 'papaparse'
import type { BankAdapter } from './types'
import type { Transaction } from '@/types/transaction'

// ─── Column name constants ────────────────────────────────────────────────────
// Defined once to avoid typos and make future refactors easy.
// All headers are the Windows-1252–decoded strings PapaParse produces after the
// file is decoded with TextDecoder('windows-1252').

const COL = {
  IBAN: 'IBAN/BBAN',
  CURRENCY: 'Munt',
  BIC: 'BIC',
  SEQUENCE: 'Volgnr',
  DATE: 'Datum',
  VALUE_DATE: 'Rentedatum',
  AMOUNT: 'Bedrag',
  BALANCE: 'Saldo na trn',
  COUNTERPARTY_IBAN: 'Tegenrekening IBAN/BBAN',
  COUNTERPARTY_NAME: 'Naam tegenpartij',
  ULTIMATE_PARTY: 'Naam uiteindelijke partij',
  INITIATING_PARTY: 'Naam initiërende partij',
  COUNTERPARTY_BIC: 'BIC tegenpartij',
  CODE: 'Code',
  BATCH_ID: 'Batch ID',
  TX_REF: 'Transactiereferentie',
  MANDATE_REF: 'Machtigingskenmerk',
  CREDITOR_ID: 'Incassant ID',
  PAYMENT_REF: 'Betalingskenmerk',
  DESC_1: 'Omschrijving-1',
  DESC_2: 'Omschrijving-2',
  DESC_3: 'Omschrijving-3',
  RETURN_REASON: 'Reden retour',
  ORIG_AMOUNT: 'Oorspr bedrag',
  ORIG_CURRENCY: 'Oorspr munt',
  EXCHANGE_RATE: 'Koers',
} as const

/** Raw row as PapaParse produces it — all values are strings. */
type RawRabobankRow = Record<string, string>

// ─── Parse helpers ────────────────────────────────────────────────────────────

/**
 * Parse a Dutch-formatted amount string into a JS float.
 *
 * Rules:
 *  - Optional leading `+` or `-` sign
 *  - Period (`.`) is the thousands separator → stripped
 *  - Comma (`,`) is the decimal separator → replaced with `.`
 *
 * Examples:
 *  `'-10,00'`    → -10
 *  `'+1.234,56'` → 1234.56
 *  `'-0,01'`     → -0.01
 *  `''`          → 0
 */
export function parseAmount(str: string): number {
  const s = str?.trim() ?? ''
  if (s === '') return 0

  const isNegative = s.startsWith('-')
  const normalized = s
    .replace(/^[+-]/, '')   // strip leading sign
    .replace(/\./g, '')     // remove thousands separator (Dutch: period)
    .replace(',', '.')      // replace decimal comma with dot

  const value = parseFloat(normalized)
  if (isNaN(value)) return 0
  return isNegative ? -value : value
}

/**
 * Parse a YYYY-MM-DD date string into a Date object.
 * ISO 8601 dates are parsed as UTC midnight; this is fine for date-only values.
 */
export function parseDate(str: string): Date {
  return new Date(str?.trim() ?? '')
}

/**
 * Join up to three description parts, skipping blank/whitespace-only values.
 */
export function joinDescription(...parts: string[]): string {
  return parts
    .map((p) => p?.trim() ?? '')
    .filter((p) => p.length > 0)
    .join(' ')
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapRow(raw: RawRabobankRow, sourceFile: string): Transaction | null {
  const seq = raw[COL.SEQUENCE]?.trim()
  if (!seq) return null

  const origAmountStr = raw[COL.ORIG_AMOUNT]?.trim()
  const exchangeRateStr = raw[COL.EXCHANGE_RATE]?.trim()
  const origCurrencyStr = raw[COL.ORIG_CURRENCY]?.trim()

  return {
    id: `rabobank-${seq}`,
    bankId: 'rabobank',
    sourceFile,

    iban: raw[COL.IBAN]?.trim() ?? '',
    currency: raw[COL.CURRENCY]?.trim() ?? '',
    bic: raw[COL.BIC]?.trim() ?? '',
    sequenceNumber: seq,

    date: parseDate(raw[COL.DATE]),
    valueDate: parseDate(raw[COL.VALUE_DATE]),

    amount: parseAmount(raw[COL.AMOUNT]),
    balanceAfter: parseAmount(raw[COL.BALANCE]),

    counterpartyIban: raw[COL.COUNTERPARTY_IBAN]?.trim() ?? '',
    counterpartyName: raw[COL.COUNTERPARTY_NAME]?.trim() ?? '',
    counterpartyBic: raw[COL.COUNTERPARTY_BIC]?.trim() ?? '',
    ultimateParty: raw[COL.ULTIMATE_PARTY]?.trim() ?? '',
    initiatingParty: raw[COL.INITIATING_PARTY]?.trim() ?? '',

    transactionCode: raw[COL.CODE]?.trim() ?? '',
    batchId: raw[COL.BATCH_ID]?.trim() ?? '',
    transactionReference: raw[COL.TX_REF]?.trim() ?? '',
    mandateReference: raw[COL.MANDATE_REF]?.trim() ?? '',
    creditorId: raw[COL.CREDITOR_ID]?.trim() ?? '',
    paymentReference: raw[COL.PAYMENT_REF]?.trim() ?? '',

    description: joinDescription(
      raw[COL.DESC_1],
      raw[COL.DESC_2],
      raw[COL.DESC_3],
    ),
    returnReason: raw[COL.RETURN_REASON]?.trim() ?? '',

    originalAmount: origAmountStr ? parseAmount(origAmountStr) : null,
    originalCurrency: origCurrencyStr || null,
    exchangeRate: exchangeRateStr ? parseAmount(exchangeRateStr) : null,

    category: '',
    isExcluded: false,
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export const rabobankAdapter: BankAdapter = {
  id: 'rabobank',
  name: 'Rabobank',

  /**
   * Detect by inspecting the header row (primary) and filename (secondary).
   * The `"IBAN/BBAN"` first column is unique to Rabobank exports.
   */
  detect(filename: string, firstLine: string): boolean {
    return (
      firstLine.startsWith('"IBAN/BBAN"') ||
      filename.toLowerCase().includes('rabo')
    )
  },

  /**
   * Parse a Rabobank CSV export.
   *
   * Format characteristics:
   *  - Delimiter: comma (`,`) — all values double-quoted
   *  - Encoding: Windows-1252 (caller decodes before passing content here)
   *  - Decimal separator: comma (`,`) — e.g. `-10,00`
   *  - Thousands separator: period (`.`) — e.g. `+1.234,56`
   *  - Date format: YYYY-MM-DD
   *  - 26 columns, Dutch headers
   */
  parse(rawContent: string, sourceFile: string): Transaction[] {
    const result = Papa.parse<RawRabobankRow>(rawContent, {
      delimiter: ',',
      header: true,
      skipEmptyLines: true,
    })

    if (result.errors.length > 0) {
      result.errors.forEach((e) =>
        console.warn(`[rabobank] Parse warning in ${sourceFile}:`, e.message),
      )
    }

    const transactions: Transaction[] = []

    for (let i = 0; i < result.data.length; i++) {
      const txn = mapRow(result.data[i], sourceFile)
      if (txn === null) {
        console.warn(`[rabobank] Skipping row ${i} — missing Volgnr in ${sourceFile}`)
        continue
      }
      transactions.push(txn)
    }

    return transactions
  },
}
