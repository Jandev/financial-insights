/**
 * Client-side helpers for server-backed state persistence (issue #22).
 *
 * Provides:
 *   - A module-level flag tracking whether the Express state API is reachable
 *   - A debounced PUT helper used by hooks to sync mutations to the server
 *
 * The `serverAvailable` flag is set by `useStateHydration` on startup. All
 * write helpers check this flag and silently skip when server is unreachable,
 * which preserves the localStorage-only fallback in Vite-only dev mode.
 */

import { useStore } from '@/store'

// ─── Availability flag ────────────────────────────────────────────────────────

let _serverAvailable = false

export function setServerAvailable(v: boolean): void {
  _serverAvailable = v
}

export function isServerAvailable(): boolean {
  return _serverAvailable
}

// ─── Debounced PUT ────────────────────────────────────────────────────────────

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Schedule a debounced PUT /api/state/:key with the given data.
 *
 * - No-op when the server state API is not available (`_serverAvailable = false`).
 * - Calls are coalesced: only the latest data within `delay` ms is sent.
 * - Fails silently on network error.
 *
 * @param key   State key (e.g. "exclusions", "rules", "categories")
 * @param data  Body to send as JSON
 * @param delay Debounce window in ms (default 500)
 */
export function debouncePut<T>(key: string, data: T, delay = 500): void {
  if (!_serverAvailable) return

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
          // Network unavailable — silently ignore; localStorage remains the source
        }
      })()
    }, delay),
  )
}
