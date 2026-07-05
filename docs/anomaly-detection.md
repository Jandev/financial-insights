# Anomaly Detection

Anomaly detection runs as a two-stage pipeline: statistical scoring without LLM (Stage 1), followed by LLM explanation of the top candidates (Stage 2).

Triggered from **Insights page → Anomaly Alerts → Run Analysis** (or via the AI Advisor). Results are cached in `data/state/anomalies.json` and streamed via SSE.

## Stage 1 — Statistical detection

Implemented in `server/services/anomalyDetector.ts`. No LLM involved. Runs on all loaded transactions and produces a scored list of candidates.

### Detectors

| Detector | Logic | Score |
|---|---|---|
| `amount_outlier` | Z-score > 2.5 for the transaction's category (requires ≥ 5 transactions in category) | Z-score value |
| `new_merchant` | Expense merchant not seen in any transaction in the prior 90 days | 1.5 (fixed) |
| `round_number` | Debit ≥ €500 and amount divisible by 50 | `abs(amount) / 500` |
| `spending_spike` | Monthly category total > 2× the 3-month rolling average (requires ≥ 4 months history) | `current / avg` ratio |
| `recurring_change` | Z-score > 2.0 on the latest payment vs merchant payment history (requires ≥ 4 prior payments) | Z-score value |

**Deduplication:** if a transaction is flagged by multiple detectors, only the highest-scoring entry is kept.

Output is sorted descending by score. The top 20 candidates are passed to Stage 2.

## Stage 2 — LLM explanation

Implemented in `server/services/anomalyExplainer.ts`. The top 20 candidates (with full transaction details) are sent to the LLM in a single structured-output call.

### LLM output per finding

| Field | Description |
|---|---|
| `transactionId` | Links back to the original transaction |
| `severity` | `info`, `warning`, or `alert` |
| `title` | Short label (e.g. "Unusual grocery spend") |
| `explanation` | 1–2 sentence explanation of why it's anomalous |
| `actionSuggestion` | Optional — what the user might do |
| `falsePositiveLikelihood` | `low`, `medium`, or `high` |

The `detectorType` from Stage 1 is injected back into each finding after the LLM responds, so the UI can display which detector flagged it.

The LLM may omit transactions it considers obvious false positives.

## UI — AnomalyAlerts

Located on the Insights page.

- Findings grouped by severity with color-coded icons (`alert` = red, `warning` = amber, `info` = blue).
- Each finding is expandable — shows explanation and action suggestion.
- **Dismiss** hides a finding (persisted to `data/state/dismissed.json`). Dismissed findings are excluded from the count shown in the insight context.
- Overflow: beyond the first 5, findings are hidden behind a "Show N more" toggle.

### Flagged filter

The Transaction Table has a **Show Flagged Only** filter (FilterBar) that limits the table to transactions that appear in the current anomaly findings. Useful for investigating flagged transactions in context.

## Caching

Results are cached to `data/state/anomalies.json`. Re-running analysis overwrites the cache. Dismissed IDs are stored separately in `data/state/dismissed.json` so dismissals survive a re-run.

Read the cached results without re-running via `GET /api/llm/analyze/results`.

## Streaming

The analysis endpoint (`POST /api/llm/analyze`) streams progress via SSE:

```
event: progress
data: {"stage": 1, "message": "Running statistical analysis..."}

event: progress
data: {"stage": 2, "message": "Explaining 12 candidates..."}

event: complete
data: {"findings": [...]}
```
