import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types/transaction'

export interface RollingBalanceResult {
  /** Combined per-IBAN running balance, filtered to dateFrom if provided */
  balanceSeries: { ts: number; balance: number }[]
  /** Human-readable label for the first data point */
  balanceStartLabel: string
  /** Human-readable label for the last data point */
  balanceEndLabel: string
}

function fmtPoint(p: { ts: number; balance: number }): string {
  const d = new Date(p.ts)
  const label = new Intl.DateTimeFormat('nl-NL', { month: 'short', year: 'numeric' }).format(d)
  return `${label}  ${formatCurrency(p.balance)}`
}

/**
 * Compute a combined running-balance series across all IBANs.
 *
 * Extracted from DashboardPage — pure derivation over a pre-filtered
 * transaction list + optional start-date cutoff.
 *
 * @param allActive Non-excluded transactions (unsorted).
 * @param dateFrom  Optional start cutoff for the returned series points.
 */
export function useRollingBalance(
  allActive: Transaction[],
  dateFrom: Date | null,
): RollingBalanceResult {
  return useMemo(() => {
    const sorted = [...allActive].sort((a, b) => a.date.getTime() - b.date.getTime())
    const latestByIban = new Map<string, number>()
    const allPoints: { ts: number; balance: number }[] = []

    for (const tx of sorted) {
      latestByIban.set(tx.iban, tx.balanceAfter)
      const combined = [...latestByIban.values()].reduce((s, b) => s + b, 0)
      allPoints.push({ ts: tx.date.getTime(), balance: combined })
    }

    const points = dateFrom
      ? allPoints.filter((p) => p.ts >= dateFrom.getTime())
      : allPoints

    return {
      balanceSeries: points,
      balanceStartLabel: points.length ? fmtPoint(points[0]) : '—',
      balanceEndLabel: points.length ? fmtPoint(points[points.length - 1]) : '—',
    }
  }, [allActive, dateFrom])
}
