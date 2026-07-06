import type { Transaction, TransactionCode } from '@/types/transaction'
import type { SavingsAccount } from '@/types/savingsAccount'

// ─── Condition types ──────────────────────────────────────────────────────────

/** Fields available for condition-based rule matching */
export type ConditionField = 'description' | 'counterpartyIban' | 'direction' | 'amount'

/** Operators available per field type */
export type ConditionOperator =
  | 'contains'   // text: substring match
  | 'equals'     // text: exact match (case-insensitive)
  | 'startsWith' // text: prefix match
  | 'is'         // direction: 'credit' | 'debit'
  | 'gte'        // amount: >= threshold
  | 'lte'        // amount: <= threshold

/** A single matching condition used in the new rule system */
export interface Condition {
  /** Stable id for React reconciliation */
  id: string
  field: ConditionField
  operator: ConditionOperator
  /** Always stored as string; parsed to number for amount comparisons */
  value: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryRule {
  id: string
  /** Display name shown in the UI */
  name: string
  /** Hex color used in charts — macOS system palette */
  color: string
  /** Lucide icon name */
  icon: string

  // ── New condition-based matching (custom rules) ───────────────────────────
  /** Structured conditions — evaluated with `combinator`. Takes priority over legacy fields. */
  conditions?: Condition[]
  /** How multiple conditions are combined. Defaults to 'and'. */
  combinator?: 'and' | 'or'

  // ── Legacy pattern-based matching (DEFAULT_RULES) ─────────────────────────
  /**
   * Case-insensitive substrings matched against
   * `counterpartyName + ' ' + description`.
   * An empty array means "match nothing via pattern" — use other filters only.
   */
  patterns?: string[]
  /** When set, rule only fires for these transaction codes */
  transactionCodes?: TransactionCode[]
  /** When set, rule only fires when |amount| >= amountMin */
  amountMin?: number
  /** When set: true = credit only (amount > 0), false = debit only (amount < 0) */
  isCredit?: boolean
}

/** Per-transaction manual overrides: transactionId → categoryId */
export type CategoryOverrides = Record<string, string>

// ─── Spaarpotje category helpers ─────────────────────────────────────────────

/**
 * Category IDs that represent savings-goal movements (spaarpotjes).
 * These are excluded from income and expense totals — moving money to/from
 * a named savings goal is not real income or spending.
 */
export const SPAARPOTJE_CATEGORIES = new Set(['spaarpotje', 'spaarpotje-withdrawal'])

/**
 * Rule IDs that automatically categorize `tb` transactions as internal
 * transfers. Excluded from the rule engine so that internal-transfer is
 * only assigned when the counterparty IBAN is explicitly added to Personal
 * Accounts by the user.
 */
export const INTERNAL_TRANSFER_RULE_IDS = new Set(['internal-transfer', 'own-account-transfer'])

/**
 * Returns true if `tx` should be counted as income.
 * Spaarpotje withdrawals (money returning from savings) are excluded.
 */
export function isIncomeTransaction(tx: Transaction): boolean {
  return tx.amount > 0 && !SPAARPOTJE_CATEGORIES.has(tx.category)
}

/**
 * Returns true if `tx` should be counted as an expense.
 * Spaarpotje deposits (money sent to savings) are excluded.
 */
export function isExpenseTransaction(tx: Transaction): boolean {
  return tx.amount < 0 && !SPAARPOTJE_CATEGORIES.has(tx.category)
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEY_RULES = 'financial-insights:category-rules'
export const STORAGE_KEY_OVERRIDES = 'financial-insights:category-overrides'
export const STORAGE_KEY_DEFAULT_NAME_OVERRIDES = 'financial-insights:default-name-overrides'

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
    /**
     * Spaarpotje deposit — money sent TO a named savings goal.
     * Applied by recategorize() based on counterpartyIban; never matched
     * via the rule engine (patterns is intentionally empty).
     */
    id: 'spaarpotje',
    name: 'Spaarpotje',
    color: '#30B0C7',
    icon: 'PiggyBank',
    patterns: [],
  },
  {
    /**
     * Spaarpotje withdrawal — money received FROM a named savings goal.
     * NOT counted as income. Applied by recategorize() based on counterpartyIban.
     */
    id: 'spaarpotje-withdrawal',
    name: 'Spaarpotje (opname)',
    color: '#5856D6',
    icon: 'PiggyBank',
    patterns: [],
  },
    {
      /**
       * Internal transfer — money sent to/from a registered personal account.
       * Assigned by recategorize() based on counterpartyIban matching the
       * user's manually-configured personal accounts list.
       * The `tb` transactionCode no longer acts as a fallback; unregistered
       * tb transfers fall through to uncategorized.
       */
      id: 'internal-transfer',
      name: 'Internal Transfer',
      color: '#8E8E93',
      icon: 'ArrowLeftRight',
      patterns: [],
    },
    {
      /**
       * Own Account Transfer — retained for backward compatibility with
       * existing category overrides. No longer auto-matched via transactionCode.
       */
      id: 'own-account-transfer',
      name: 'Own Account Transfer',
      color: '#8E8E93',
      icon: 'ArrowLeftRight',
      patterns: [],
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

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(tx: Transaction, cond: Condition): boolean {
  const { field, operator, value } = cond

  switch (field) {
    case 'description': {
      const haystack = `${tx.counterpartyName} ${tx.description}`.toLowerCase()
      const needle = value.toLowerCase()
      if (operator === 'contains')   return haystack.includes(needle)
      if (operator === 'equals')     return haystack.trim() === needle.trim()
      if (operator === 'startsWith') return haystack.startsWith(needle)
      return false
    }
    case 'counterpartyIban': {
      const iban = tx.counterpartyIban.toLowerCase()
      const needle = value.toLowerCase()
      if (operator === 'contains')   return iban.includes(needle)
      if (operator === 'equals')     return iban === needle
      if (operator === 'startsWith') return iban.startsWith(needle)
      return false
    }
    case 'direction': {
      if (operator === 'is') {
        const txIsCredit = tx.amount > 0
        return value === 'credit' ? txIsCredit : !txIsCredit
      }
      return false
    }
    case 'amount': {
      const absAmount = Math.abs(tx.amount)
      const threshold = parseFloat(value)
      if (isNaN(threshold)) return false
      if (operator === 'gte') return absAmount >= threshold
      if (operator === 'lte') return absAmount <= threshold
      return false
    }
    default:
      return false
  }
}

// ─── Core categorization function ─────────────────────────────────────────────

/**
 * Assign a category id to a single transaction.
 *
 * For each rule (in order), two matching strategies are supported:
 *
 * **New — condition-based** (custom rules created via the Rule Editor):
 *   If the rule has `conditions` (non-empty), all conditions are evaluated
 *   using the rule's `combinator` ('and' | 'or'). First matching rule wins.
 *
 * **Legacy — pattern-based** (DEFAULT_RULES):
 *   Falls back to the original transactionCodes / isCredit / amountMin /
 *   patterns evaluation when `conditions` is absent or empty.
 *
 * Designed for sync, rule-based use today.
 * Future: an async LLM-based replacement can drop in with the same signature
 * returning `Promise<string>` — callers need only await the result.
 */
export function categorize(tx: Transaction, rules: CategoryRule[]): string {
  for (const rule of rules) {
    // ── New: condition-based evaluation ─────────────────────────────────────
    if (rule.conditions && rule.conditions.length > 0) {
      const combinator = rule.combinator ?? 'and'
      const matches =
        combinator === 'and'
          ? rule.conditions.every((c) => evaluateCondition(tx, c))
          : rule.conditions.some((c) => evaluateCondition(tx, c))
      if (matches) return rule.id
      continue
    }

    // ── Legacy: pattern-based evaluation ────────────────────────────────────
    // Skip rules that have no active matcher — they would match every transaction.
    // Only the explicit `uncategorized` catch-all is allowed to match with no criteria.
    const hasTransactionCodes = rule.transactionCodes && rule.transactionCodes.length > 0
    const hasPatterns = rule.patterns && rule.patterns.length > 0
    const hasCreditFilter = rule.isCredit !== undefined
    const hasAmountFilter = rule.amountMin !== undefined
    if (!hasTransactionCodes && !hasPatterns && !hasCreditFilter && !hasAmountFilter && rule.id !== 'uncategorized') {
      continue
    }

    if (rule.transactionCodes && rule.transactionCodes.length > 0) {
      if (!rule.transactionCodes.includes(tx.transactionCode)) continue
    }

    if (rule.isCredit !== undefined) {
      const txIsCredit = tx.amount > 0
      if (rule.isCredit !== txIsCredit) continue
    }

    if (rule.amountMin !== undefined) {
      if (Math.abs(tx.amount) < rule.amountMin) continue
    }

    if (rule.patterns && rule.patterns.length > 0) {
      const haystack = `${tx.counterpartyName} ${tx.description}`.toLowerCase()
      const matched = rule.patterns.some((p) => haystack.includes(p.toLowerCase()))
      if (!matched) continue
    }

    // All applicable filters passed — this rule wins
    return rule.id
  }

  return 'uncategorized'
}

// ─── Rule migration utility ───────────────────────────────────────────────────

/**
 * Migrate a legacy custom rule (patterns-based) to the new condition format.
 * Rules that already have `conditions` are returned unchanged.
 *
 * Called by `useCategoryRules` on load from localStorage so old rules are
 * automatically upgraded when the user next opens the app.
 */
export function migrateCustomRule(rule: CategoryRule): CategoryRule {
  // Already uses new condition system — nothing to do
  if (rule.conditions !== undefined) return rule

  const conditions: Condition[] = (rule.patterns ?? []).map((p, i) => ({
    id: `migrated-${rule.id}-${i}`,
    field: 'description' as ConditionField,
    operator: 'contains' as ConditionOperator,
    value: p,
  }))

  // Multiple patterns were OR'd together in the legacy engine
  const combinator: 'and' | 'or' = conditions.length > 1 ? 'or' : 'and'

  return {
    id: rule.id,
    name: rule.name,
    color: rule.color,
    icon: rule.icon,
    conditions,
    combinator,
  }
}

// ─── Spaarpotje IBAN matcher ──────────────────────────────────────────────────

/**
 * Check whether a transaction's counterpartyIban matches a registered
 * spaarpotje. Returns the category + tag if matched, null otherwise.
 *
 * Priority: spaarpotje matching runs BEFORE custom rules and DEFAULT_RULES.
 *
 * - Outbound (amount < 0): category `spaarpotje`        (money → savings)
 * - Inbound  (amount > 0): category `spaarpotje-withdrawal` (money ← savings)
 */
export function matchSpaarpotje(
  tx: Transaction,
  accounts: SavingsAccount[],
): { category: string; tag: string } | null {
  if (!accounts.length || !tx.counterpartyIban) return null
  const needle = tx.counterpartyIban.toLowerCase().trim()
  const match = accounts.find((a) => a.iban.toLowerCase().trim() === needle)
  if (!match) return null
  return {
    category: tx.amount < 0 ? 'spaarpotje' : 'spaarpotje-withdrawal',
    tag: match.name,
  }
}

// ─── Personal account IBAN matcher ───────────────────────────────────────────

/**
 * Check whether a transaction's counterpartyIban matches an enabled personal
 * account. Returns true if matched, false otherwise.
 *
 * Priority: runs AFTER spaarpotje matching and manual overrides, BEFORE the
 * rule engine. Spaarpotje IBANs always take priority.
 */
export function matchPersonalAccount(
  tx: Transaction,
  accounts: import('@/types/personalAccount').PersonalAccount[],
): boolean {
  if (!accounts.length || !tx.counterpartyIban) return false
  const needle = tx.counterpartyIban.toLowerCase().trim()
  return accounts.some((a) => a.enabled && a.iban.toLowerCase().trim() === needle)
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
 * Read default category name overrides from localStorage.
 * Returns an empty object when nothing is stored or the value is unparseable.
 */
export function readDefaultNameOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Keep only entries where both key and value are strings
      const result: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === 'string' && typeof v === 'string') result[k] = v
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Return a new array of rules with `name` replaced for any rule whose `id`
 * has an entry in `overrides`. Rules without an override are unchanged.
 * DEFAULT_RULES themselves are never mutated.
 */
export function applyDefaultNameOverrides(
  rules: CategoryRule[],
  overrides: Record<string, string>,
): CategoryRule[] {
  if (Object.keys(overrides).length === 0) return rules
  return rules.map((r) =>
    Object.prototype.hasOwnProperty.call(overrides, r.id)
      ? { ...r, name: overrides[r.id] }
      : r,
  )
}

/**
 * Merge custom rules with the default ruleset.
 * Custom rules are prepended so they take priority over defaults.
 */
export function mergeRules(customRules: CategoryRule[]): CategoryRule[] {
  return [...customRules, ...DEFAULT_RULES]
}
