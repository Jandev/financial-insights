/**
 * Tests for the serverState debouncePut / hasPendingWrite utilities.
 *
 * Covers the in-flight PUT guard used by useStateSync polling (issue #70).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debouncePut, hasPendingWrite } from './serverState'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => ({}) })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('hasPendingWrite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(async () => {
    // Flush any pending writes so the module-level Map is clean for next test
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns false when no write is pending for the key', () => {
    expect(hasPendingWrite('categories')).toBe(false)
  })

  it('returns true immediately after debouncePut is called', () => {
    debouncePut('rules', { rules: [] })
    expect(hasPendingWrite('rules')).toBe(true)
  })

  it('returns false for a different key', () => {
    debouncePut('categories', {})
    expect(hasPendingWrite('rules')).toBe(false)
  })

  it('returns false after the debounce delay has elapsed', async () => {
    debouncePut('exclusions', { ids: [] })
    expect(hasPendingWrite('exclusions')).toBe(true)

    await vi.runAllTimersAsync()

    expect(hasPendingWrite('exclusions')).toBe(false)
  })

  it('coalesces multiple debouncePut calls — only one write fires', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)

    debouncePut('spaarpotjes', { accounts: [] })
    debouncePut('spaarpotjes', { accounts: [{ id: '1' }] })
    debouncePut('spaarpotjes', { accounts: [{ id: '1' }, { id: '2' }] })

    await vi.runAllTimersAsync()

    // Only the last value should have been PUT
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/state/spaarpotjes',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('key becomes pending again when debouncePut is re-called after flush', async () => {
    debouncePut('categories', {})
    await vi.runAllTimersAsync()
    expect(hasPendingWrite('categories')).toBe(false)

    // Second write
    debouncePut('categories', { 'tx-1': 'food' })
    expect(hasPendingWrite('categories')).toBe(true)

    await vi.runAllTimersAsync()
    expect(hasPendingWrite('categories')).toBe(false)
  })

  it('sends PUT to the correct API endpoint', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)

    debouncePut('personal-accounts', { accounts: [] }, 100)
    await vi.runAllTimersAsync()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/state/personal-accounts',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: [] }),
      }),
    )
  })
})
