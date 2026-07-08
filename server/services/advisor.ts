/**
 * LangGraph conversational financial advisor — issue #21.
 *
 * Stateful ReAct agent with 6 function tools that query the in-memory
 * transaction store. Uses MemorySaver for per-thread conversation history
 * (session-scoped — resets on server restart by design).
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { MemorySaver } from '@langchain/langgraph'
import { tool } from '@langchain/core/tools'
import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createLLMClient, type LLMClient } from './llm.js'
import { getTransactions,
  getByMonth,
  getByYear,
  getByDateRange,
  getAvailableMonths,
} from './transactionStore.js'
import { runBatchCategorization, DEFAULT_AVAILABLE_CATEGORIES, ALL_BUILT_IN_CATEGORY_NAMES } from './categorizer.js'
import { searchKnowledge, getKnowledgeStatus } from './knowledgeBase.js'
import type { StateStore } from './stateStore.js'

// ─── Category display name helper ────────────────────────────────────────────

/**
 * Build an ID → display name map with the same priority as the frontend:
 *   1. Custom rule names (stateStore `rules`)
 *   2. User-overridden built-in names (stateStore `default-name-overrides`)
 *   3. ALL_BUILT_IN_CATEGORY_NAMES from categorizer (server-side source of truth)
 */
async function buildCategoryNameMap(stateStore: StateStore): Promise<Map<string, string>> {
  const map = new Map<string, string>(Object.entries(ALL_BUILT_IN_CATEGORY_NAMES))

  // Layer 2: user-overridden names for built-in categories
  const nameOverrides = await stateStore
    .read<Record<string, string>>('default-name-overrides')
    .catch(() => null)
  if (nameOverrides) {
    for (const [id, name] of Object.entries(nameOverrides)) {
      map.set(id, name)
    }
  }

  // Layer 1 (highest priority): custom rule names
  const stored = await stateStore
    .read<{ rules: Array<{ id: string; name: string }> }>('rules')
    .catch(() => null)
  for (const rule of stored?.rules ?? []) {
    map.set(rule.id, rule.name)
  }

  return map
}

// ─── Memory (in-process, resets on server restart) ────────────────────────────

const memory = new MemorySaver()

/**
 * Clear the MemorySaver checkpoint for a specific thread.
 * Called by DELETE /api/llm/chat/:threadId so "New conversation" immediately
 * frees memory rather than waiting for a server restart.
 *
 * Uses the public `MemorySaver.deleteThread()` API introduced in LangGraph ≥0.2.
 */
export function clearAdvisorThread(threadId: string): void {
  void memory.deleteThread(threadId)
}

// ─── Tool helpers ─────────────────────────────────────────────────────────────

function cap(str: string, maxLen = 2000): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

function formatPeriod(period: string) {
  if (period === 'all') return getTransactions()
  if (/^\d{4}-\d{2}$/.test(period)) return getByMonth(period)
  if (/^\d{4}$/.test(period)) return getByYear(period)
  return getTransactions()
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const getTransactionSummaryTool = tool(
  async ({ startDate, endDate }) => {
    const txs = getByDateRange(startDate, endDate)
    const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    return cap(JSON.stringify({ income, expenses, net: income - expenses, count: txs.length }))
  },
  {
    name: 'getTransactionSummary',
    description: 'Get income, expense, and net totals for a date range',
    schema: z.object({
      startDate: z.string().describe('ISO date YYYY-MM-DD'),
      endDate: z.string().describe('ISO date YYYY-MM-DD'),
    }),
  },
)

const getTopMerchantsTool = tool(
  async ({ period, limit }) => {
    const txs = formatPeriod(period).filter((t) => t.amount < 0)
    const byMerchant = new Map<string, number>()
    for (const tx of txs) {
      byMerchant.set(tx.counterpartyName, (byMerchant.get(tx.counterpartyName) ?? 0) + Math.abs(tx.amount))
    }
    const top = [...byMerchant.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, amount]) => ({ name, amount }))
    return cap(JSON.stringify(top))
  },
  {
    name: 'getTopMerchants',
    description: 'Get top merchants by total spend for a period',
    schema: z.object({
      period: z.string().describe("YYYY-MM or YYYY or 'all'"),
      limit: z.number().default(10),
    }),
  },
)


