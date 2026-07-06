/**
 * Stage 1 anomaly detector — issue #19.
 *
 * Pure statistical analysis — no LLM calls. Fast enough to run on every
 * transaction load. Returns scored candidates for Stage 2 LLM explanation.
 */

import type { TxSnapshot } from './transactionStore.js'

export interface AnomalyCandidate {
  transactionId: string
  detectorType: 'amount_outlier' | 'new_merchant' | 'spending_spike' | 'round_number' | 'recurring_change'
  score: number
  context: Record<string, unknown>
}

type Detector = (txs: TxSnapshot[]) => AnomalyCandidate[]

// ─── Helper: group transactions by category ───────────────────────────────────

function groupByCategory(txs: TxSnapshot[]): Map<string, TxSnapshot[]> {
  const map = new Map<string, TxSnapshot[]>()
  for (const tx of txs) {
    const list = map.get(tx.category) ?? []
    list.push(tx)
    map.set(tx.category, list)
  }
  return map
}

// ─── Helper: z-score ─────────────────────────────────────────────────────────

function zScore(value: number, values: number[]): number {
  if (values.length < 3) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  if (std === 0) return 0
  return Math.abs((value - mean) / std)
}

// ─── Detector 1: amount outlier (z-score per category) ───────────────────────

function detectAmountOutliers(txs: TxSnapshot[]): AnomalyCandidate[] {
  const byCategory = groupByCategory(txs)
  const candidates: AnomalyCandidate[] = []

  for (const [category, group] of byCategory) {
    // Only look at expenses (negative amounts)
    const expenses = group.filter((tx) => tx.amount < 0)
    if (expenses.length < 5) continue

    const amounts = expenses.map((tx) => Math.abs(tx.amount))
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length

    for (const tx of expenses) {
      const z = zScore(Math.abs(tx.amount), amounts)
      if (z > 2.5) {
        candidates.push({
          transactionId: tx.id,
          detectorType: 'amount_outlier',
          score: z,
          context: { category, amount: tx.amount, categoryMean: mean, zScore: z },
        })
      }
    }
  }

  return candidates
}

// ─── Detector 2: new merchant ─────────────────────────────────────────────────

function detectNewMerchants(txs: TxSnapshot[]): AnomalyCandidate[] {
  // Sort by date ascending
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
  const candidates: AnomalyCandidate[] = []

  // Build a rolling 90-day seen set per month
  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i]
    if (!tx.counterpartyName || tx.amount >= 0) continue // skip income

    const txDate = new Date(tx.date)
    const cutoff = new Date(txDate)
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // Check if this merchant appeared in prior 90 days
    const seenBefore = sorted
      .slice(0, i)
      .some(
        (prev) =>
          prev.date >= cutoffStr &&
          prev.counterpartyName.toLowerCase() === tx.counterpartyName.toLowerCase(),
      )

    if (!seenBefore) {
      candidates.push({
        transactionId: tx.id,
        detectorType: 'new_merchant',
        score: 1.5, // base score, lower priority than amount outliers
        context: { merchantName: tx.counterpartyName, amount: tx.amount },
      })
    }
  }

  return candidates
}

// ─── Detector 3: round number large debit ────────────────────────────────────

function detectRoundNumbers(txs: TxSnapshot[]): AnomalyCandidate[] {
  return txs
    .filter((tx) => {
      if (tx.amount >= 0) return false
      const abs = Math.abs(tx.amount)
      return abs >= 500 && abs % 50 === 0
    })
    .map((tx) => ({
      transactionId: tx.id,
      detectorType: 'round_number' as const,
      score: Math.abs(tx.amount) / 500, // larger = higher score
      context: { amount: tx.amount },
    }))
}

// ─── Detector 4: spending spike (monthly total > 2× 3-month average) ─────────

function detectSpendingSpikes(txs: TxSnapshot[]): AnomalyCandidate[] {
  const candidates: AnomalyCandidate[] = []
  const byCategory = groupByCategory(txs)

  for (const [category, group] of byCategory) {
    // Group by month
    const byMonth = new Map<string, number>()
    for (const tx of group) {
      if (tx.amount >= 0) continue
      const month = tx.date.slice(0, 7)
      byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(tx.amount))
    }

    const months = [...byMonth.keys()].sort()
    if (months.length < 4) continue

    for (let i = 3; i < months.length; i++) {
      const current = byMonth.get(months[i])!
      const prev3 = [byMonth.get(months[i - 1])!, byMonth.get(months[i - 2])!, byMonth.get(months[i - 3])!]
      const avg = prev3.reduce((a, b) => a + b, 0) / 3

      if (avg > 0 && current > avg * 2) {
        // Find the largest transaction in the spike month to represent it
        const monthTxs = group.filter((tx) => tx.date.startsWith(months[i]) && tx.amount < 0)
        if (monthTxs.length === 0) continue
        const largest = monthTxs.reduce((a, b) => (Math.abs(a.amount) > Math.abs(b.amount) ? a : b))

        candidates.push({
          transactionId: largest.id,
          detectorType: 'spending_spike',
          score: current / avg,
          context: { category, month: months[i], total: current, avg3Month: avg, ratio: current / avg },
        })
      }
    }
  }

  return candidates
}

// ─── Detector 5: recurring payment amount change ──────────────────────────────

/**
 * Detects merchants with ≥4 historical transactions where the latest payment
 * deviates significantly (z-score > 2.0) from historical amounts.
 * Catches subscription price increases, billing errors on recurring charges.
 */
function detectRecurringChanges(txs: TxSnapshot[]): AnomalyCandidate[] {
  // Group expenses by normalised counterparty name
  const byMerchant = new Map<string, TxSnapshot[]>()
  for (const tx of txs) {
    if (tx.amount >= 0 || !tx.counterpartyName) continue
    const key = tx.counterpartyName.toLowerCase()
    const list = byMerchant.get(key) ?? []
    list.push(tx)
    byMerchant.set(key, list)
  }

  const candidates: AnomalyCandidate[] = []

  for (const [, group] of byMerchant) {
    if (group.length < 4) continue

    // Sort chronologically — latest is last
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted[sorted.length - 1]
    const history = sorted.slice(0, -1)

    const historyAmounts = history.map((tx) => Math.abs(tx.amount))
    const z = zScore(Math.abs(latest.amount), historyAmounts)

    if (z > 2.0) {
      const mean = historyAmounts.reduce((a, b) => a + b, 0) / historyAmounts.length
      candidates.push({
        transactionId: latest.id,
        detectorType: 'recurring_change',
        score: z,
        context: {
          merchantName: latest.counterpartyName,
          latestAmount: latest.amount,
          historicalMean: mean,
          occurrences: group.length,
          zScore: z,
        },
      })
    }
  }

  return candidates
}

const DETECTORS: Detector[] = [
  detectAmountOutliers,
  detectNewMerchants,
  detectRoundNumbers,
  detectSpendingSpikes,
  detectRecurringChanges,
]

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run all statistical detectors on the full transaction set.
 * Returns candidates sorted by score descending (highest priority first).
 */
export function detectAnomalies(txs: TxSnapshot[]): AnomalyCandidate[] {
  const all = DETECTORS.flatMap((detector) => detector(txs))

  // Deduplicate by transactionId — keep highest score per transaction
  const byId = new Map<string, AnomalyCandidate>()
  for (const c of all) {
    const existing = byId.get(c.transactionId)
    if (!existing || c.score > existing.score) {
      byId.set(c.transactionId, c)
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score)
}
