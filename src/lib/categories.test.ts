// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  buildCategorizedTransactions,
  categorize,
  categorizeWithPersonalFallback,
  DEFAULT_RULES,
  mergeRules,
  readRulesFromStorage,
  readOverridesFromStorage,
  matchPersonalAccount,
  INTERNAL_TRANSFER_RULE_IDS,
  type CategoryRule,
} from './categories'
import type { Transaction } from '@/types/transaction'
import type { PersonalAccount } from '@/types/personalAccount'

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
    tags: [],
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
  it('tb with no matching personal account falls through to uncategorized', () => {
    const tx = makeTx({ transactionCode: 'tb', counterpartyName: '' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('uncategorized')
  })

  it('does not match own-account-transfer for code bc', () => {
    const tx = makeTx({ transactionCode: 'bc', counterpartyName: 'Some Transfer' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('uncategorized')
  })

  it('custom rule with transactionCodes fires only for matching code', () => {
    const rule: CategoryRule = {
      kind: 'legacy',
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
      kind: 'legacy',
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
      kind: 'legacy',
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
      kind: 'legacy',
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
        kind: 'legacy',
        id: 'first',
        name: 'First',
        color: '#000',
        icon: 'Star',
        patterns: ['albert heijn'],
      },
      {
        kind: 'legacy',
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
        kind: 'legacy',
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
  it('tb falls through to uncategorized when internal-transfer rules have no transactionCodes', () => {
    const tx = makeTx({ transactionCode: 'tb', counterpartyName: 'Random Name' })
    expect(categorize(tx, DEFAULT_RULES)).toBe('uncategorized')
  })
})

// ─── mergeRules ───────────────────────────────────────────────────────────────

describe('mergeRules', () => {
  it('prepends custom rules before DEFAULT_RULES', () => {
    const custom: CategoryRule[] = [
      { kind: 'legacy', id: 'x', name: 'X', color: '#000', icon: 'X', patterns: ['foo'] },
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
      { kind: 'legacy', id: 'x', name: 'X', color: '#000', icon: 'X', patterns: ['foo'] },
    ]
    localStorage.setItem('financial-insights:category-rules', JSON.stringify(rules))
    expect(readRulesFromStorage()).toEqual(rules)
    localStorage.clear()
  })

  it('coerces legacy persisted rules without kind', () => {
    localStorage.setItem(
      'financial-insights:category-rules',
      JSON.stringify([
        {
          id: 'legacy-no-kind',
          name: 'Legacy',
          color: '#000',
          icon: 'X',
          patterns: ['foo'],
        },
      ]),
    )

    expect(readRulesFromStorage()).toEqual([
      {
        kind: 'legacy',
        id: 'legacy-no-kind',
        name: 'Legacy',
        color: '#000',
        icon: 'X',
        patterns: ['foo'],
        transactionCodes: undefined,
        amountMin: undefined,
        amountMax: undefined,
        isCredit: undefined,
      },
    ])

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

  it('coerces own-account-transfer override to internal-transfer', () => {
    localStorage.setItem(
      'financial-insights:category-overrides',
      JSON.stringify({ 'rabobank-001': 'own-account-transfer' }),
    )

    expect(readOverridesFromStorage()).toEqual({ 'rabobank-001': 'internal-transfer' })
    localStorage.clear()
  })
})

// ─── INTERNAL_TRANSFER_RULE_IDS — manual-only regime ─────────────────────────

describe('INTERNAL_TRANSFER_RULE_IDS filter', () => {
  it('contains internal-transfer and own-account-transfer', () => {
    expect(INTERNAL_TRANSFER_RULE_IDS.has('internal-transfer')).toBe(true)
    expect(INTERNAL_TRANSFER_RULE_IDS.has('own-account-transfer')).toBe(true)
  })

  it('default rules no longer include duplicate own-account-transfer', () => {
    expect(DEFAULT_RULES.some((rule) => rule.id === 'own-account-transfer')).toBe(false)
  })

  it('tb falls to uncategorized when fallback rules are filtered out', () => {
    const filtered = DEFAULT_RULES.filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))
    const tx = makeTx({ transactionCode: 'tb', counterpartyName: '' })
    expect(categorize(tx, filtered)).toBe('uncategorized')
  })
})

// ─── categorizeWithPersonalFallback — rules first, personal fallback ──────────

describe('categorizeWithPersonalFallback', () => {
  it('custom rule wins over personal-account fallback', () => {
    const tx = makeTx({
      counterpartyIban: 'NL00RABO0000000002',
      counterpartyName: 'Any Counterparty',
      description: 'Pocket money transfer',
    })
    const customRules: CategoryRule[] = [
      {
        kind: 'condition',
        id: 'custom-pocket-money',
        name: 'Pocket Money',
        color: '#000',
        icon: 'PiggyBank',
        conditions: [
          {
            id: 'cond-1',
            field: 'description',
            operator: 'contains',
            value: 'pocket money',
          },
        ],
        combinator: 'and',
      },
    ]
    const rules = mergeRules(customRules).filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))

    const category = categorizeWithPersonalFallback(tx, rules, [makeAccount()])
    expect(category).toBe('custom-pocket-money')
  })

  it('default rule wins over personal-account fallback', () => {
    const tx = makeTx({
      counterpartyIban: 'NL00RABO0000000002',
      counterpartyName: 'Albert Heijn',
      description: 'Boodschappen',
    })
    const rules = DEFAULT_RULES.filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))

    const category = categorizeWithPersonalFallback(tx, rules, [makeAccount()])
    expect(category).toBe('groceries')
  })

  it('falls back to internal-transfer only when rules return uncategorized', () => {
    const tx = makeTx({
      counterpartyIban: 'NL00RABO0000000002',
      counterpartyName: 'Unknown Name',
      description: 'Random transfer',
    })
    const rules = DEFAULT_RULES.filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))

    const category = categorizeWithPersonalFallback(tx, rules, [makeAccount()])
    expect(category).toBe('internal-transfer')
  })
})