const getMonthComparisonTool = tool(
  async ({ month1, month2 }) => {
    const txs1 = getByMonth(month1)
    const txs2 = getByMonth(month2)

    function summarise(txs: ReturnType<typeof getByMonth>) {
      const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      return { income, expenses, net: income - expenses, count: txs.length }
    }

    return cap(JSON.stringify({ [month1]: summarise(txs1), [month2]: summarise(txs2) }))
  },
  {
    name: 'getMonthComparison',
    description: 'Compare two months side by side',
    schema: z.object({
      month1: z.string().describe('YYYY-MM'),
      month2: z.string().describe('YYYY-MM'),
    }),
  },
)

const getSavingsTrendTool = tool(
  async ({ months }) => {
    const allTxs = getTransactions()
    // Get distinct months, sorted desc, take last N
    const allMonths = [...new Set(allTxs.map((t) => t.date.slice(0, 7)))].sort().slice(-months)

    const trend = allMonths.map((month) => {
      const txs = getByMonth(month)
      const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const net = income - expenses
      return { month, income, expenses, net, savingsRate: income > 0 ? (net / income) * 100 : 0 }
    })

    return cap(JSON.stringify(trend))
  },
  {
    name: 'getSavingsTrend',
    description: 'Get monthly savings rate trend over the last N months',
    schema: z.object({
      months: z.number().default(6).describe('Number of recent months to include'),
    }),
  },
)

const searchFinancialKnowledgeTool = tool(
  async ({ query }) => searchKnowledge(query),
  {
    name: 'searchFinancialKnowledge',
    description:
      'Search grounding documents for financial norms, budget guidelines, savings benchmarks, ' +
      'tax thresholds, or any general financial advice. Use when the user asks for guidance, ' +
      'targets, or context not derivable from their own transaction data. ' +
      'Do NOT call this for data-only questions like top merchants or monthly totals. ' +
      'The tool returns a JSON object: { results: [{ snippet, sourceName, link? }] }. ' +
      'Use the snippet content in your answer. Always cite your sources in the response.',
    schema: z.object({
      query: z.string().describe('Natural language search query'),
    }),
  },
)

function buildSystemPrompt(): string {
  const months = getAvailableMonths()
  const monthsList = months.length > 0
    ? months.join(', ')
    : 'no data loaded yet'
  const latest = months.length > 0 ? months[months.length - 1] : null

  const kbStatus = getKnowledgeStatus()
  const kbNote = kbStatus.status === 'ready' || (kbStatus.status === 'not_configured' && kbStatus.chunkCount > 0)
    ? `\nKnowledge base: ${kbStatus.chunkCount} chunks indexed from ${kbStatus.sourceCount} source(s). ` +
      `Use searchFinancialKnowledge when the user asks for financial norms, benchmarks, budget guidelines, ` +
      `tax thresholds, or general advice not derivable from transaction data.`
    : kbStatus.status === 'building'
      ? '\nKnowledge base is currently being built. Avoid searchFinancialKnowledge until it is ready.'
      : '\nNo knowledge base configured. Do not call searchFinancialKnowledge.'

  return `You are a friendly, knowledgeable Dutch personal finance advisor.
You have access to the user's Rabobank transaction data via your tools.
Always use tools to look up data — never guess or hallucinate numbers.
Keep responses concise and actionable. Use € for amounts.
If asked about future predictions, be appropriately cautious.
Dutch merchant names in the data are normal — Rabobank is a Dutch bank.
Raw IBANs and personal data are not available to you for privacy reasons.

Available data periods: ${monthsList}${latest ? `\nMost recent month: ${latest}` : ''}
${kbNote}

IMPORTANT — citations when using the knowledge base:
- ONLY cite sources returned by searchFinancialKnowledge — never from memory, general knowledge, or training data.
- The tool returns JSON: { results: [{ snippet, sourceName, link? }] }
- Use the \`sourceName\` field EXACTLY as returned — do not rephrase, abbreviate, or change it.
- For the URL, use the \`link\` field EXACTLY as returned. If the result has no \`link\` field, write the source name only — NEVER construct, guess, or infer a URL from the source name or from general knowledge.
- Format inline citations as: [sourceName] after the relevant sentence.
- At the end of your answer, add a "Sources" section ONLY if you used this tool AND got results:
    Sources:
    - [sourceName](exact link from tool) — or just "sourceName" when no link was returned
- If the tool returned no results, or you did not call the tool, do NOT add a Sources section.
- Never add citations for facts that came from your own training data, even if you happen to know the topic.

IMPORTANT — time period handling:
- When the user asks a question that does not specify a time period (e.g. "where am I spending the most?", "what are my biggest expenses?"), you MUST ask which period they want before calling any tool.
- Offer concrete options based on the available periods above, for example: last month (${latest ?? 'N/A'}), last 3 months, last 6 months, a specific month, or all-time.
- Only skip asking if the question already contains a clear time reference (e.g. "last month", "in June", "this year", "over the last 3 months") or if the user is asking a follow-up within the same conversation where the period is already established.
- For month comparisons, ask which two months to compare if not specified.`
}

