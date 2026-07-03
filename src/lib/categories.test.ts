// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  categorize,
  DEFAULT_RULES,
  mergeRules,
  readRulesFromStorage,
  readOverridesFromStorage,
  type CategoryRule,
} from './categories'
import type { Transaction } from '@/types/transaction'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'rabobank-001',
    bankId: 'rabobank',
    sourceFile: 'test.csv',
    iban: 'NL00RABO0000000001',
    currency: 'EUR',
    bic: 'RABONL2U',
    sequenceNumber: '001',
    date: new Date('2024-06-01'),
    valueDate: new Date('2024-06-01'),
    amount: -10,
    balanceAfter: -10,
    counterpartyIban: '',
    counterpartyName: '',
    counterpartyBic: '',
    ultimateParty: '',
    initiatingParty: '',
    transactionCode: 'bc',
    batchId: '',
    transactionReference: '',
    mandateReference: '',
    creditorId: '',
    paymentReference: '',
    description: '',
    returnReason: '',
    originalAmount: null,
    originalCurrency: null,
    exchangeRate: null,
    category: '',
    isExcluded: false,
    ...overrides,
  }
}

// ─── categorize — pattern matching ────────────────────────────────────────────

describe('categorize — pattern matching', () => {
  it('matches on counterpartyName (case-insensitive)', () => {
    const tx = makeTx({ counterpartyName: 'Albert Heijn BV' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('groceries')
  })

  it('matches on description (case-insensitive)', () => {
    const tx = makeTx({ description: 'Betaling ALBERT HEIJN' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('groceries')
  })

  it('matches partial substring in counterpartyName', () => {
    const tx = makeTx({ counterpartyName: 'Jumbo Supermarkten' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('groceries')
  })

  it('matches dining pattern', () => {
    const tx = makeTx({ counterpartyName: 'Restaurant De Zon' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('dining')
  })

  it('matches transport pattern', () => {
    const tx = makeTx({ counterpartyName: 'NS Reizigers' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('transport')
  })

  it('matches utilities pattern', () => {
    const tx = makeTx({ counterpartyName: 'Vattenfall Warmte' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('utilities')
  })

  it('matches healthcare pattern', () => {
    const tx = makeTx({ counterpartyName: 'Apotheek Centrum' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('healthcare')
  })

  it('matches subscriptions pattern', () => {
    const tx = makeTx({ counterpartyName: 'Netflix International' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('subscriptions')
  })

  it('matches rent pattern', () => {
    const tx = makeTx({ counterpartyName: 'Woning Huur BV' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('rent')
  })
})

// ─── categorize — transactionCodes filter ─────────────────────────────────────

describe('categorize — transactionCodes filter', () => {
  it('matches own-account-transfer for code tb regardless of name', () => {
    const tx = makeTx({ transactionCode: 'tb', counterpartyName: '' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('own-account-transfer')
  })

  it('does not match own-account-transfer for code bc', () => {
    const tx = makeTx({ transactionCode: 'bc', counterpartyName: 'Some Transfer' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('uncategorized')
  })

  it('custom rule with transactionCodes fires only for matching code', () => {
    const rule: CategoryRule = {
      id: 'direct-debit',
      name: 'Direct Debit',
      color: '#000',
      icon: 'CreditCard',
      patterns: [],
      transactionCodes: ['ei'],
    }
    const txEi = makeTx({ transactionCode: 'ei' })
    const txBc = makeTx({ transactionCode: 'bc' })
    expect(categorize(txEi, [rule])).toBe('direct-debit')
    expect(categorize(txBc, [rule])).toBe('uncategorized')
  })
})

// ─── categorize — isCredit filter ─────────────────────────────────────────────

describe('categorize — isCredit filter', () => {
  it('income rule only matches positive amounts', () => {
    const credit = makeTx({ counterpartyName: 'Salaris BV', amount: 3000 })
    const debit = makeTx({ counterpartyName: 'Salaris BV', amount: -3000 })
    expect(categorize(credit, DEFAULT_RULES)).toBe('income')
    expect(categorize(debit, DEFAULT_RULES)).toBe('uncategorized')
  })

  it('custom isCredit:false rule only fires for negative amounts', () => {
    const rule: CategoryRule = {
      id: 'expense-only',
      name: 'Expense Only',
      color: '#000',
      icon: 'Minus',
      patterns: ['test'],
      isCredit: false,
    }
    const debit = makeTx({ counterpartyName: 'Test BV', amount: -50 })
    const credit = makeTx({ counterpartyName: 'Test BV', amount: 50 })
    expect(categorize(debit, [rule])).toBe('expense-only')
    expect(categorize(credit, [rule])).toBe('uncategorized')
  })
})

// ─── categorize — amountMin filter ────────────────────────────────────────────

describe('categorize — amountMin filter', () => {
  it('matches when |amount| >= amountMin', () => {
    const rule: CategoryRule = {
      id: 'large',
      name: 'Large',
      color: '#000',
      icon: 'ArrowUp',
      patterns: ['rent'],
      amountMin: 500,
    }
    const large = makeTx({ counterpartyName: 'Rent BV', amount: -1200 })
    const small = makeTx({ counterpartyName: 'Rent BV', amount: -100 })
    expect(categorize(large, [rule])).toBe('large')
    expect(categorize(small, [rule])).toBe('uncategorized')
  })

  it('uses absolute amount (works for credits too)', () => {
    const rule: CategoryRule = {
      id: 'big-income',
      name: 'Big Income',
      color: '#000',
      icon: 'TrendingUp',
      patterns: ['salary'],
      amountMin: 1000,
    }
    const tx = makeTx({ counterpartyName: 'Salary', amount: 2500 })
    expect(categorize(tx, [rule])).toBe('big-income')
  })
})

// ─── categorize — first-match-wins ────────────────────────────────────────────

describe('categorize — first-match-wins', () => {
  it('returns the first matching rule, not subsequent ones', () => {
    const rules: CategoryRule[] = [
      {
        id: 'first',
        name: 'First',
        color: '#000',
        icon: 'Star',
        patterns: ['albert heijn'],
      },
      {
        id: 'second',
        name: 'Second',
        color: '#000',
        icon: 'Star',
        patterns: ['albert'],
      },
    ]
    const tx = makeTx({ counterpartyName: 'Albert Heijn' })
    expect(categorize(tx, rules)).toBe('first')
  })

  it('custom rules prepended via mergeRules take priority over defaults', () => {
    const custom: CategoryRule[] = [
      {
        id: 'my-rule',
        name: 'My Rule',
        color: '#000',
        icon: 'Pencil',
        patterns: ['netflix'],
      },
    ]
    const merged = mergeRules(custom)
    const tx = makeTx({ counterpartyName: 'Netflix' })
    expect(categorize(tx, merged)).toBe('my-rule')
  })
})

// ─── categorize — uncategorized fallback ─────────────────────────────────────

describe('categorize — uncategorized fallback', () => {
  it('returns uncategorized when no rule matches', () => {
    const tx = makeTx({ counterpartyName: 'Unknown Vendor XYZ' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('uncategorized')
  })

  it('returns uncategorized for empty rules array', () => {
    const tx = makeTx({ counterpartyName: 'Albert Heijn' })
    expect(categorize(tx, [])).toBe('uncategorized')
  })
})

// ─── categorize — rule with no patterns + code filter ─────────────────────────

describe('categorize — no patterns, only transactionCodes', () => {
  it('matches any transaction with the right code when patterns is empty', () => {
    const tx = makeTx({ transactionCode: 'tb', counterpartyName: 'Random Name' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('own-account-transfer')
  })
})

// ─── mergeRules ───────────────────────────────────────────────────────────────

describe('mergeRules', () => {
  it('prepends custom rules before DEFAULT_RULES', () => {
    const custom: CategoryRule[] = [
      { id: 'x', name: 'X', color: '#000', icon: 'X', patterns: ['foo'] },
    ]
    const merged = mergeRules(custom)
    expect(merged[0].id).toBe('x')
    expect(merged[1].id).toBe(DEFAULT_RULES[0].id)
  })

  it('empty custom returns DEFAULT_RULES unchanged', () => {
    expect(mergeRules([])).toEqual(DEFAULT_RULES)
  })
})

// ─── readRulesFromStorage / readOverridesFromStorage ─────────────────────────

describe('readRulesFromStorage', () => {
  it('returns empty array when localStorage is empty', () => {
    localStorage.clear()
    expect(readRulesFromStorage()).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem('financial-insights:category-rules', 'not-json')
    expect(readRulesFromStorage()).toEqual([])
    localStorage.clear()
  })

  it('returns empty array when value is not an array', () => {
    localStorage.setItem('financial-insights:category-rules', JSON.stringify({ foo: 'bar' }))
    expect(readRulesFromStorage()).toEqual([])
    localStorage.clear()
  })

  it('returns parsed rules when valid', () => {
    const rules: CategoryRule[] = [
      { id: 'x', name: 'X', color: '#000', icon: 'X', patterns: ['foo'] },
    ]
    localStorage.setItem('financial-insights:category-rules', JSON.stringify(rules))
    expect(readRulesFromStorage()).toEqual(rules)
    localStorage.clear()
  })
})

describe('readOverridesFromStorage', () => {
  it('returns empty object when localStorage is empty', () => {
    localStorage.clear()
    expect(readOverridesFromStorage()).toEqual({})
  })

  it('returns empty object for invalid JSON', () => {
    localStorage.setItem('financial-insights:category-overrides', 'not-json')
    expect(readOverridesFromStorage()).toEqual({})
    localStorage.clear()
  })

  it('returns empty object when value is an array', () => {
    localStorage.setItem('financial-insights:category-overrides', JSON.stringify([]))
    expect(readOverridesFromStorage()).toEqual({})
    localStorage.clear()
  })

  it('returns parsed overrides when valid', () => {
    const overrides = { 'rabobank-001': 'groceries' }
    localStorage.setItem('financial-insights:category-overrides', JSON.stringify(overrides))
    expect(readOverridesFromStorage()).toEqual(overrides)
    localStorage.clear()
  })
})
