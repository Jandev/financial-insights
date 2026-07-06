import { type ReactNode } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(...inputs))
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