describe('buildCategorizedTransactions', () => {
  it('applies spaarpotje match before manual overrides', () => {
    const tx = makeTx({
      id: 'tx-1',
      category: 'uncategorized',
      amount: -50,
      counterpartyIban: 'NL00RABO0000001234',
      tags: [],
    })

    const result = buildCategorizedTransactions([tx], {
      rules: [],
      overrides: { 'tx-1': 'groceries' },
      savingsAccounts: [{ id: 'pot-1', name: 'Holiday', iban: 'NL00RABO0000001234', color: '#00C7BE' }],
      tagOverrides: {},
      personalAccounts: [],
    })

    expect(result[0].category).toBe('spaarpotje')
    expect(result[0].tags).toEqual(['Holiday'])
  })

  it('applies manual override before rule engine', () => {
    const tx = makeTx({
      id: 'tx-2',
      category: 'uncategorized',
      counterpartyName: 'Albert Heijn',
      tags: [],
    })

    const result = buildCategorizedTransactions([tx], {
      rules: [],
      overrides: { 'tx-2': 'rent' },
      savingsAccounts: [],
      tagOverrides: { 'tx-2': ['manual-tag'] },
      personalAccounts: [],
    })

    expect(result[0].category).toBe('rent')
    expect(result[0].tags).toEqual(['manual-tag'])
  })

  it('falls back to internal-transfer when no rule matches and personal account matches', () => {
    const tx = makeTx({
      id: 'tx-3',
      category: 'uncategorized',
      transactionCode: 'tb',
      counterpartyName: 'Unknown',
      counterpartyIban: 'NL00RABO0000000002',
      tags: [],
    })

    const result = buildCategorizedTransactions([tx], {
      rules: [],
      overrides: {},
      savingsAccounts: [],
      tagOverrides: {},
      personalAccounts: [makeAccount()],
    })

    expect(result[0].category).toBe('internal-transfer')
  })
})

// ─── matchPersonalAccount — manual accounts only ──────────────────────────────

function makeAccount(overrides: Partial<PersonalAccount> = {}): PersonalAccount {
  return {
    iban: 'NL00RABO0000000002',
    label: '',
    type: 'payment',
    autoDetected: false,
    enabled: true,
    ...overrides,
  }
}

describe('matchPersonalAccount', () => {
  it('returns true when enabled account IBAN matches', () => {
    const tx = makeTx({ counterpartyIban: 'NL00RABO0000000002' })
    expect(matchPersonalAccount(tx, [makeAccount()])).toBe(true)
  })

  it('returns false when account is disabled', () => {
    const tx = makeTx({ counterpartyIban: 'NL00RABO0000000002' })
    expect(matchPersonalAccount(tx, [makeAccount({ enabled: false })])).toBe(false)
  })

  it('returns false for empty accounts list', () => {
    const tx = makeTx({ counterpartyIban: 'NL00RABO0000000002' })
    expect(matchPersonalAccount(tx, [])).toBe(false)
  })

  it('returns false when IBAN does not match', () => {
    const tx = makeTx({ counterpartyIban: 'NL00RABO0000000099' })
    expect(matchPersonalAccount(tx, [makeAccount()])).toBe(false)
  })

  it('match is case-insensitive', () => {
    const tx = makeTx({ counterpartyIban: 'nl00rabo0000000002' })
    expect(matchPersonalAccount(tx, [makeAccount({ iban: 'NL00RABO0000000002' })])).toBe(true)
  })

  it('tb transaction without matching account is NOT internal-transfer', () => {
    // Regression: deleted personal accounts must not re-appear via fallback
    const tx = makeTx({ transactionCode: 'tb', counterpartyIban: 'NL00RABO0000000002' })
    expect(matchPersonalAccount(tx, [])).toBe(false)
    const filtered = DEFAULT_RULES.filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))
    expect(categorize(tx, filtered)).toBe('uncategorized')
  })
})
