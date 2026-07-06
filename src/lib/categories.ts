import type { Transaction, TransactionCode } from '@/types/transaction'
import type { SavingsAccount } from '@/types/savingsAccount'
import type { PersonalAccount } from '@/types/personalAccount'

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

interface CategoryRuleBase {
  id: string
  /** Display name shown in the UI */
  name: string
  /** Hex color used in charts — macOS system palette */
  color: string
  /** Lucide icon name */
  icon: string

}

export interface ConditionRule extends CategoryRuleBase {
  kind: 'condition'
  /** Structured conditions — evaluated with `combinator`. */
  conditions: Condition[]
  /** How multiple conditions are combined. Defaults to 'and'. */
  combinator: 'and' | 'or'
}

export interface LegacyPatternRule extends CategoryRuleBase {
  kind: 'legacy'
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
  /** When set, rule only fires when |amount| <= amountMax */
  amountMax?: number
  /** When set: true = credit only (amount > 0), false = debit only (amount < 0) */
  isCredit?: boolean
}

export type CategoryRule = ConditionRule | LegacyPatternRule
export type CategoryRuleDraft = Omit<ConditionRule, 'id'> | Omit<LegacyPatternRule, 'id'>
export type CategoryRulePatch = Partial<CategoryRuleDraft>

export function isConditionRule(rule: CategoryRule): rule is ConditionRule {
  return rule.kind === 'condition'
}

export function isLegacyRule(rule: CategoryRule): rule is LegacyPatternRule {
  return rule.kind === 'legacy'
}

/** Per-transaction manual overrides: transactionId → categoryId */
export type CategoryOverrides = Record<string, string>

export interface CategorizationInputs {
  rules: CategoryRule[]
  overrides: CategoryOverrides
  savingsAccounts: SavingsAccount[]
  tagOverrides: Record<string, string[]>
  personalAccounts: PersonalAccount[]
}

// ─── Spaarpotje category helpers ─────────────────────────────────────────────

/**
 * Category IDs that represent savings-goal movements (spaarpotjes).
 * These are excluded from income and expense totals — moving money to/from
 * a named savings goal is not real income or spending.
 */
export const SPAARPOTJE_CATEGORIES = new Set(['spaarpotje', 'spaarpotje-withdrawal'])

