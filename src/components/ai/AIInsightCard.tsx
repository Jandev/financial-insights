/**
 * AI Insight streaming card — issue #20.
 *
 * Fetches and streams a narrative summary for a given period.
 * Tokens stream in real-time with a typing cursor.
 * Cached periods load instantly without re-calling the LLM.
 */

import { useState, useEffect, useRef } from 'react'
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LLMGate } from './LLMGate'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { readSSEStream } from '@/lib/sse'

interface AIInsightCardProps {
  /** YYYY-MM, YYYY, or 'all-time' */
  period: string
  /** Human-readable period label (e.g. "July 2024") */
  periodLabel?: string
}

export function AIInsightCard({ period, periodLabel }: AIInsightCardProps) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [displayText, setDisplayText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const insightCache = useStore((s) => s.insightCache)
  const setInsight = useStore((s) => s.setInsight)
  const clearInsight = useStore((s) => s.clearInsight)
  const llmAvailable = useStore((s) => s.llmAvailable)

  const cached = insightCache[period]

  // Load cached text on mount / period change
  useEffect(() => {
    if (cached) {
      setDisplayText(cached)
    } else {
      setDisplayText('')
    }
  }, [period, cached])

  async function fetchInsight(regenerate = false) {
    if (regenerate) {
      // Clear server cache then re-fetch
      await fetch(`/api/llm/insights/${period}`, { method: 'DELETE' }).catch(() => {})
      clearInsight(period)
      setDisplayText('')
    }

    if (isStreaming) {
      abortRef.current?.abort()
      return
    }

    setIsStreaming(true)
    abortRef.current = new AbortController()
    let fullText = ''

    try {
      await readSSEStream<{ type: string; text?: string; cachedAt?: string }>(
        `/api/llm/insights/${period}`,
        { signal: abortRef.current.signal },
        {
          onData: (data) => {
            if (data.type === 'token' && data.text) {
              fullText += data.text
              setDisplayText(fullText)
              return
            }

            if (data.type === 'cached' && data.text) {
              setDisplayText(data.text)
              setInsight(period, data.text)
              return
            }

            if (data.type === 'done') {
              setInsight(period, fullText)
            }
          },
        },
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[AIInsightCard]', err)
        setDisplayText('Failed to generate insight. Please try again.')
      }
    } finally {
      setIsStreaming(false)
    }
  }

  const label = periodLabel ?? period

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-sm font-semibold text-text-primary">
            {label} — AI Summary
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {displayText && !isStreaming && (
            <LLMGate>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchInsight(true)}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </LLMGate>
          )}
          {!displayText && !isStreaming && llmAvailable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchInsight(false)}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </Button>
          )}
        </div>
      </div>

      {isStreaming && !displayText && (
        <div className="flex items-center gap-2 text-text-muted py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Generating summary…</span>
        </div>
      )}

      {displayText && (
        <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
          {displayText}
          {isStreaming && (
            <span className={cn('inline-block w-0.5 h-3.5 bg-accent ml-0.5 align-middle',
              'animate-[blink_1s_step-start_infinite]')} />
          )}
        </div>
      )}

      {!displayText && !isStreaming && !llmAvailable && (
        <p className="text-[12px] text-text-muted text-center py-4">
          Start the server with <code className="font-mono text-accent">npm run dev:full</code> to generate AI summaries.
        </p>
      )}
    </Card>
  )
}
