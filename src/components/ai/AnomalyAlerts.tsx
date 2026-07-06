/**
 * Anomaly alerts panel — issue #19.
 *
 * Shows top findings from the LLM anomaly analysis with severity badges.
 * Includes "Run Analysis" trigger and dismiss controls.
 */

import { useState } from 'react'
import { AlertTriangle, Info, AlertCircle, X, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LLMGate } from './LLMGate'
import { useStore } from '@/store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AnomalyFinding, Severity } from '@/store/slices/llmTypes'
import { readSSEStream } from '@/lib/sse'

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; Icon: typeof Info }> = {
  info:    { label: 'Info',    color: 'text-blue-500',   Icon: Info          },
  warning: { label: 'Warning', color: 'text-orange-400', Icon: AlertTriangle },
  alert:   { label: 'Alert',   color: 'text-red-500',    Icon: AlertCircle   },
}

function FindingRow({ finding }: { finding: AnomalyFinding }) {
  const dismissFinding = useStore((s) => s.dismissFinding)
  const dismissedIds = useStore((s) => s.dismissedFindingIds)
  const [expanded, setExpanded] = useState(false)

  if (dismissedIds.has(finding.transactionId)) return null

  const { Icon, color, label } = SEVERITY_CONFIG[finding.severity]

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3 space-y-1">
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', color)} strokeWidth={1.75} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] font-medium uppercase tracking-wide', color)}>{label}</span>
            <p className="text-[13px] font-medium text-text-primary truncate">{finding.title}</p>
          </div>
          {expanded && (
            <p className="mt-1 text-[12px] text-text-secondary">{finding.explanation}</p>
          )}
          {expanded && finding.actionSuggestion && (
            <p className="mt-1 text-[11px] text-text-muted italic">{finding.actionSuggestion}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-0.5 text-text-muted hover:text-text-secondary transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
          </button>
          <button
            onClick={() => dismissFinding(finding.transactionId)}
            className="p-0.5 text-text-muted hover:text-red-500 transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

interface AnomalyAlertsProps {
  /** Max number of findings to show (default 5) */
  limit?: number
}

export function AnomalyAlerts({ limit = 5 }: AnomalyAlertsProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const findings = useStore((s) => s.findings)
  const dismissedIds = useStore((s) => s.dismissedFindingIds)
  const setFindings = useStore((s) => s.setFindings)

  const visible = findings.filter((f) => !dismissedIds.has(f.transactionId))
  const shown = showAll ? visible : visible.slice(0, limit)

  async function runAnalysis() {
    setIsRunning(true)
    setStage('Detecting anomalies…')

    try {
      await readSSEStream<{
        type: string
        candidates?: number
        processed?: number
        total?: number
        findings?: AnomalyFinding[]
        message?: string
      }>(
        '/api/llm/analyze',
        { method: 'POST' },
        {
          onData: (data) => {
            if (data.type === 'stage1_done') {
              setStage(`Analyzing ${data.candidates} candidates with AI…`)
              return
            }

            if (data.type === 'stage2_progress') {
              setStage(`Explaining ${data.processed}/${data.total} findings…`)
              return
            }

            if (data.type === 'done') {
              setFindings(data.findings ?? [])
              toast.success(`Found ${data.findings?.length ?? 0} anomalies`)
              return
            }

            if (data.type === 'error') {
              toast.error(data.message ?? 'Analysis failed')
            }
          },
        },
      )
    } catch (err) {
      toast.error('Analysis failed. Check server logs.')
      console.error('[AnomalyAlerts]', err)
    } finally {
      setIsRunning(false)
      setStage(null)
    }
  }

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Anomaly Alerts</h3>
        <LLMGate>
          <Button
            variant="ghost"
            size="sm"
            onClick={runAnalysis}
            disabled={isRunning}
            className="gap-1.5"
          >
            {isRunning
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />
            }
            {isRunning ? stage ?? 'Running…' : 'Run Analysis'}
          </Button>
        </LLMGate>
      </div>

      {visible.length === 0 ? (
        <p className="text-[12px] text-text-muted text-center py-4">
          {findings.length === 0
            ? 'No analysis run yet. Click "Run Analysis" to detect unusual transactions.'
            : 'All findings dismissed.'}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <FindingRow key={f.transactionId} finding={f} />
          ))}
          {visible.length > limit && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-[11px] text-accent hover:underline w-full text-center py-1"
            >
              {showAll ? 'Show fewer' : `Show ${visible.length - limit} more`}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
