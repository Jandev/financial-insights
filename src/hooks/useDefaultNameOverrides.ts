/**
 * useDefaultNameOverrides — issue #52.
 *
 * Manages user-defined display name overrides for the built-in DEFAULT_RULES.
 * The overrides live in Zustand (`defaultNameOverridesState`) and are synced
 * to the server via debounced PUT /api/state/default-name-overrides (500 ms).
 */

import { useCallback } from 'react'
import { debouncePut } from '@/lib/serverState'
import { useStore } from '@/store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDefaultNameOverridesResult {
  /** Current map of categoryId → custom display name */
  overrides: Record<string, string>

  /**
   * Set or update the display name for a single default category.
   * Persists to the server via debounced PUT.
   */
  setOverride: (id: string, name: string) => void

  /**
   * Remove the display name override for a single default category,
   * restoring its English original.
   */
  removeOverride: (id: string) => void

  /**
   * Remove all display name overrides, restoring English defaults.
   * Schedules a debounced PUT with an empty object.
   */
  resetOverrides: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDefaultNameOverrides(): UseDefaultNameOverridesResult {
  const overrides = useStore((s) => s.defaultNameOverridesState)
  const setDefaultNameOverridesState = useStore((s) => s.setDefaultNameOverridesState)

  const setOverride = useCallback((id: string, name: string) => {
    const updated = { ...overrides, [id]: name }
    setDefaultNameOverridesState(updated)
    debouncePut('default-name-overrides', updated)
  }, [overrides, setDefaultNameOverridesState])

  const removeOverride = useCallback((id: string) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, id)) return
    const updated = { ...overrides }
    delete updated[id]
    setDefaultNameOverridesState(updated)
    debouncePut('default-name-overrides', updated)
  }, [overrides, setDefaultNameOverridesState])

  const resetOverrides = useCallback(() => {
    setDefaultNameOverridesState({})
    debouncePut('default-name-overrides', {})
  }, [setDefaultNameOverridesState])

  return { overrides, setOverride, removeOverride, resetOverrides }
}