/**
 * Rule IDs treated as internal-transfer aliases.
 *
 * `own-account-transfer` is kept here as a legacy alias for read-time
 * coercion/filtering of older persisted state.
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
    kind: 'legacy',
    id: 'income',
    name: 'Salary / Income',
    color: '#00C7BE',
    icon: 'TrendingUp',
    patterns: ['salaris', 'loon ', 'inkomen', 'cao '],
    isCredit: true,
  },
  {
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
    kind: 'legacy',
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
     *
     * Note: the former duplicate `own-account-transfer` default rule was
     * removed. Persisted references are coerced to `internal-transfer` at read-time.
     */
    kind: 'legacy',
    id: 'internal-transfer',
    name: 'Internal Transfer',
    color: '#8E8E93',
    icon: 'ArrowLeftRight',
    patterns: [],
  },
  {
    kind: 'legacy',
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

function matchesConditionRule(tx: Transaction, rule: ConditionRule): boolean {
  const combinator = rule.combinator
  return combinator === 'and'
    ? rule.conditions.every((condition) => evaluateCondition(tx, condition))
    : rule.conditions.some((condition) => evaluateCondition(tx, condition))
}

function matchesLegacyRule(tx: Transaction, rule: LegacyPatternRule): boolean {
  // Skip rules that have no active matcher — they would match every transaction.
  // Only the explicit `uncategorized` catch-all is allowed to match with no criteria.
  const hasTransactionCodes = (rule.transactionCodes?.length ?? 0) > 0
  const hasPatterns = rule.patterns.length > 0
  const hasCreditFilter = rule.isCredit !== undefined
  const hasAmountMinFilter = rule.amountMin !== undefined
  const hasAmountMaxFilter = rule.amountMax !== undefined
  if (!hasTransactionCodes && !hasPatterns && !hasCreditFilter && !hasAmountMinFilter && !hasAmountMaxFilter && rule.id !== 'uncategorized') {
    return false
  }

  if (hasTransactionCodes && !rule.transactionCodes?.includes(tx.transactionCode)) {
    return false
  }

  if (rule.isCredit !== undefined) {
    const txIsCredit = tx.amount > 0
    if (rule.isCredit !== txIsCredit) {
      return false
    }
  }

  if (rule.amountMin !== undefined && Math.abs(tx.amount) < rule.amountMin) {
    return false
  }

  if (rule.amountMax !== undefined && Math.abs(tx.amount) > rule.amountMax) {
    return false
  }

  if (hasPatterns) {
    const haystack = `${tx.counterpartyName} ${tx.description}`.toLowerCase()
    const matched = rule.patterns.some((pattern) => haystack.includes(pattern.toLowerCase()))
    if (!matched) {
      return false
    }
  }

  return true
}

const RULE_MATCHERS = {
  condition: matchesConditionRule,
  legacy: matchesLegacyRule,
} satisfies {
  [K in CategoryRule['kind']]: (tx: Transaction, rule: Extract<CategoryRule, { kind: K }>) => boolean
}

/**
 * Assign a category id to a single transaction.
 *
 * For each rule (in order), matching is delegated by `rule.kind`:
 *
 * - `condition`: evaluates structured conditions using the configured combinator.
 * - `legacy`: evaluates pattern/code/amount/direction filters.
 *
 * Designed for sync, rule-based use today.
 * Future: an async LLM-based replacement can drop in with the same signature
 * returning `Promise<string>` — callers need only await the result.
 */
export function categorize(tx: Transaction, rules: CategoryRule[]): string {
  for (const rule of rules) {
    const matcher = RULE_MATCHERS[rule.kind] as (txValue: Transaction, ruleValue: CategoryRule) => boolean
    if (matcher(tx, rule)) {
      return rule.id
    }
  }

  return 'uncategorized'
}

// ─── Rule migration utility ───────────────────────────────────────────────────

function normalizeCategoryId(categoryId: string): string {
  return categoryId === 'own-account-transfer' ? 'internal-transfer' : categoryId
}

function coerceCondition(raw: unknown, fallbackId: string, index: number): Condition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const value = raw as Record<string, unknown>
  const id = typeof value.id === 'string' && value.id.trim().length > 0
    ? value.id
    : `coerced-${fallbackId}-${index}`

  const field = value.field
  const operator = value.operator
  const conditionValue = value.value

  const validField = field === 'description' || field === 'counterpartyIban' || field === 'direction' || field === 'amount'
  const validOperator = operator === 'contains' || operator === 'equals' || operator === 'startsWith' || operator === 'is' || operator === 'gte' || operator === 'lte'

  if (!validField || !validOperator || typeof conditionValue !== 'string') {
    return null
  }

  return {
    id,
    field,
    operator,
    value: conditionValue,
  }
}

function coerceRule(raw: unknown): CategoryRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const value = raw as Record<string, unknown>
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.color !== 'string' ||
    typeof value.icon !== 'string'
  ) {
    return null
  }

  const id = normalizeCategoryId(value.id)
  const kind = value.kind

  if (kind === 'condition' || Array.isArray(value.conditions)) {
    const conditions = (Array.isArray(value.conditions) ? value.conditions : [])
      .map((condition, index) => coerceCondition(condition, id, index))
      .filter((condition): condition is Condition => condition !== null)

    return {
      kind: 'condition',
      id,
      name: value.name,
      color: value.color,
      icon: value.icon,
      conditions,
      combinator: value.combinator === 'or' ? 'or' : 'and',
    }
  }

  const transactionCodes = Array.isArray(value.transactionCodes)
    ? value.transactionCodes.filter((code): code is TransactionCode => typeof code === 'string')
    : undefined

  return {
    kind: 'legacy',
    id,
    name: value.name,
    color: value.color,
    icon: value.icon,
    patterns: Array.isArray(value.patterns)
      ? value.patterns.filter((pattern): pattern is string => typeof pattern === 'string')
      : [],
    transactionCodes,
    amountMin: typeof value.amountMin === 'number' ? value.amountMin : undefined,
    amountMax: typeof value.amountMax === 'number' ? value.amountMax : undefined,
    isCredit: typeof value.isCredit === 'boolean' ? value.isCredit : undefined,
  }
}

