/**
 * AI categorization panel — issue #18.
 *
 * Renders the "Categorize with AI" button, SSE progress bar,
 * result summary, and undo control.
 */

import { useState, useRef } from 'react'
import { Sparkles, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LLMGate } from './LLMGate'
import { useStore } from '@/store'
import { toast } from 'sonner'
import type { AICategoryResult } from '@/store/slices/llmTypes'
import { readSSEStream } from '@/lib/sse'
import { debouncePut } from '@/lib/serverState'

interface ProgressState {
  processed: number
  total: number
}

interface AICategorizeButtonProps {
  /** Called after successful categorization so the parent can refresh */
  onComplete?: () => void
  /** ISO YYYY-MM period to restrict categorization to. Omit for all transactions. */
  period?: string
}

export function AICategorizeButton({ onComplete, period }: AICategorizeButtonProps) {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const setAiCategories = useStore((s) => s.setAiCategories)
  const clearAiCategories = useStore((s) => s.clearAiCategories)
  const aiCategories = useStore((s) => s.aiCategories)
  const hasAiCategories = Object.keys(aiCategories).length > 0

  async function runCategorization() {
    setIsRunning(true)
    setProgress({ processed: 0, total: 0 })

    abortRef.current = new AbortController()
    const allResults: Record<string, AICategoryResult> = {}

    try {
      await readSSEStream<{
        type: string
        processed?: number
        total?: number
        results?: Array<{ id: string; category: string; confidence: number; reasoning: string }>
        totalProcessed?: number
        message?: string
      }>(
        '/api/llm/categorize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: period ?? 'all' }),
          signal: abortRef.current.signal,
        },
        {
          onData: (data) => {
            if (data.type === 'progress') {
              setProgress({ processed: data.processed ?? 0, total: data.total ?? 0 })
              if (data.results) {
                for (const r of data.results) {
                  allResults[r.id] = {
                    category: r.category,
                    confidence: r.confidence,
                    reasoning: r.reasoning,
                    source: 'llm',
                  }
                }
              }
              return
            }

            if (data.type === 'done') {
              setAiCategories(allResults)
              toast.success(`AI categorized ${data.totalProcessed ?? 0} transactions`)
              onComplete?.()
              return
            }

            if (data.type === 'error') {
              toast.error(data.message ?? 'AI categorization failed.')
              console.error('[AICategorize] server error event:', data.message)
            }
          },
        },
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('AI categorization failed. Check server logs.')
        console.error('[AICategorize]', err)
      }
    } finally {
      setIsRunning(false)
      setProgress(null)
    }
  }

  function handleUndo() {
    clearAiCategories()
    debouncePut('ai-categories', {})
    toast.success('Reverted to rule-based categorization')
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <LLMGate>
          <Button
            variant="primary"
            size="sm"
            onClick={runCategorization}
            disabled={isRunning}
            className="gap-1.5"
          >
            {isRunning
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />
            }
            {isRunning ? `Categorizing… ${pct}%` : 'Categorize with AI'}
          </Button>
        </LLMGate>

        {hasAiCategories && !isRunning && (
          <Button variant="ghost" size="sm" onClick={handleUndo} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Undo AI
          </Button>
        )}
      </div>

      {isRunning && progress && progress.total > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            {progress.processed} / {progress.total} transactions
          </p>
        </div>
      )}
    </div>
  )
}
