# API Reference

All endpoints are served by the Express server (default port `3000`). In local dev (`npm run dev:full`), Vite proxies `/api/*` from port `5173` to `3000` automatically.

LLM endpoints are rate-limited to **20 requests / minute / IP**.

---

## Infrastructure

### `GET /api/health`

Liveness check used by the Docker healthcheck.

**Response**
```json
{ "status": "ok", "timestamp": "2024-01-15T10:00:00.000Z", "paths": { "transactions": "/app/data/transactions", "state": "/app/data/state" } }
```

---

### `GET /api/config`

Non-secret configuration for the browser client.

**Response**
```json
{ "appTitle": "Financial Insights", "transactionsAvailable": true }
```

`appTitle` is controlled by the `APP_TITLE` env var. `transactionsAvailable` is `true` when at least one CSV exists in `TRANSACTIONS_PATH`.

---

## Transactions (CSV files)

### `GET /api/transactions`

Lists CSV filenames available in `TRANSACTIONS_PATH`.

**Response**
```json
["CSV_A_2024-01.csv", "CSV_A_2024-02.csv"]
```

---

### `GET /api/transactions/:filename`

Streams a single CSV file. Protected against path traversal — only files within `TRANSACTIONS_PATH` are served.

**Response:** `text/csv` stream.

---

## State persistence

All state endpoints use the same shape: GET returns the current value, PUT replaces it entirely.

| Endpoint | State key | Description |
|---|---|---|
| `GET/PUT /api/state/exclusions` | `exclusions.json` | Set of excluded transaction IDs |
| `GET/PUT /api/state/categories` | `categories.json` | AI + manual category assignments (`txId → category`) |
| `GET/PUT /api/state/rules` | `rules.json` | Custom category rules array |
| `GET/PUT /api/state/spaarpotjes` | `spaarpotjes.json` | Savings goal definitions |
| `GET/PUT /api/state/tag-overrides` | `tag-overrides.json` | Per-transaction tag overrides (`txId → string[]`) |
| `GET/PUT /api/state/dismissed` | `dismissed.json` | Dismissed anomaly finding IDs |

---

### `GET /api/state/anomalies`

Read-only. Returns the last cached anomaly findings written by the analysis pipeline.

---

### `GET /api/state/summary`

Returns metadata about all state files: which keys exist, `lastUpdated` timestamps, and file sizes in bytes. Does not return the file contents.

---

### `POST /api/state/reset`

Deletes all state files. **Irreversible.** Intended for the Danger Zone reset in Settings.

**Response:** `{ "ok": true }`

---

## LLM

All LLM endpoints require the server to be started with valid LLM credentials in `.env`.

---

### `GET /api/llm/status`

Returns LLM availability and provider metadata.

**Response**
```json
{ "available": true, "provider": "azure", "model": "gpt-4o-mini", "deployment": "gpt-4o-mini" }
```

`available: false` when no LLM credentials are configured.

---

### `GET /api/llm/transactions/count`

Returns the number of transactions currently in the server-side store and when they were last loaded.

**Response**
```json
{ "count": 1842, "loadedAt": "2024-01-15T09:55:00.000Z" }
```

Used by `useTransactionSync` to detect staleness after a server restart.

---

### `POST /api/llm/transactions/sync`

Loads the transaction dataset into the server-side in-memory store and persists it to `data/state/transactions.json`.

**Request body:** array of transaction objects (the full parsed CSV payload from the frontend).

**Response:** `{ "ok": true, "count": 1842 }`

---

### `POST /api/llm/categorize`

Runs AI batch categorization on uncategorized transactions. Streams progress via SSE.

**Request body**
```json
{ "transactions": [...], "rules": [...], "period": "2024-01" }
```

`period` is optional — omit to categorize all uncategorized transactions.

**SSE events**
```
event: progress
data: { "batch": 1, "total": 5, "categorized": 30 }

event: complete
data: { "categories": { "txId": "groceries", ... } }
```

Results are automatically written to `data/state/categories.json`.

---

### `POST /api/llm/analyze`

Runs the two-stage anomaly detection pipeline. Streams progress via SSE. See [anomaly-detection.md](anomaly-detection.md) for pipeline details.

**SSE events**
```
event: progress
data: { "stage": 1, "message": "Running statistical analysis..." }

event: progress
data: { "stage": 2, "message": "Explaining 12 candidates..." }

event: complete
data: { "findings": [...] }
```

Results are written to `data/state/anomalies.json`.

---

### `GET /api/llm/analyze/results`

Returns the cached anomaly findings without re-running analysis.

**Response:** `{ "findings": [...] }`

---

### `GET /api/llm/insights`

Returns all cached monthly insight texts in a single call.

**Response**
```json
{ "2024-01": "In januari...", "2024-02": "Februari kenmerkte zich door..." }
```

Used by `useStateHydration` to pre-populate the Zustand insight cache on mount.

---

### `GET /api/llm/insights/:period`

Generates (or returns cached) narrative insight for a period. Streams tokens via SSE.

`:period` format: `YYYY-MM`.

**SSE events**
```
event: token
data: { "token": "In " }

event: token
data: { "token": "januari" }

event: complete
data: {}
```

Result is cached to disk. Subsequent calls return the cached text immediately without re-generating.

---

### `DELETE /api/llm/insights/:period`

Invalidates the cached insight for a period. Next GET will re-generate.

**Response:** `{ "ok": true }`

---

### `POST /api/llm/chat`

Enqueues a chat message for the AI Advisor. Returns immediately with identifiers for the SSE stream.

**Request body**
```json
{ "threadId": "uuid", "message": "How much did I spend on groceries last month?" }
```

Omit `threadId` to start a new conversation thread.

**Response**
```json
{ "threadId": "uuid", "messageId": "uuid" }
```

---

### `GET /api/llm/chat/:threadId/stream`

Consumes the queued message and streams the advisor response token-by-token via SSE.

**SSE events**
```
event: token
data: { "token": "In " }

event: tool_call
data: { "tool": "getCategoryBreakdown", "input": { "period": "2024-01" } }

event: tool_result
data: { "tool": "getCategoryBreakdown", "output": {...} }

event: complete
data: {}
```

---

### `DELETE /api/llm/chat/:threadId`

Clears the MemorySaver conversation history for a thread, freeing in-process memory.

**Response:** `{ "ok": true }`
