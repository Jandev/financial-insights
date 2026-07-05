/**
 * Transaction sync hook — issue #17.
 *
 * After transactions finish loading, pushes a lean snapshot to
 * POST /api/llm/transactions/sync so LLM services (#18-#21) can
 * access them server-side. Also re-syncs when AI categories change.
 *
 * Option A: Before applying the deduplication guard, checks
 * GET /api/llm/transactions/count. If the server count doesn't match
 * the frontend count (e.g. after a server restart that cleared the
 * in-memory store), the guard is bypassed and a fresh sync is forced.
 *
 * Silently no-ops if the server is unreachable.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import type { Transaction } from '@/types/transaction'

/**
 * Build the lean server snapshot from a Transaction.
 * Strips IBANs and keeps only what LLM services need.
 */
function toSnapshot(tx: Transaction, aiCategory?: string) {
  return {
    id: tx.id,
    date: tx.date.toISOString().slice(0, 10),
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    counterpartyName: tx.counterpartyName,
    description: tx.description.slice(0, 120),
    transactionCode: tx.transactionCode,
    category: aiCategory ?? tx.category,
  }
}

export function useTransactionSync(): void {
  const transactions = useStore((s) => s.transactions)
  const loadingState = useStore((s) => s.loadingState)
  const aiCategories = useStore((s) => s.aiCategories)
  const serverStateAvailable = useStore((s) => s.serverStateAvailable)

  const lastSyncedRef = useRef<{ count: number; aiCount: number } | null>(null)

  useEffect(() => {
    // Only sync when transactions are fully loaded and server is available
    if (loadingState.status !== 'success') return
    if (transactions.length === 0) return
    if (!serverStateAvailable) return

    const aiCount = Object.keys(aiCategories).length
    const prev = lastSyncedRef.current

    async function syncIfNeeded(): Promise<void> {
      // Option A: check whether the server store matches before trusting the
      // dedup ref. If counts diverge (e.g. server restarted and in-memory
      // store is empty or stale), force a re-sync regardless of the ref.
      if (prev !== null) {
        try {
          const res = await fetch('/api/llm/transactions/count')
          if (res.ok) {
            const { count: serverCount } = (await res.json()) as { count: number }
            if (serverCount === transactions.length && prev.count === transactions.length && prev.aiCount === aiCount) {
              // Server and local are in sync — nothing to do
              return
            }
          }
        } catch {
          // Server unreachable — fall through to normal dedup check
        }
      }

      // Avoid redundant syncs when we have no server count data (first mount
      // or count endpoint failed) and the ref already matches
      if (prev?.count === transactions.length && prev?.aiCount === aiCount) return

      lastSyncedRef.current = { count: transactions.length, aiCount }

      const snapshots = transactions.map((tx) =>
        toSnapshot(tx, aiCategories[tx.id]?.category),
      )

      fetch('/api/llm/transactions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: snapshots }),
      }).catch(() => {
        // Silently ignore — server may not have LLM routes yet
      })
    }

    void syncIfNeeded()
  }, [transactions, loadingState.status, aiCategories, serverStateAvailable])
}