// ─── Agent factory ────────────────────────────────────────────────────────────

let _advisor: ReturnType<typeof createReactAgent> | null = null

export function getAdvisor(
  stateStore: StateStore,
  llm: LLMClient | null = createLLMClient(),
): ReturnType<typeof createReactAgent> | null {
  if (!llm) return null

  // Lazy singleton — recreate if LLM config changes would require it
  if (!_advisor) {
    const getCategoryBreakdownTool = tool(
      async ({ period }) => {
        const txs = formatPeriod(period).filter((t) => t.amount < 0)
        const nameMap = await buildCategoryNameMap(stateStore)
        const byCategory = new Map<string, number>()
        for (const tx of txs) {
          byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + Math.abs(tx.amount))
        }
        const breakdown = [...byCategory.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([id, amount]) => ({ name: nameMap.get(id) ?? id, amount }))
        return cap(JSON.stringify(breakdown))
      },
      {
        name: 'getCategoryBreakdown',
        description: 'Get spending breakdown by category for a period',
        schema: z.object({
          period: z.string().describe("YYYY-MM or YYYY or 'all'"),
        }),
      },
    )

    const getBiggestTransactionsTool = tool(
      async ({ type, period, limit }) => {
        let txs = period ? formatPeriod(period) : getTransactions()
        if (type === 'expense') txs = txs.filter((t) => t.amount < 0)
        else if (type === 'income') txs = txs.filter((t) => t.amount > 0)

        const nameMap = await buildCategoryNameMap(stateStore)
        const top = [...txs]
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
          .slice(0, limit)
          .map((tx) => ({
            date: tx.date,
            counterpartyName: tx.counterpartyName,
            amount: tx.amount,
            category: nameMap.get(tx.category) ?? tx.category,
            description: tx.description.slice(0, 60),
          }))
        return cap(JSON.stringify(top))
      },
      {
        name: 'getBiggestTransactions',
        description: 'Get the largest individual transactions by absolute amount',
        schema: z.object({
          type: z.enum(['expense', 'income', 'both']),
          period: z.string().optional(),
          limit: z.number().default(5),
        }),
      },
    )

    const runCategorizationTool = tool(
      async ({ period }) => {
        const label = period ? `period ${period}` : 'all transactions'
        try {
          // Merge custom rules (from StateStore) with defaults so the LLM
          // is aware of user-defined categories. Custom rules are prepended —
          // first match wins during name→ID resolution.
          const stored = await stateStore
            .read<{ rules: Array<{ id: string; name: string }> }>('rules')
            .catch(() => null)
          const customRules = (stored?.rules ?? []).map((r) => ({ id: r.id, name: r.name }))
          const availableCategories = [...customRules, ...DEFAULT_AVAILABLE_CATEGORIES]

          const results = await runBatchCategorization(period ?? undefined, undefined, availableCategories)
          await stateStore.write<Record<string, unknown>>('categories', results)
          const count = Object.keys(results).length
          return `Categorized ${count} transactions (${label}). Categories saved — the UI will update automatically.`
        } catch (err) {
          return `Categorization failed: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'runCategorization',
        description:
          'Run AI categorization on transactions. Call when the user asks to categorize, ' +
          're-categorize, improve, or fix category labels. Use period to restrict to a ' +
          'specific month (YYYY-MM) or year (YYYY). Omit period to categorize everything.',
        schema: z.object({
          period: z
            .string()
            .optional()
            .describe("Optional: 'YYYY-MM' for a month, 'YYYY' for a year. Omit for all transactions."),
        }),
      },
    )

    _advisor = createReactAgent({
      llm,
      tools: [
        getTransactionSummaryTool,
        getTopMerchantsTool,
        getCategoryBreakdownTool,
        getBiggestTransactionsTool,
        getMonthComparisonTool,
        getSavingsTrendTool,
        runCategorizationTool,
        searchFinancialKnowledgeTool,
      ],
      checkpointSaver: memory,
      messageModifier: (messages) => [new SystemMessage(buildSystemPrompt()), ...messages],
    })
  }

  return _advisor
}
