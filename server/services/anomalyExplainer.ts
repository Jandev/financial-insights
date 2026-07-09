/**
 * Stage 2 anomaly explainer — issue #19.
 *
 * Sends top statistical candidates to the LLM for human-readable
 * explanations. Returns structured findings with severity levels.
 */

import { z } from 'zod'
import { createLLMClient, getLLMInfo } from './llm.js'
import { asLLMRequestError, normalizeLLMError } from './llmErrors.js'
import type { TxSnapshot } from './transactionStore.js'
import type { AnomalyCandidate } from './anomalyDetector.js'

// ─── Output schema ────────────────────────────────────────────────────────────

const AnomalySchema = z.object({
  findings: z.array(
    z.object({
      transactionId: z.string(),
      severity: z.enum(['info', 'warning', 'alert']),
      title: z.string().max(80),
      explanation: z.string().max(250),
      actionSuggestion: z.string().max(150).optional(),
      falsePositiveLikelihood: z.number().min(0).max(1),
    }),
  ),
})

const SYSTEM_PROMPT = `You are a cautious Dutch personal finance analyst reviewing flagged transactions.
For each transaction provided, write a clear, concise finding in English.
Severity: 'info' = interesting but expected, 'warning' = worth reviewing, 'alert' = unusual, action suggested.
Dutch merchant names and amounts in € are normal.
Be factual and helpful — not alarmist. Keep explanations to 1-2 sentences.
Return findings ONLY for transactions you consider genuinely notable (skip obvious false positives).`

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Explain the top anomaly candidates using the LLM.
 * Calls onProgress with the count processed so far (for SSE progress events).
 */
export type EnrichedFinding = z.infer<typeof AnomalySchema>['findings'][number] & {
  detectorType: string
}

export async function explainAnomalies(
  allTxs: TxSnapshot[],
  candidates: AnomalyCandidate[],
  onProgress?: (processed: number) => void,
): Promise<EnrichedFinding[]> {
  const llm = createLLMClient()
  if (!llm || candidates.length === 0) return []

  // Build a lookup for transaction details
  const txById = new Map(allTxs.map((tx) => [tx.id, tx]))

  // Enrich candidates with transaction details for context
  const input = candidates.map((c) => {
    const tx = txById.get(c.transactionId)
    return {
      transactionId: c.transactionId,
      detectorType: c.detectorType,
      detectorContext: c.context,
      transaction: tx
        ? {
            date: tx.date,
            amount: tx.amount,
            counterpartyName: tx.counterpartyName,
            description: tx.description.slice(0, 80),
            category: tx.category,
            transactionCode: tx.transactionCode,
          }
        : null,
    }
  })

  const structured = llm.withStructuredOutput(AnomalySchema)

  try {
    const result = await structured.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ])

    onProgress?.(candidates.length)

    // Inject detectorType from the Stage 1 candidates into each LLM finding
    const candidateByTxId = new Map(candidates.map((c) => [c.transactionId, c.detectorType]))
    return result.findings.map((f) => ({
      ...f,
      detectorType: candidateByTxId.get(f.transactionId) ?? 'unknown',
    }))
  } catch (err) {
    const normalized = normalizeLLMError(err, { llm: getLLMInfo().info, feature: 'analyze' })
    if (normalized.isCompatibilityError) {
      throw asLLMRequestError(err, { llm: getLLMInfo().info, feature: 'analyze' })
    }
    console.error('[anomalyExplainer] LLM call failed:', err)
    // Return empty findings rather than crashing
    return []
  }
}
