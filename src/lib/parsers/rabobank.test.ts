import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, joinDescription, rabobankAdapter } from './rabobank'

// ─── parseAmount ─────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('parses a simple negative Dutch decimal', () => {
    expect(parseAmount('-10,00')).toBe(-10)
  })

  it('parses a simple positive Dutch decimal', () => {
    expect(parseAmount('+30,00')).toBe(30)
  })

  it('parses a small negative value', () => {
    expect(parseAmount('-0,01')).toBe(-0.01)
  })

  it('strips thousands separator and parses correctly', () => {
    expect(parseAmount('+1.234,56')).toBe(1234.56)
  })

  it('handles large negative with thousands separator', () => {
    expect(parseAmount('-10.000,00')).toBe(-10000)
  })

  it('returns 0 for empty string', () => {
    expect(parseAmount('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(parseAmount('   ')).toBe(0)
  })

  it('handles zero', () => {
    expect(parseAmount('0,00')).toBe(0)
  })

  it('handles unsigned value (no sign prefix)', () => {
    expect(parseAmount('5,00')).toBe(5)
  })
})

// ─── parseDate ───────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses a YYYY-MM-DD string into a Date', () => {
    const d = parseDate('2024-06-01')
    expect(d).toBeInstanceOf(Date)
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(5) // 0-indexed
    expect(d.getUTCDate()).toBe(1)
  })

  it('returns an invalid date for an empty string', () => {
    expect(isNaN(parseDate('').getTime())).toBe(true)
  })
})

// ─── joinDescription ─────────────────────────────────────────────────────────

describe('joinDescription', () => {
  it('joins three non-empty parts with a space', () => {
    expect(joinDescription('Part 1', 'Part 2', 'Part 3')).toBe('Part 1 Part 2 Part 3')
  })

  it('skips empty and whitespace-only parts', () => {
    expect(joinDescription('Part 1', '  ', '')).toBe('Part 1')
  })

  it('returns empty string when all parts are blank', () => {
    expect(joinDescription('', ' ', '  ')).toBe('')
  })
})

// ─── rabobankAdapter.detect ───────────────────────────────────────────────────

describe('rabobankAdapter.detect', () => {
  it('detects by header row first column', () => {
    expect(rabobankAdapter.detect('unknown.csv', '"IBAN/BBAN","Munt",...')).toBe(true)
  })

  it('detects by filename containing "rabo"', () => {
    expect(rabobankAdapter.detect('CSV_A_NL03RABO0150475810_EUR_202406.csv', 'wrong header')).toBe(true)
  })

  it('returns false for unrelated file', () => {
    expect(rabobankAdapter.detect('ing_export.csv', '"Datum","Naam","Rekening"')).toBe(false)
  })
})

// ─── rabobankAdapter.parse ────────────────────────────────────────────────────

// A minimal two-row fixture that mirrors the real Rabobank CSV format.
// Uses anonymized/fake data — no real IBANs or names.
// The header MUST be a single line; PapaParse treats each newline as a new row.
const HEADER =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn",' +
  '"Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij",' +
  '"Naam initiërende partij","BIC tegenpartij","Code","Batch ID",' +
  '"Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk",' +
  '"Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour",' +
  '"Oorspr bedrag","Oorspr munt","Koers"'

const FIXTURE_CSV = [
  HEADER,
  '"NL00RABO0000000000","EUR","RABONL2U","000000000000000001","2024-06-01","2024-06-01","-10,00","-785,89","","AH Supermarkt","","","","bc","","TX001","","","","Supermarkt aankoop"," ","","","",""',
  '"NL00RABO0000000000","EUR","RABONL2U","000000000000000002","2024-06-15","2024-06-15","+1.500,00","714,11","NL00INGB0000000000","Werkgever B.V.","","","INGBNL2A","tb","","TX002","","","","Salaris juni 2024","","","","","",""',
].join('\n')

describe('rabobankAdapter.parse', () => {
  const results = rabobankAdapter.parse(FIXTURE_CSV, 'fixture.csv')

  it('returns the correct number of transactions', () => {
    expect(results).toHaveLength(2)
  })

  it('sets bankId to "rabobank"', () => {
    expect(results[0].bankId).toBe('rabobank')
  })

  it('sets sourceFile correctly', () => {
    expect(results[0].sourceFile).toBe('fixture.csv')
  })

  it('generates a stable id from Volgnr', () => {
    expect(results[0].id).toBe('rabobank-000000000000000001')
  })

  it('parses a negative amount correctly', () => {
    expect(results[0].amount).toBe(-10)
  })

  it('parses a large positive amount with thousands separator', () => {
    expect(results[1].amount).toBe(1500)
  })

  it('parses the date as a Date object', () => {
    expect(results[0].date).toBeInstanceOf(Date)
    expect(results[0].date.getUTCFullYear()).toBe(2024)
  })

  it('joins description parts and trims whitespace', () => {
    // Row 0: "Supermarkt aankoop" + " " (whitespace-only) → only first part kept
    expect(results[0].description).toBe('Supermarkt aankoop')
  })

  it('maps counterparty name', () => {
    expect(results[1].counterpartyName).toBe('Werkgever B.V.')
  })

  it('sets category and isExcluded to defaults', () => {
    expect(results[0].category).toBe('')
    expect(results[0].isExcluded).toBe(false)
  })
})
