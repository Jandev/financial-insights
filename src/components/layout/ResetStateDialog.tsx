/**
 * ResetStateDialog — issue #22.
 *
 * Confirmation dialog shown before wiping all server-persisted state.
 * Rendered inline (not a portal) so it sits above the Sidebar content.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { STORAGE_KEY_RULES, STORAGE_KEY_OVERRIDES } from '@/lib/categories'

// localStorage key used by the Zustand persist middleware
const ZUSTAND_STORAGE_KEY = 'financial-insights:store'

interface ResetStateDialogProps {
  onClose: () => void
}

export function ResetStateDialog({ onClose }: ResetStateDialogProps) {
  const [loading, setLoading] = useState(false)

  const restoreAll = useStore((s) => s.restoreAll)
  const recategorize = useStore((s) => s.recategorize)
  const transactions = useStore((s) => s.transactions)

  async function handleReset() {
    setLoading(true)
    try {
      // 1. Delete server-side state files
      const res = await fetch('/api/state/reset', { method: 'POST' })
      if (!res.ok) throw new Error('Server reset failed')

      // 2. Clear Zustand exclusions
      restoreAll()

      // 3. Clear localStorage entries
      localStorage.removeItem(STORAGE_KEY_RULES)
      localStorage.removeItem(STORAGE_KEY_OVERRIDES)
      // Remove only the exclusions portion of the persisted Zustand store
      // (we keep theme). Simplest: overwrite the stored value.
      try {
        const raw = localStorage.getItem(ZUSTAND_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { state?: { excludedIds?: unknown } }
          if (parsed?.state) {
            parsed.state.excludedIds = []
            localStorage.setItem(ZUSTAND_STORAGE_KEY, JSON.stringify(parsed))
          }
        }
      } catch {
        // Ignore — worst case the persist middleware rewrites on next mutation
      }

      // 4. Notify hooks to re-read (now-empty) localStorage
      window.dispatchEvent(new CustomEvent('state-hydrated'))

      // 5. Re-categorize with rule engine
      recategorize()

      onClose()

      // 6. Toast confirmation
      const txCount = transactions.length
      toast.success(
        txCount > 0
          ? `State reset. ${txCount} transactions re-categorized with rule-based engine.`
          : 'State reset successfully.',
        { duration: 6000 },
      )
    } catch {
      toast.error('Reset failed. Check the server logs.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-2 mb-2 rounded-[10px] border border-border bg-bg-elevated p-3 shadow-lg">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2} />
        <p className="text-[12px] font-semibold text-text-primary">Reset all state?</p>
      </div>

      {/* Body */}
      <p className="mb-2 text-[11px] leading-relaxed text-text-secondary">
        Permanently deletes:
      </p>
      <ul className="mb-3 space-y-0.5 text-[11px] text-text-muted">
        <li>• AI category assignments</li>
        <li>• Hidden transaction exclusions</li>
        <li>• Custom category rules</li>
        <li>• Generated insights &amp; anomalies</li>
      </ul>
      <p className="mb-3 text-[11px] text-text-muted">
        CSV files are untouched.
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          disabled={loading}
          className={cn(
            'flex-1 rounded-[6px] border border-border px-2 py-1.5',
            'text-[11px] text-text-secondary transition-colors hover:bg-bg-base',
            'disabled:opacity-50',
          )}
        >
          Cancel
        </button>
        <button
          onClick={handleReset}
          disabled={loading}
          className={cn(
            'flex-1 rounded-[6px] bg-red-500/90 px-2 py-1.5',
            'text-[11px] font-medium text-white transition-colors hover:bg-red-600',
            'disabled:opacity-50',
          )}
        >
          {loading ? 'Resetting…' : 'Reset everything'}
        </button>
      </div>
    </div>
  )
}
