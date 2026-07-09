# AI Advisor

The AI Advisor is a conversational financial assistant powered by a LangGraph ReAct agent. It can answer questions about your transactions, compare months, analyze spending by category, and trigger categorization.

## Access points

| Location | How |
|---|---|
| Full page | `/ai-advisor` route |
| Floating panel | Chat button, bottom-right corner on all pages |

## Architecture

- **Agent type:** LangGraph ReAct (reason + act loop)
- **Memory:** `MemorySaver` — per-thread, in-process. Conversation history is preserved within a session but resets on server restart (by design — no sensitive data is persisted).
- **Streaming:** responses stream token-by-token via SSE (`GET /api/llm/chat/:threadId/stream`)
- **Thread lifecycle:** new thread per conversation. Clear via the trash icon in the chat UI, which calls `DELETE /api/llm/chat/:threadId`.

## Tools

The agent has 7 tools backed by the in-memory transaction store.

### `getTransactionSummary`

Returns total income, expenses, and net for a date range.

```
{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
```

### `getTopMerchants`

Returns the top N merchants by spend for a given period.

```
{ period: "YYYY-MM" | "YYYY" | "all", limit: number }
```

### `getCategoryBreakdown`

Returns spending totals per category for a period.

```
{ period: "YYYY-MM" | "YYYY" | "all" }
```

### `getBiggestTransactions`

Returns the largest individual transactions by amount.

```
{ type: "expense" | "income" | "both", period?: "YYYY-MM" | "YYYY", limit: number }
```

### `getMonthComparison`

Compares two months side-by-side: income, expenses, net savings, and delta.

```
{ month1: "YYYY-MM", month2: "YYYY-MM" }
```

### `getSavingsTrend`

Returns monthly savings rate as a percentage over the last N months.

```
{ months: number }
```

### `runCategorization`

Triggers the AI batch categorization pipeline (same as the "AI Categorize" button). Merges custom rules, sends uncategorized transactions to the LLM in batches of 30, writes results to `data/state/categories.json`, and signals the frontend via a `categories_updated` SSE event.

```
{ period?: "YYYY-MM" | "YYYY" }   // optional — limit to a specific period
```

> Note: this tool initiates a potentially long-running operation. The advisor will report completion when the pipeline finishes.

## System prompt behavior

- Responds in Dutch by default (matches the Rabobank data locale).
- Uses `€` for all monetary amounts.
- Does not include IBANs in summaries (privacy).
- Spaarpotje and internal-transfer transactions are excluded from financial summaries by default.

## Transaction data sync

The advisor operates on a server-side in-memory transaction store (`transactionStore`). This store is populated when the frontend loads CSVs (`POST /api/llm/transactions/sync`). A staleness check (`GET /api/llm/transactions/count`) runs on mount — if the server count diverges from the frontend count (e.g. after a restart), a re-sync is triggered automatically.

The store is also persisted to `data/state/transactions.json` on write, so it survives server restarts without requiring a manual re-sync.

## LLM configuration

The advisor uses the same LLM instance as other AI features. Provider priority:

1. Azure OpenAI (if `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` set)
2. Direct OpenAI (if `OPENAI_API_KEY` set)

Mode is configured per provider:

- `AZURE_OPENAI_API_MODE=chat|responses`
- `OPENAI_API_MODE=chat|responses`

Compatibility examples:

- `gpt-4o-mini` and `gpt-5.2-chat` → `chat`
- `gpt-5.3-codex` → `responses`
- `gpt-5.4` → provider/API-version dependent

The `LLMGate` component on the frontend hides the chat button when no LLM is configured. Check availability via `GET /api/llm/status`.

## LangSmith tracing

Set `LANGSMITH_TRACING=true` in `.env` to trace all LangGraph runs to LangSmith. Each conversation thread appears as a separate trace. See README for full env var reference.
