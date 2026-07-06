/**
 * SettingsPage — /settings
 *
 * Five sections:
 *   1. Spaarpotjes      — CRUD list for named savings accounts
 *   2. Personal Accounts — IBANs marked as internal (pocket money, joint accounts, etc.)
 *   3. AI Knowledge Base — URL sources for the RAG knowledge base (issue #53)
 *   4. Data             — Hard CSV refresh (prod: re-scans filesystem; dev: re-parses loaded files)
 *   5. Danger Zone      — Reset all settings (moved here from Sidebar)
 */

import { useState } from 'react'
import {
  Plus, Trash2, Check, X, RefreshCw, AlertTriangle,
  PiggyBank, ArrowLeftRight, ToggleLeft, ToggleRight, Brain,
  Pencil, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { useSavingsAccounts } from '@/hooks/useSavingsAccounts'
import { usePersonalAccounts } from '@/hooks/usePersonalAccounts'
import { useKnowledgeSources } from '@/hooks/useKnowledgeSources'
import type { KnowledgeSource, CrawlPolicy, SourceProgress } from '@/hooks/useKnowledgeSources'
import { ResetStateDialog } from '@/components/layout/ResetStateDialog'
import { SPAARPOTJE_COLORS } from '@/types/savingsAccount'
import type { SavingsAccount } from '@/types/savingsAccount'
import type { PersonalAccount } from '@/types/personalAccount'

// ─── IBAN formatting helper ───────────────────────────────────────────────────

function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

// ─── Color swatch picker ──────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {SPAARPOTJE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-full transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
            value === color ? 'ring-2 ring-offset-1 ring-offset-bg-elevated ring-white/50 scale-110' : 'opacity-70 hover:opacity-100 hover:scale-105',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

// ─── Inline form for add / edit ───────────────────────────────────────────────

interface SpaarpotjeFormProps {
  initial?: Partial<SavingsAccount>
  onSave: (values: { name: string; iban: string; color: string }) => void
  onCancel: () => void
  firstAvailableColor: string
}

function SpaarpotjeForm({ initial, onSave, onCancel, firstAvailableColor }: SpaarpotjeFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [iban, setIban] = useState(initial?.iban ?? '')
  const [color, setColor] = useState(initial?.color ?? firstAvailableColor)
  const [errors, setErrors] = useState<{ name?: string; iban?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Name is required'
    const normalized = normalizeIban(iban)
    if (!normalized) {
      next.iban = 'IBAN is required'
    } else if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) {
      next.iban = 'Invalid IBAN format'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({ name: name.trim(), iban: normalizeIban(iban), color })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-border bg-bg-elevated p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vakantie"
            className={cn(
              'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px]',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
              errors.name ? 'border-expense' : 'border-border',
            )}
          />
          {errors.name && <p className="text-[11px] text-expense">{errors.name}</p>}
        </div>

        {/* IBAN */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Counterparty IBAN</label>
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="NL00RABO0000000000"
            className={cn(
              'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px] font-mono',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
              errors.iban ? 'border-expense' : 'border-border',
            )}
          />
          {errors.iban && <p className="text-[11px] text-expense">{errors.iban}</p>}
        </div>
      </div>

      {/* Color */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-text-secondary">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          <Check className="h-3.5 w-3.5" />
          {initial?.id ? 'Save changes' : 'Add spaarpotje'}
        </Button>
      </div>
    </form>
  )
}

// ─── Personal Account form (add) ──────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<PersonalAccount['type'], string> = {
  payment: 'Payment',
  savings: 'Savings',
  joint: 'Joint',
  other: 'Other',
}

interface PersonalAccountFormProps {
  onSave: (values: { iban: string; label: string; type: PersonalAccount['type']; enabled: boolean }) => void
  onCancel: () => void
}

function PersonalAccountForm({ onSave, onCancel }: PersonalAccountFormProps) {
  const [iban, setIban] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<PersonalAccount['type']>('payment')
  const [errors, setErrors] = useState<{ iban?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    const normalized = normalizeIban(iban)
    if (!normalized) {
      next.iban = 'IBAN is required'
    } else if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) {
      next.iban = 'Invalid IBAN format'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({ iban: normalizeIban(iban), label: label.trim(), type, enabled: true })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-border bg-bg-elevated p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* IBAN */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">IBAN</label>
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="NL00RABO0000000000"
            className={cn(
              'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px] font-mono',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
              errors.iban ? 'border-expense' : 'border-border',
            )}
          />
          {errors.iban && <p className="text-[11px] text-expense">{errors.iban}</p>}
        </div>

        {/* Label */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Boodschappenrekening"
            className={cn(
              'w-full rounded-[6px] border border-border px-2.5 py-1.5 text-[13px]',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
            )}
          />
        </div>
      </div>

      {/* Type */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-text-secondary">Account type</label>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(ACCOUNT_TYPE_LABELS) as PersonalAccount['type'][]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                type === t
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:text-text-primary',
              )}
            >
              {ACCOUNT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          <Check className="h-3.5 w-3.5" />
          Add account
        </Button>
      </div>
    </form>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Knowledge source form (add / edit) ──────────────────────────────────────

const DEFAULT_POLICY: Required<CrawlPolicy> = {
  discovery: 'auto',
  includePaths: [],
  excludePaths: [],
  maxPages: 100,
  maxDepth: 2,
  concurrency: 3,
  respectRobots: true,
  allowSubdomains: false,
}

interface KnowledgeSourceFormProps {
  initial?: KnowledgeSource
  onSave: (source: KnowledgeSource) => Promise<string | null>
  onCancel: () => void
}

function KnowledgeSourceForm({ initial, onSave, onCancel }: KnowledgeSourceFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [mode, setMode] = useState<'single_page' | 'site'>(initial?.mode ?? 'single_page')
  const [showAdvanced, setShowAdvanced] = useState(
    // open advanced panel if editing a source that has policy set
    !!(initial?.policy && Object.keys(initial.policy).length > 0),
  )

  const p = initial?.policy
  const [discovery, setDiscovery] = useState<CrawlPolicy['discovery']>(p?.discovery ?? 'auto')
  const [includePaths, setIncludePaths] = useState((p?.includePaths ?? []).join('\n'))
  const [excludePaths, setExcludePaths] = useState((p?.excludePaths ?? []).join('\n'))
  const [maxPages, setMaxPages] = useState(String(p?.maxPages ?? DEFAULT_POLICY.maxPages))
  const [maxDepth, setMaxDepth] = useState(String(p?.maxDepth ?? DEFAULT_POLICY.maxDepth))
  const [respectRobots, setRespectRobots] = useState(p?.respectRobots ?? true)
  const [allowSubdomains, setAllowSubdomains] = useState(p?.allowSubdomains ?? false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function parsePaths(raw: string): string[] {
    return raw.split('\n').map((l) => l.trim()).filter(Boolean)
  }

  function buildSource(): KnowledgeSource {
    const src: KnowledgeSource = { name: name.trim(), url: url.trim(), mode }
    if (mode === 'site') {
      src.policy = {
        discovery,
        includePaths: parsePaths(includePaths),
        excludePaths: parsePaths(excludePaths),
        maxPages: parseInt(maxPages, 10) || DEFAULT_POLICY.maxPages,
        maxDepth: parseInt(maxDepth, 10) || DEFAULT_POLICY.maxDepth,
        concurrency: DEFAULT_POLICY.concurrency,
        respectRobots,
        allowSubdomains,
      }
    }
    return src
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Name is required'
    try {
      const parsed = new URL(url.trim())
      if (parsed.protocol !== 'https:') next.url = 'Only https:// URLs allowed'
    } catch {
      next.url = 'Invalid URL'
    }
    if (mode === 'site') {
      const mp = parseInt(maxPages, 10)
      if (isNaN(mp) || mp < 1) next.maxPages = 'Must be ≥ 1'
      const md = parseInt(maxDepth, 10)
      if (isNaN(md) || md < 1) next.maxDepth = 'Must be ≥ 1'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    const err = await onSave(buildSource())
    setSaving(false)
    if (err) setErrors({ url: err })
  }

  const inputCls = (field: string) => cn(
    'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px]',
    'bg-bg-base text-text-primary placeholder-text-muted',
    'focus:outline-none focus:ring-1 focus:ring-accent',
    errors[field] ? 'border-expense' : 'border-border',
  )

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-border bg-bg-elevated p-4 space-y-4">
      {/* Name + URL */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nibud" className={inputCls('name')} />
          {errors.name && <p className="text-[11px] text-expense">{errors.name}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page" className={inputCls('url')} />
          {errors.url && <p className="text-[11px] text-expense">{errors.url}</p>}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-text-secondary">Indexing mode</label>
        <div className="flex gap-1.5">
          {(['single_page', 'site'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                mode === m ? 'bg-accent text-white' : 'bg-bg-base border border-border text-text-secondary hover:text-text-primary',
              )}>
              {m === 'single_page' ? 'Single page' : 'Site crawl'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted">
          {mode === 'single_page'
            ? 'Indexes only the exact URL.'
            : 'Discovers and indexes subpages via sitemap or link crawl.'}
        </p>
      </div>

      {/* Advanced options — site mode only */}
      {mode === 'site' && (
        <div className="space-y-3">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors">
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Advanced crawl options
          </button>

          {showAdvanced && (
            <div className="space-y-3 rounded-[8px] border border-border bg-bg-base p-3">
              {/* Discovery */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-text-secondary">Discovery</label>
                <select value={discovery} onChange={(e) => setDiscovery(e.target.value as CrawlPolicy['discovery'])}
                  className="w-full rounded-[6px] border border-border bg-bg-base px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
                  <option value="auto">Auto (sitemap first, crawl fallback)</option>
                  <option value="sitemap_only">Sitemap only</option>
                  <option value="crawl_only">Link crawl only</option>
                </select>
              </div>

              {/* Include / exclude paths */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary">
                    Include paths
                    <span className="ml-1 text-text-muted font-normal">(one glob per line)</span>
                  </label>
                  <textarea value={includePaths} onChange={(e) => setIncludePaths(e.target.value)}
                    rows={4} placeholder={'/onderwerpen/**\n/dossiers/**'}
                    className="w-full rounded-[6px] border border-border bg-bg-elevated px-2.5 py-1.5 text-[12px] font-mono text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
                  <p className="text-[10px] text-text-muted">Leave empty to include all paths.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary">
                    Exclude paths
                    <span className="ml-1 text-text-muted font-normal">(one glob per line)</span>
                  </label>
                  <textarea value={excludePaths} onChange={(e) => setExcludePaths(e.target.value)}
                    rows={4} placeholder={'/nieuws/**\n/pers/**'}
                    className="w-full rounded-[6px] border border-border bg-bg-elevated px-2.5 py-1.5 text-[12px] font-mono text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
                  <p className="text-[10px] text-text-muted">Noise paths always excluded automatically.</p>
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary">Max pages</label>
                  <input type="number" min={1} max={500} value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    className={inputCls('maxPages')} />
                  {errors.maxPages && <p className="text-[11px] text-expense">{errors.maxPages}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary">Max depth</label>
                  <input type="number" min={1} max={5} value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    className={inputCls('maxDepth')} />
                  {errors.maxDepth && <p className="text-[11px] text-expense">{errors.maxDepth}</p>}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={respectRobots}
                    onChange={(e) => setRespectRobots(e.target.checked)}
                    className="rounded" />
                  <span className="text-[12px] text-text-secondary">Respect robots.txt</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowSubdomains}
                    onChange={(e) => setAllowSubdomains(e.target.checked)}
                    className="rounded" />
                  <span className="text-[12px] text-text-secondary">Allow subdomains</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add source'}
        </Button>
      </div>
    </form>
  )
}

// ─── Per-source progress indicator ───────────────────────────────────────────

function SourceProgressIndicator({ progress }: { progress: SourceProgress }) {
  const { status, phase, processed, eligible, chunks } = progress

  if (status === 'queued') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-text-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted/50" />
        Queued
      </span>
    )
  }

  if (status === 'building') {
    const embedMatch = phase.match(/^embedding\s+(\d+)\/(\d+)/)
    if (embedMatch) {
      const done = parseInt(embedMatch[1], 10)
      const total = parseInt(embedMatch[2], 10)
      const pct = Math.round((done / total) * 100)
      return (
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[11px] text-text-secondary">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-text-muted border-t-transparent animate-spin shrink-0" />
            Embedding {done}/{total} chunks ({pct}%)
          </span>
          <div className="h-1 rounded-full bg-bg-base overflow-hidden w-full">
            <div className="h-full bg-accent transition-all duration-300 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }

    const phaseTrunc = phase.length > 30 ? phase.slice(0, 30) + '…' : phase
    const hasProgress = eligible > 0
    const pct = hasProgress ? Math.round((processed / eligible) * 100) : null

    return (
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11px] text-text-secondary">
          <span className="inline-block h-2 w-2 rounded-full border-2 border-text-muted border-t-transparent animate-spin shrink-0" />
          {phaseTrunc}
          {hasProgress && ` — ${processed}/${eligible} pages`}
          {chunks > 0 && `, ${chunks} chunks`}
        </span>
        {hasProgress && (
          <div className="h-1 rounded-full bg-bg-base overflow-hidden w-full">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {!hasProgress && (
          <div className="h-1 rounded-full bg-bg-base overflow-hidden w-full">
            <div className="h-full bg-accent/50 animate-pulse rounded-full w-full" />
          </div>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <span className="text-[11px] text-expense flex items-center gap-1">
        <X className="h-3 w-3 shrink-0" />
        {progress.error ? progress.error.slice(0, 50) : 'Error'}
      </span>
    )
  }

  if (status === 'ready' && chunks > 0) {
    return (
      <span className="text-[11px] text-income flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-income shrink-0" />
        {processed > 1 ? `${processed} pages, ` : ''}{chunks} chunks
      </span>
    )
  }

  return null
}

type KnowledgeStatus = 'not_configured' | 'building' | 'ready' | 'error'

function KnowledgeStatusBadge({ status, phase, chunkCount, sourceCount, indexedPageCount }: {
  status: KnowledgeStatus
  phase: string
  chunkCount: number
  sourceCount: number
  indexedPageCount: number
}) {
  const isActivePhase = phase !== 'idle' && phase !== 'starting' && phase !== 'done' && phase !== ''
  const showBuilding = status === 'building' || isActivePhase

  if (showBuilding) {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
        <span className="inline-block h-2 w-2 rounded-full border-2 border-text-muted border-t-transparent animate-spin" />
        Building…
      </span>
    )
  }
  if (status === 'ready') {
    const pageInfo = indexedPageCount > sourceCount
      ? ` ${'\u2022'} ${indexedPageCount} pages`
      : ''
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-income">
        <span className="inline-block h-2 w-2 rounded-full bg-income" />
        {`Ready \u2022 ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}${pageInfo} \u2022 ${chunkCount} chunks`}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-expense">
        <X className="h-3 w-3" />
        Error
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
      <span className="inline-block h-2 w-2 rounded-full border border-text-muted" />
      Not configured
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { accounts, addAccount, updateAccount, deleteAccount } = useSavingsAccounts()
  const { accounts: personalAccounts, addAccount: addPersonalAccount, updateAccount: updatePersonalAccount, deleteAccount: deletePersonalAccount } = usePersonalAccounts()
  const { sources: knowledgeSources, statusData: kbStatusData, addSource, updateSource, removeSource, resyncSource } = useKnowledgeSources()
  const bumpCsvLoadKey = useStore((s) => s.bumpCsvLoadKey)
  const loadingState = useStore((s) => s.loadingState)

  // Spaarpotje add/edit state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Personal accounts add/delete state
  const [showPersonalAddForm, setShowPersonalAddForm] = useState(false)
  const [deletingPersonalIban, setDeletingPersonalIban] = useState<string | null>(null)

  // Knowledge base add/edit/delete state
  const [showKbAddForm, setShowKbAddForm] = useState(false)
  const [editingKbUrl, setEditingKbUrl] = useState<string | null>(null)
  const [deletingKbUrl, setDeletingKbUrl] = useState<string | null>(null)

  // Reset dialog
  const [showResetDialog, setShowResetDialog] = useState(false)

  // CSV refresh
  const [refreshing, setRefreshing] = useState(false)
  const isDev = import.meta.env.DEV

  // The first color not already used by an existing account
  const firstAvailableColor =
    SPAARPOTJE_COLORS.find((c) => !accounts.some((a) => a.color === c)) ?? SPAARPOTJE_COLORS[0]

  // ── Spaarpotje handlers ──────────────────────────────────────────────────────

  function handleAdd(values: { name: string; iban: string; color: string }) {
    // Check for duplicate IBAN
    const dup = accounts.find((a) => a.iban.toLowerCase() === values.iban.toLowerCase())
    if (dup) {
      toast.error(`IBAN already registered as "${dup.name}"`)
      return
    }
    addAccount(values)
    setShowAddForm(false)
    toast.success(`Spaarpotje "${values.name}" added`)
  }

  function handleUpdate(id: string, values: { name: string; iban: string; color: string }) {
    // Check for duplicate IBAN (excluding self)
    const dup = accounts.find(
      (a) => a.iban.toLowerCase() === values.iban.toLowerCase() && a.id !== id,
    )
    if (dup) {
      toast.error(`IBAN already registered as "${dup.name}"`)
      return
    }
    updateAccount(id, values)
    setEditingId(null)
    toast.success(`Spaarpotje updated`)
  }

  function handleDelete(id: string) {
    const account = accounts.find((a) => a.id === id)
    deleteAccount(id)
    setDeletingId(null)
    toast.success(`"${account?.name}" removed`)
  }

  // ── Personal account handlers ────────────────────────────────────────────────

  function handlePersonalAdd(values: { iban: string; label: string; type: PersonalAccount['type']; enabled: boolean }) {
    const dup = personalAccounts.find(
      (a) => a.iban.toLowerCase() === values.iban.toLowerCase(),
    )
    if (dup) {
      toast.error(`IBAN already in personal accounts`)
      return
    }
    addPersonalAccount(values)
    setShowPersonalAddForm(false)
    toast.success(`Personal account added`)
  }

  function handlePersonalDelete(iban: string) {
    deletePersonalAccount(iban)
    setDeletingPersonalIban(null)
    toast.success(`Account removed`)
  }

  // ── Knowledge base handlers ───────────────────────────────────────────────

  async function handleKbAdd(source: KnowledgeSource) {
    const dup = knowledgeSources.find((s) => s.url === source.url)
    if (dup) {
      toast.error(`URL already added as "${dup.name}"`)
      return 'URL already configured'
    }
    const err = await addSource(source)
    if (err) { toast.error(err); return err }
    setShowKbAddForm(false)
    toast.success(`"${source.name}" added to knowledge base`)
    return null
  }

  async function handleKbUpdate(originalUrl: string, source: KnowledgeSource) {
    const err = await updateSource(originalUrl, source)
    if (err) { toast.error(err); return err }
    setEditingKbUrl(null)
    toast.success(`"${source.name}" updated`)
    return null
  }

  async function handleKbDelete(url: string) {
    const src = knowledgeSources.find((s) => s.url === url)
    try {
      await removeSource(url)
      setDeletingKbUrl(null)
      toast.success(`"${src?.name ?? 'Source'}" removed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove source')
    }
  }

  // ── CSV refresh ──────────────────────────────────────────────────────────────

  async function handleCsvRefresh() {
    setRefreshing(true)
    try {
      bumpCsvLoadKey()
      toast.success(
        isDev
          ? 'Re-parsing loaded CSV files with current rules…'
          : 'Re-scanning CSV files from disk…',
        { duration: 3000 },
      )
    } finally {
      // Keep spinner until loading completes (loadingState watcher would be better,
      // but a short delay is sufficient UX here)
      setTimeout(() => setRefreshing(false), 1500)
    }
  }

  const isLoading = loadingState.status === 'loading' || refreshing

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-10 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configure savings accounts, data refresh, and application state.
        </p>
      </div>

      {/* ── 1. Spaarpotjes ──────────────────────────────────────────────────── */}
      <Section
        title="Spaarpotjes"
        description="Register counterparty IBANs as named savings goals. Transfers to/from these IBANs are automatically categorized and tagged. Spaarpotje movements are excluded from income and expense totals."
      >
        <Card padding="none">
          {accounts.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center gap-2 py-10 text-text-muted">
              <PiggyBank className="h-8 w-8 opacity-40" strokeWidth={1.5} />
              <p className="text-sm">No spaarpotjes configured yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {accounts.map((account) => (
                <li key={account.id} className="px-4 py-3">
                  {editingId === account.id ? (
                    <SpaarpotjeForm
                      initial={account}
                      onSave={(values) => handleUpdate(account.id, values)}
                      onCancel={() => setEditingId(null)}
                      firstAvailableColor={firstAvailableColor}
                    />
                  ) : deletingId === account.id ? (
                    /* Inline delete confirm */
                    <div className="flex items-center gap-3 rounded-[8px] border border-expense/20 bg-expense-dim px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-expense" strokeWidth={2} />
                      <p className="flex-1 text-[13px] text-text-primary">
                        Delete <strong>"{account.name}"</strong>? This cannot be undone.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : (
                    /* Normal row */
                    <div className="flex items-center gap-3">
                      {/* Color dot */}
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: account.color }}
                      />
                      {/* Name + IBAN */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-text-primary truncate">
                          {account.name}
                        </p>
                        <p className="text-[11px] font-mono text-text-muted">{account.iban}</p>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setShowAddForm(false)
                            setEditingId(account.id)
                          }}
                          title="Edit"
                          className="rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => setDeletingId(account.id)}
                          title="Delete"
                          className="rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-expense-dim hover:text-expense"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add form */}
          {showAddForm && (
            <div className={cn('px-4 pb-4', accounts.length > 0 && 'border-t border-border pt-4')}>
              <SpaarpotjeForm
                onSave={handleAdd}
                onCancel={() => setShowAddForm(false)}
                firstAvailableColor={firstAvailableColor}
              />
            </div>
          )}

          {/* Add button */}
          {!showAddForm && (
            <div className={cn('px-4 py-3', accounts.length > 0 && 'border-t border-border')}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null)
                  setShowAddForm(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add spaarpotje
              </Button>
            </div>
          )}
        </Card>
      </Section>

      {/* ── 2. Personal Accounts ─────────────────────────────────────────────── */}
      <Section
        title="Personal Accounts"
        description="IBANs you own or share (pocket money, joint grocery account, etc.). If no category rule matches, transfers to/from these IBANs fall back to Internal Transfer and still count toward totals."
      >
        <Card padding="none">
          {personalAccounts.length === 0 && !showPersonalAddForm ? (
            <div className="flex flex-col items-center gap-2 py-10 text-text-muted">
              <ArrowLeftRight className="h-8 w-8 opacity-40" strokeWidth={1.5} />
              <p className="text-sm">No personal accounts configured yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {personalAccounts.map((account) => (
                <li key={account.iban}>
                  {deletingPersonalIban === account.iban ? (
                    <div className="flex items-center gap-3 rounded-[8px] border border-expense/20 bg-expense-dim mx-4 my-2 px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-expense" strokeWidth={2} />
                      <p className="flex-1 text-[13px] text-text-primary">
                        Remove <strong className="font-mono">{account.iban}</strong>?
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingPersonalIban(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handlePersonalDelete(account.iban)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Icon */}
                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />

                      {/* IBAN + label */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-mono text-text-primary">
                            {account.iban}
                          </p>
                          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </span>
                        </div>
                        {account.label && (
                          <p className="text-[11px] text-text-muted">{account.label}</p>
                        )}
                      </div>

                      {/* Enabled toggle */}
                      <button
                        onClick={() => updatePersonalAccount(account.iban, { enabled: !account.enabled })}
                        title={account.enabled ? 'Disable' : 'Enable'}
                        className="shrink-0 text-text-muted transition-colors hover:text-text-secondary"
                      >
                        {account.enabled
                          ? <ToggleRight className="h-5 w-5 text-accent" strokeWidth={1.75} />
                          : <ToggleLeft className="h-5 w-5" strokeWidth={1.75} />
                        }
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeletingPersonalIban(account.iban)}
                        title="Remove"
                        className="shrink-0 rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-expense-dim hover:text-expense"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add form */}
          {showPersonalAddForm && (
            <div className={cn('px-4 pb-4', personalAccounts.length > 0 && 'border-t border-border pt-4')}>
              <PersonalAccountForm
                onSave={handlePersonalAdd}
                onCancel={() => setShowPersonalAddForm(false)}
              />
            </div>
          )}

          {/* Add button */}
          {!showPersonalAddForm && (
            <div className={cn('px-4 py-3', personalAccounts.length > 0 && 'border-t border-border')}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPersonalAddForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add account
              </Button>
            </div>
          )}
        </Card>
      </Section>

      {/* ── 3. AI Knowledge Base ─────────────────────────────────────────── */}
      <Section
        title="AI Knowledge Base"
        description="URLs the advisor fetches and indexes as background knowledge when giving spending advice."
      >
        <Card padding="none">
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex flex-col gap-1 min-w-0 flex-1 mr-3">
              <KnowledgeStatusBadge
                status={kbStatusData?.status ?? 'not_configured'}
                phase={kbStatusData?.phase ?? ''}
                chunkCount={kbStatusData?.chunkCount ?? 0}
                sourceCount={kbStatusData?.sourceCount ?? 0}
                indexedPageCount={kbStatusData?.indexedPageCount ?? 0}
              />
              {kbStatusData && (() => {
                const phase = kbStatusData.phase
                const active = kbStatusData.status === 'building' ||
                  (phase !== 'idle' && phase !== 'starting' && phase !== 'done' && phase !== '')
                if (!active) return null
                // Parse "embedding 300/1012" → progress bar
                const embedMatch = phase.match(/^embedding\s+(\d+)\/(\d+)/)
                if (embedMatch) {
                  const done = parseInt(embedMatch[1], 10)
                  const total = parseInt(embedMatch[2], 10)
                  const pct = Math.round((done / total) * 100)
                  return (
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-text-muted">
                        Embedding {done}/{total} chunks ({pct}%)
                      </span>
                      <div className="h-1 rounded-full bg-bg-base overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-300 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                }
                // "fetching", "discovering", "processing X", "starting", etc.
                const label = kbStatusData.currentSource
                  ? `${phase !== 'idle' && phase !== 'starting' ? phase : 'Processing'} — ${kbStatusData.currentSource}`
                  : phase !== 'idle' && phase !== 'starting' ? phase : 'Building…'
                return (
                  <span className="text-[11px] text-text-muted">{label}</span>
                )
              })()}
              {kbStatusData && kbStatusData.queueLength > 0 && kbStatusData.status !== 'building' && (
                <span className="text-[11px] text-text-muted">
                  {kbStatusData.queueLength} source{kbStatusData.queueLength > 1 ? 's' : ''} queued
                </span>
              )}
            </div>
            {!showKbAddForm && !editingKbUrl && (
              <Button variant="ghost" size="sm" onClick={() => setShowKbAddForm(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add source
              </Button>
            )}
          </div>

          {/* Failed sources warning */}
          {kbStatusData && kbStatusData.failedSources.length > 0 && (
            <div className="px-4 py-2.5 border-b border-border bg-expense-dim/40 space-y-1">
              <p className="text-[11px] font-medium text-expense flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {kbStatusData.failedSources.length} source{kbStatusData.failedSources.length > 1 ? 's' : ''} failed to index
              </p>
              {kbStatusData.failedSources.map((f) => (
                <p key={f.url} className="text-[11px] text-text-secondary pl-5 truncate">
                  <span className="font-medium">{f.name}:</span> {f.reason}
                </p>
              ))}
            </div>
          )}

          {/* Failed pages warning (site crawl) */}
          {kbStatusData && kbStatusData.failedPages.length > 0 && (
            <div className="px-4 py-2.5 border-b border-border bg-expense-dim/20 space-y-1">
              <p className="text-[11px] font-medium text-text-secondary flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-text-muted" />
                {kbStatusData.failedPages.length} page{kbStatusData.failedPages.length > 1 ? 's' : ''} failed during crawl
              </p>
              {kbStatusData.failedPages.slice(0, 5).map((f) => (
                <p key={f.url} className="text-[10px] text-text-muted pl-5 truncate font-mono">
                  {f.url}: {f.reason}
                </p>
              ))}
              {kbStatusData.failedPages.length > 5 && (
                <p className="text-[10px] text-text-muted pl-5">
                  …and {kbStatusData.failedPages.length - 5} more
                </p>
              )}
            </div>
          )}

          {/* Source list */}
          {knowledgeSources.length > 0 && (
            <ul className="divide-y divide-border">
              {knowledgeSources.map((src) => (
                <li key={src.url}>
                  {editingKbUrl === src.url ? (
                    <div className="px-4 py-3">
                      <KnowledgeSourceForm
                        initial={src}
                        onSave={(updated) => handleKbUpdate(src.url, updated)}
                        onCancel={() => setEditingKbUrl(null)}
                      />
                    </div>
                  ) : deletingKbUrl === src.url ? (
                    <div className="flex items-center gap-3 mx-4 my-2 rounded-[8px] border border-expense/20 bg-expense-dim px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-expense" strokeWidth={2} />
                      <p className="flex-1 text-[13px] text-text-primary">
                        Remove <strong>"{src.name}"</strong>?
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingKbUrl(null)}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={() => void handleKbDelete(src.url)}>Remove</Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-medium text-text-primary truncate">{src.name}</p>
                            {src.mode === 'site' && (
                              <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                Site crawl
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-muted truncate">{src.url}</p>
                          {src.mode === 'site' && src.policy?.includePaths && src.policy.includePaths.length > 0 && (
                            <p className="text-[10px] text-text-muted/70 truncate font-mono mt-0.5">
                              include: {src.policy.includePaths.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Resync button */}
                          {(() => {
                            const sp = kbStatusData?.sourceProgress?.[src.url]
                            const busy = sp?.status === 'queued' || sp?.status === 'building'
                            return (
                              <button
                                onClick={() => void resyncSource(src.url)}
                                disabled={busy}
                                title={busy ? 'Already syncing…' : 'Resync this source'}
                                className={cn(
                                  'rounded-[6px] p-1.5 text-text-muted transition-colors',
                                  busy
                                    ? 'opacity-40 cursor-not-allowed'
                                    : 'hover:bg-bg-elevated hover:text-text-secondary',
                                )}
                              >
                                <RotateCcw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} strokeWidth={1.75} />
                              </button>
                            )
                          })()}
                          <button onClick={() => { setShowKbAddForm(false); setEditingKbUrl(src.url) }}
                            title="Edit"
                            className="rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary">
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                          <button onClick={() => setDeletingKbUrl(src.url)} title="Remove"
                            className="rounded-[6px] p-1.5 text-text-muted transition-colors hover:bg-expense-dim hover:text-expense">
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                      {/* Per-source progress */}
                      {(() => {
                        const sp = kbStatusData?.sourceProgress?.[src.url]
                        return sp && sp.status !== 'idle' ? (
                          <SourceProgressIndicator progress={sp} />
                        ) : null
                      })()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Empty state */}
          {knowledgeSources.length === 0 && !showKbAddForm && (
            <div className="flex flex-col items-center gap-2 py-10 text-text-muted">
              <Brain className="h-8 w-8 opacity-40" strokeWidth={1.5} />
              <p className="text-sm">No sources configured.</p>
              <p className="text-xs text-text-muted/60 max-w-xs text-center">
                Drop <code className="font-mono">.md</code> or <code className="font-mono">.txt</code> files into{' '}
                <code className="font-mono">data/knowledge/</code> for local sources without a URL.
              </p>
            </div>
          )}

          {/* Add form */}
          {showKbAddForm && (
            <div className={cn('px-4 pb-4', knowledgeSources.length > 0 && 'border-t border-border pt-4')}>
              <KnowledgeSourceForm
                onSave={handleKbAdd}
                onCancel={() => setShowKbAddForm(false)}
              />
            </div>
          )}
        </Card>
      </Section>

      {/* ── 4. Data ─────────────────────────────────────────────────────────── */}
      <Section
        title="Data"
        description="Manage CSV transaction data and categorization."
      >
        <Card padding="md">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-text-primary">Hard CSV Refresh</p>
              <p className="text-[12px] text-text-secondary">
                {isDev
                  ? 'Re-parses already-loaded CSV files with current categorization rules. New CSV files require a dev server restart.'
                  : 'Re-scans the transactions folder on disk and re-parses all CSV files. New files added since startup will be picked up.'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCsvRefresh}
              disabled={isLoading}
              className="shrink-0"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              {isLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
        </Card>
      </Section>

      {/* ── 5. Danger Zone ──────────────────────────────────────────────────── */}
      <Section title="Danger Zone">
        <Card padding="md" className="border-expense/20">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-text-primary">Reset all settings</p>
              <p className="text-[12px] text-text-secondary">
                Permanently deletes all category assignments, exclusions, custom rules, spaarpotje
                configuration, personal accounts, and generated insights. CSV files are untouched.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowResetDialog(true)}
              className="shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>

          {showResetDialog && (
            <div className="mt-4 border-t border-border pt-4">
              <ResetStateDialog onClose={() => setShowResetDialog(false)} />
            </div>
          )}
        </Card>
      </Section>
    </div>
  )
}
