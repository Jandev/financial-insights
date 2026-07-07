/**
 * Client-side helpers for server-backed state persistence (issue #22, #70).
 *
 * Provides a debounced PUT helper and an in-flight write query used by
 * useStateSync to avoid overwriting optimistic local updates during polling.
 */

import { useStore } from '@/store'

// ─── Debounced PUT ────────────────────────────────────────────────────────────

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Returns true if a debounced PUT for `key` is currently pending.
 * Used by useStateSync as an in-flight guard during background polling.
 */
export function hasPendingWrite(key: string): boolean {
  return pendingWrites.has(key)
}

/**
 * Schedule a debounced PUT /api/state/:key with the given data.
 *
 * - Calls are coalesced: only the latest data within `delay` ms is sent.
 * - Fails silently on network error.
 *
 * @param key   State key (e.g. "exclusions", "rules", "categories")
 * @param data  Body to send as JSON
 * @param delay Debounce window in ms (default 500)
 */
export function debouncePut<T>(key: string, data: T, delay = 500): void {
  const existing = pendingWrites.get(key)
  if (existing !== undefined) clearTimeout(existing)

  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key)
      void (async () => {
        try {
          const res = await fetch(`/api/state/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          if (res.ok) {
            useStore.getState().setStateLastSynced(new Date())
          }
        } catch {
          // Network unavailable — silently ignore
        }
      })()
    }, delay),
  )
}
