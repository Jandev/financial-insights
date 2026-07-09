/**
 * Core batch categorization service — shared by the HTTP route and the
 * advisor LangGraph tool.
 *
 * Accepts an optional period filter:
 *   'YYYY-MM'  → only transactions in that month
 *   'YYYY'     → only transactions in that year
 *   undefined  → all transactions
 *
 * Accepts an optional `availableCategories` list (id + display name).
 * When provided (e.g. with custom user rules prepended), the LLM is
 * constrained to only those names and results are resolved to IDs before
 * being stored — so the overlay is always ID-based, matching tx.category.
 */

import { z } from 'zod'
import { createLLMClient, getLLMInfo } from './llm.js'
import { asLLMRequestError, normalizeLLMError } from './llmErrors.js'
import {
  getTransactions,
  getByMonth,
  getByYear,
} from './transactionStore.js'
import type { TxSnapshot } from './transactionStore.js'

// ─── Shared constants ─────────────────────────────────────────────────────────

export const BATCH_SIZE = 30

/**
 * Default category list (id → display name) used when no custom rules are
 * provided. Mirrors DEFAULT_RULES in src/lib/categories.ts — keep in sync.
 */
export const DEFAULT_AVAILABLE_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'groceries',            name: 'Groceries' },
  { id: 'dining',               name: 'Dining & Cafes' },
  { id: 'transport',            name: 'Transport' },
  { id: 'utilities',            name: 'Utilities' },
  { id: 'healthcare',           name: 'Healthcare' },
  { id: 'subscriptions',        name: 'Subscriptions' },
  { id: 'income',               name: 'Salary / Income' },
  { id: 'rent',                 name: 'Rent / Mortgage' },
  { id: 'own-account-transfer', name: 'Own Account Transfer' },
  { id: 'uncategorized',        name: 'Other' },
]

/**
 * Complete ID → display name map for all built-in categories, including
 * system-assigned ones that the LLM cannot pick (spaarpotje, internal-transfer).
 * Derived from DEFAULT_AVAILABLE_CATEGORIES so names stay in sync.
 * Mirrors DEFAULT_RULES in src/lib/categories.ts — keep in sync.
 */
export const ALL_BUILT_IN_CATEGORY_NAMES: Record<string, string> = {
  ...Object.fromEntries(DEFAULT_AVAILABLE_CATEGORIES.map((c) => [c.id, c.name])),
  // System-assigned (not LLM-assignable, so absent from DEFAULT_AVAILABLE_CATEGORIES)
  'spaarpotje':            'Spaarpotje',
  'spaarpotje-withdrawal': 'Spaarpotje (opname)',
  'internal-transfer':     'Internal Transfer',
}

export const CATEGORIZE_SYSTEM_PROMPT = `You are a Dutch personal finance transaction categorizer.
Classify each transaction into exactly one category based on the counterparty name and description.
Transaction codes: 'bc'=card payment, 'ei'=SEPA direct debit, 'cb'=incoming credit/Tikkie, 'tb'=own-bank transfer.
Counterparty names may be in Dutch or English. Amount is negative for expenses, positive for income.
Return confidence 0-1 and a short reasoning (max 150 chars).`

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryResult {
  category: string
  confidence: number
  reasoning: string
  source: 'llm' | 'rule'
}

export type CategoryResultMap = Record<string, CategoryResult>

/** Optional progress callback for streaming use-cases (e.g. SSE route). */
export type ProgressCallback = (
  processed: number,
  total: number,
  batchResults: Array<{ id: string; category: string; confidence: number; reasoning: string }>,
) => void

// ─── Period filter helper ─────────────────────────────────────────────────────

function resolvePeriod(period?: string): TxSnapshot[] {
  if (!period || period === 'all') return getTransactions()
  if (/^\d{4}-\d{2}$/.test(period)) return getByMonth(period)
  if (/^\d{4}$/.test(period)) return getByYear(period)
  return getTransactions()
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Run batch LLM categorization for a subset of transactions.
 *
 * @param period  Optional period filter: 'YYYY-MM', 'YYYY', or undefined for all.
 * @param onProgress  Optional callback invoked after each batch completes.
 * @param availableCategories  Category list to expose to the LLM.
 *   Defaults to DEFAULT_AVAILABLE_CATEGORIES. Prepend custom rules to give
 *   them priority in name→ID resolution (first match wins).
 * @returns  Map of transaction ID → CategoryResult (category field is an ID).
 * @throws  When no LLM client is configured.
 */
export async function runBatchCategorization(
  period?: string,
  onProgress?: ProgressCallback,
  availableCategories: Array<{ id: string; name: string }> = DEFAULT_AVAILABLE_CATEGORIES,
): Promise<CategoryResultMap> {
  const llm = createLLMClient()
  if (!llm) throw new Error('LLM not configured')

  const txs = resolvePeriod(period)

  // Deduplicate names (custom rules can shadow default names) — preserve order
  // so the first entry for a given name is used for ID resolution.
  const seenNames = new Set<string>()
  const uniqueCategories = availableCategories.filter(({ name }) => {
    if (seenNames.has(name)) return false
    seenNames.add(name)
    return true
  })

  const categoryNames = uniqueCategories.map((c) => c.name) as [string, ...string[]]

  // Build schema dynamically — the enum prevents hallucinated category names.
  const BatchResultSchema = z.object({
    results: z.array(
      z.object({
        id: z.string(),
        category: z.enum(categoryNames),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().max(150),
      }),
    ),
  })

  /** Resolve a display name back to the first matching rule ID. */
  function resolveId(name: string): string {
    return uniqueCategories.find((c) => c.name === name)?.id ?? 'uncategorized'
  }

  const structured = llm.withStructuredOutput(BatchResultSchema)
  const allResults: CategoryResultMap = {}
  let processed = 0

  for (let i = 0; i < txs.length; i += BATCH_SIZE) {
    const batch = txs.slice(i, i + BATCH_SIZE)
    const input = batch.map((tx) => ({
      id: tx.id,
      counterpartyName: tx.counterpartyName,
      description: tx.description.slice(0, 100),
      amount: tx.amount,
      transactionCode: tx.transactionCode,
    }))

    try {
      const result = await structured.invoke([
        { role: 'system', content: CATEGORIZE_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ])

      // Resolve names → IDs so the overlay is always ID-based
      const resolvedBatch = result.results.map((r) => ({
        ...r,
        category: resolveId(r.category),
      }))

      for (const r of resolvedBatch) {
        allResults[r.id] = {
          category: r.category,  // now an ID, e.g. 'groceries'
          confidence: r.confidence,
          reasoning: r.reasoning,
          source: 'llm',
        }
      }

      processed += batch.length
      onProgress?.(processed, txs.length, resolvedBatch)
    } catch (err) {
      const normalized = normalizeLLMError(err, { llm: getLLMInfo().info, feature: 'categorize' })
      if (normalized.isCompatibilityError) {
        throw asLLMRequestError(err, { llm: getLLMInfo().info, feature: 'categorize' })
      }
      // Rule-based fallback for this batch
      for (const tx of batch) {
        allResults[tx.id] = {
          category: tx.category || 'uncategorized',
          confidence: 0,
          reasoning: 'rule-based fallback',
          source: 'rule',
        }
      }
      processed += batch.length
      onProgress?.(processed, txs.length, [])
    }
  }

  return allResults
}
