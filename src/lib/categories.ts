import type { Transaction, TransactionCode } from '@/types/transaction'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryRule {
  id: string
  /** Display name shown in the UI */
  name: string
  /** Hex color used in charts — macOS system palette */
  color: string
  /** Lucide icon name */
  icon: string
  /**
   * Case-insensitive substrings matched against
   * `counterpartyName + ' ' + description`.
   * An empty array means "match nothing via pattern" — use other filters only.
   */
  patterns: string[]
  /** When set, rule only fires for these transaction codes */
  transactionCodes?: TransactionCode[]
  /** When set, rule only fires when |amount| >= amountMin */
  amountMin?: number
  /** When set: true = credit only (amount > 0), false = debit only (amount < 0) */
  isCredit?: boolean
}

/** Per-transaction manual overrides: transactionId → categoryId */
export type CategoryOverrides = Record<string, string>

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEY_RULES = 'financial-insights:category-rules'
export const STORAGE_KEY_OVERRIDES = 'financial-insights:category-overrides'

// ─── Default ruleset ─────────────────────────────────────────────────────────

/**
 * Starting ruleset. Rules are evaluated in order — first match wins.
 * The `uncategorized` entry at the end acts as a guaranteed fallback.
 *
 * Colors: macOS system palette.
 * Icons: Lucide icon names.
 */
export const DEFAULT_RULES: CategoryRule[] = [
  {
    id: 'income',
    name: 'Salary / Income',
    color: '#00C7BE',
    icon: 'TrendingUp',
    patterns: ['salaris', 'loon ', 'inkomen', 'cao '],
    isCredit: true,
  },
  {
    id: 'groceries',
    name: 'Groceries',
    color: '#34C759',
    icon: 'ShoppingCart',
    patterns: [
      'albert heijn',
      'ah ',
      'jumbo',
      'lidl',
      'aldi',
      'plus supermarkt',
      'dirk',
      'hoogvliet',
      'dekamarkt',
      'vomar',
    ],
  },
  {
    id: 'dining',
    name: 'Dining & Cafes',
    color: '#FF9500',
    icon: 'UtensilsCrossed',
    patterns: [
      'restaurant',
      'cafe ',
      'eetcafe',
      'mcdonalds',
      'mcdonald',
      'pizza',
      'dominos',
      'thuisbezorgd',
      'deliveroo',
      'uber eats',
      'just eat',
      'kfc',
      'burger king',
      'subway',
    ],
  },
  {
    id: 'transport',
    name: 'Transport',
    color: '#007AFF',
    icon: 'Car',
    patterns: [
      'ns ',
      'ov-chipkaart',
      'ov chipkaart',
      'uber',
      'bolt',
      'shell',
      'bp ',
      'q8',
      'esso',
      'tinq',
      'tango',
      'neot',
      'parking',
    ],
  },
  {
    id: 'utilities',
    name: 'Utilities',
    color: '#30B0C7',
    icon: 'Zap',
    patterns: [
      'vattenfall',
      'eneco',
      'essent',
      'greenchoice',
      'nuon',
      'oxxio',
      'vitens',
      'ziggo',
      'kpn',
      't-mobile',
      'vodafone',
      'tele2',
      'xs4all',
      'budget energie',
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    color: '#FF3B30',
    icon: 'HeartPulse',
    patterns: [
      'zorgverzekering',
      'menzis',
      'vgz',
      'cz ',
      'zilveren kruis',
      'dsvp',
      'apotheek',
      'huisarts',
      'tandarts',
      'fysiotherap',
      'ziekenhuis',
    ],
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions',
    color: '#AF52DE',
    icon: 'Tv',
    patterns: [
      'netflix',
      'spotify',
      'amazon',
      'apple',
      'microsoft',
      'google',
      'adobe',
      'github',
      'patreon',
      'npo ',
      'videoland',
      'disney',
    ],
  },
  {
    id: 'rent',
    name: 'Rent / Mortgage',
    color: '#A2845E',
    icon: 'Home',
    patterns: ['huur', 'hypotheek', 'vve ', 'servicekosten'],
  },
  {
    id: 'own-account-transfer',
    name: 'Own Account Transfer',
    color: '#5856D6',
    icon: 'ArrowLeftRight',
    patterns: [],
    transactionCodes: ['tb'],
  },
  {
    id: 'uncategorized',
    name: 'Uncategorized',
    color: '#8E8E93',
    icon: 'HelpCircle',
    // No patterns, no filters — catches everything that reached this point
    patterns: [],
  },
]

// ─── Core categorization function ─────────────────────────────────────────────

/**
 * Assign a category id to a single transaction.
 *
 * Evaluation order:
 *  1. For each rule (in array order):
 *     a. Check `transactionCodes` filter (if set)
 *     b. Check `isCredit` filter (if set)
 *     c. Check `amountMin` filter (if set)
 *     d. Check pattern match against `counterpartyName + ' ' + description`
 *  2. First rule whose every applicable filter passes → return `rule.id`
 *  3. If no rule matched → return `'uncategorized'`
 *
 * Designed for sync, rule-based use today.
 * Future: an async LLM-based replacement can drop in with the same signature
 * returning `Promise<string>` — callers need only await the result.
 */
export function categorize(tx: Transaction, rules: CategoryRule[]): string {
  const haystack = `${tx.counterpartyName} ${tx.description}`.toLowerCase()

  for (const rule of rules) {
    // ── transactionCodes filter ──────────────────────────────────────────────
    if (rule.transactionCodes && rule.transactionCodes.length > 0) {
      if (!rule.transactionCodes.includes(tx.transactionCode)) continue
    }

    // ── isCredit filter ──────────────────────────────────────────────────────
    if (rule.isCredit !== undefined) {
      const txIsCredit = tx.amount > 0
      if (rule.isCredit !== txIsCredit) continue
    }

    // ── amountMin filter ─────────────────────────────────────────────────────
    if (rule.amountMin !== undefined) {
      if (Math.abs(tx.amount) < rule.amountMin) continue
    }

    // ── pattern match ────────────────────────────────────────────────────────
    if (rule.patterns.length > 0) {
      const matched = rule.patterns.some((p) => haystack.includes(p.toLowerCase()))
      if (!matched) continue
    }

    // All applicable filters passed — this rule wins
    return rule.id
  }

  return 'uncategorized'
}

// ─── Storage utilities (non-React — safe to call from csvLoader) ──────────────

/**
 * Read custom rules from localStorage.
 * Returns an empty array when nothing is stored or the value is unparseable.
 */
export function readRulesFromStorage(): CategoryRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RULES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CategoryRule[]) : []
  } catch {
    return []
  }
}

/**
 * Read manual category overrides from localStorage.
 * Returns an empty object when nothing is stored or the value is unparseable.
 */
export function readOverridesFromStorage(): CategoryOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as CategoryOverrides)
      : {}
  } catch {
    return {}
  }
}

/**
 * Merge custom rules with the default ruleset.
 * Custom rules are prepended so they take priority over defaults.
 */
export function mergeRules(customRules: CategoryRule[]): CategoryRule[] {
  return [...customRules, ...DEFAULT_RULES]
}
