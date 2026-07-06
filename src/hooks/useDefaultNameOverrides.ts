/**
 * useDefaultNameOverrides — issue #52.
 *
 * Manages user-defined display name overrides for the built-in DEFAULT_RULES.
 * The overrides are a simple Record<categoryId, customName> stored in:
 *   - localStorage under STORAGE_KEY_DEFAULT_NAME_OVERRIDES (fast, synchronous)
 *   - data/state/default-name-overrides.json via Express (durable across restarts)
 *
 * Hydration pattern mirrors useSavingsAccounts / useCategoryRules:
 *   useStateHydration writes to localStorage then fires 'state-hydrated',
 *   which this hook listens for to re-read the freshly written values.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  STORAGE_KEY_DEFAULT_NAME_OVERRIDES,
  readDefaultNameOverrides,
} from '@/lib/categories'
import { debouncePut } from '@/lib/serverState'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDefaultNameOverridesResult {
  /** Current map of categoryId → custom display name */
  overrides: Record<string, string>

  /**
   * Set or update the display name for a single default category.
   * Persists to localStorage and schedules a debounced PUT to the server.
   */
  setOverride: (id: string, name: string) => void

  /**
   * Remove the display name override for a single default category,
   * restoring its English original.
   */
  removeOverride: (id: string) => void

  /**
   * Remove all display name overrides, restoring English defaults.
   * Clears localStorage and schedules a debounced PUT with an empty object.
   */
  resetOverrides: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDefaultNameOverrides(): UseDefaultNameOverridesResult {
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => readDefaultNameOverrides(),
  )

  // Re-read from localStorage when server hydration writes fresh data
  useEffect(() => {
    const handler = () => {
      setOverrides(readDefaultNameOverrides())
    }
    window.addEventListener('state-hydrated', handler)
    return () => window.removeEventListener('state-hydrated', handler)
  }, [])

  const setOverride = useCallback((id: string, name: string) => {
    setOverrides((prev) => {
      const updated = { ...prev, [id]: name }
      localStorage.setItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES, JSON.stringify(updated))
      debouncePut('default-name-overrides', updated)
      return updated
    })
  }, [])

  const removeOverride = useCallback((id: string) => {
    setOverrides((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, id)) return prev
      const updated = { ...prev }
      delete updated[id]
      if (Object.keys(updated).length === 0) {
        localStorage.removeItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES)
      } else {
        localStorage.setItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES, JSON.stringify(updated))
      }
      debouncePut('default-name-overrides', updated)
      return updated
    })
  }, [])

  const resetOverrides = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES)
    debouncePut('default-name-overrides', {})
    setOverrides({})
  }, [])

  return { overrides, setOverride, removeOverride, resetOverrides }
}