/**
 * Migrate a legacy custom rule (patterns-based) to the new condition format.
 * Rules that already have `kind: 'condition'` are returned unchanged.
 *
 * Called by `useCategoryRules` on load from localStorage so old rules are
 * automatically upgraded when the user next opens the app.
 */
export function migrateCustomRule(rule: CategoryRule): CategoryRule {
  if (isConditionRule(rule)) return rule

  // Keep advanced legacy rules as-is to preserve semantics.
  const hasLegacyOnlyFilters =
    (rule.transactionCodes?.length ?? 0) > 0 ||
    rule.isCredit !== undefined ||
    rule.amountMin !== undefined ||
    rule.amountMax !== undefined
  if (hasLegacyOnlyFilters) {
    return rule
  }

  const conditions: Condition[] = rule.patterns.map((pattern, index) => ({
    id: `migrated-${rule.id}-${index}`,
    field: 'description' as ConditionField,
    operator: 'contains' as ConditionOperator,
    value: pattern,
  }))

  // Multiple patterns were OR'd together in the legacy engine
  const combinator: 'and' | 'or' = conditions.length > 1 ? 'or' : 'and'

  return {
    kind: 'condition',
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
 * Priority: runs as a fallback AFTER the rule engine. Spaarpotje/manual
 * precedence is handled by callers before this matcher is consulted.
 */
export function matchPersonalAccount(
  tx: Transaction,
  accounts: PersonalAccount[],
): boolean {
  if (!accounts.length || !tx.counterpartyIban) return false
  const needle = tx.counterpartyIban.toLowerCase().trim()
  return accounts.some((a) => a.enabled && a.iban.toLowerCase().trim() === needle)
}

/**
 * Categorize a transaction with personal-account fallback.
 *
 * Priority: rule engine first (custom + default), personal accounts after.
 * If a rule matches, its category wins. Only uncategorized transactions can
 * fall back to `internal-transfer` via personal-account IBAN matching.
 */
export function categorizeWithPersonalFallback(
  tx: Transaction,
  rules: CategoryRule[],
  personalAccounts: PersonalAccount[],
): string {
  const ruleCategory = categorize(tx, rules)
  if (ruleCategory !== 'uncategorized') return ruleCategory
  return matchPersonalAccount(tx, personalAccounts) ? 'internal-transfer' : ruleCategory
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function buildCategorizedTransactions(
  transactions: Transaction[],
  inputs: CategorizationInputs,
): Transaction[] {
  // Exclude tb-based fallback rules — internal-transfer only via explicit Personal Accounts.
  const rules = mergeRules(inputs.rules).filter((rule) => !INTERNAL_TRANSFER_RULE_IDS.has(rule.id))

  return transactions.map((tx) => {
    // 1. Spaarpotje IBAN match — highest priority, overrides all rules
    const potMatch = matchSpaarpotje(tx, inputs.savingsAccounts)
    if (potMatch) {
      const tags = inputs.tagOverrides[tx.id] ?? [potMatch.tag]
      if (tx.category === potMatch.category && sameTags(tags, tx.tags ?? [])) {
        return tx
      }
      return { ...tx, category: potMatch.category, tags }
    }

    // 2. Manual category override wins over auto-classification
    const manualOverride = inputs.overrides[tx.id]
    if (manualOverride !== undefined) {
      const tags = inputs.tagOverrides[tx.id] ?? []
      if (tx.category === manualOverride && sameTags(tags, tx.tags ?? [])) {
        return tx
      }
      return { ...tx, category: manualOverride, tags }
    }

    // 3. Rule engine first; personal-account fallback applies only when uncategorized.
    const category = categorizeWithPersonalFallback(tx, rules, inputs.personalAccounts)
    const tags = inputs.tagOverrides[tx.id] ?? []

    if (category === tx.category && sameTags(tags, tx.tags ?? [])) {
      return tx
    }

    return { ...tx, category, tags }
  })
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
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((rule) => coerceRule(rule))
      .filter((rule): rule is CategoryRule => rule !== null)
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
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: CategoryOverrides = {}
      for (const [txId, categoryId] of Object.entries(parsed)) {
        if (typeof categoryId === 'string') {
          result[txId] = normalizeCategoryId(categoryId)
        }
      }
      return result
    }
    return {}
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
