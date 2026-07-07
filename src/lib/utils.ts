import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DateRange } from '@/components/ui/RangeSelector'

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(...inputs))
}

/**
 * Map a DateRange enum value to a cutoff Date (or null for 'all').
 * Shared by DashboardPage and InsightsPage.
 */
export function computeDateFrom(range: DateRange): Date | null {
  if (range === 'all') return null
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
}

/**
 * Convert a zero-based YYYY-MM key (e.g. "2024-02") to a full label
 * (e.g. "March 2024"). Returns "—" for empty input.
 */
export function monthKeyToLabel(key: string): string {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1),
  )
}

/**
 * Format a signed delta with +/− prefix using the Euro currency formatter.
 * e.g. 45.5 → "+€ 45,50", -100 → "−€ 100,00"
 */
export function signedFmt(delta: number): string {
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(delta))}`
}

/** Format a number as a Euro amount using Dutch locale (e.g. `€ 1.234,56`). */
export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Short date label, e.g. `1 jun.` */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(date)
}

/** Full month + year label, e.g. `juni 2026` */
export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(date)
}

/**
 * Full date for the transaction table: `05 jul. 2026` (dd MMM yyyy, nl-NL).
 * Pads the day to 2 digits so columns stay aligned.
 */
export function formatDateFull(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Time-of-day label for the debug panel, e.g. `14:32:07` */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function normalizeIBAN(value: string): string {
  return value.replace(/\s/g, '').toUpperCase()
}

export function validateIBAN(value: string): string | null {
  const normalized = normalizeIBAN(value)
  if (!normalized) return 'IBAN is required'
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) return 'Invalid IBAN format'
  return null
}

export type { ReactNode }
