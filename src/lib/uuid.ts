/**
 * UUID generation utility.
 * Uses crypto.randomUUID() when available (all modern browsers),
 * falls back to a simple random string for older environments.
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
