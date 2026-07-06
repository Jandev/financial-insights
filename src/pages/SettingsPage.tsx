/**
 * SettingsPage — /settings
 *
 * Four sections:
 *   1. Spaarpotjes      — CRUD list for named savings accounts
 *   2. Personal Accounts — IBANs marked as internal (pocket money, joint accounts, etc.)
 *   3. Data             — Hard CSV refresh (prod: re-scans filesystem; dev: re-parses loaded files)
 *   4. Danger Zone      — Reset all settings (moved here from Sidebar)
 */

import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, RefreshCw, AlertTriangle,
  PiggyBank, ArrowLeftRight, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { useSavingsAccounts } from '@/hooks/useSavingsAccounts'
import { usePersonalAccounts } from '@/hooks/usePersonalAccounts'
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { accounts, addAccount, updateAccount, deleteAccount } = useSavingsAccounts()
  const { accounts: personalAccounts, addAccount: addPersonalAccount, updateAccount: updatePersonalAccount, deleteAccount: deletePersonalAccount } = usePersonalAccounts()
  const bumpCsvLoadKey = useStore((s) => s.bumpCsvLoadKey)
  const loadingState = useStore((s) => s.loadingState)

  // Spaarpotje add/edit state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Personal accounts add/delete state
  const [showPersonalAddForm, setShowPersonalAddForm] = useState(false)
  const [deletingPersonalIban, setDeletingPersonalIban] = useState<string | null>(null)

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
        description="IBANs you own or share (pocket money, joint grocery account, etc.). Transfers to/from these IBANs are shown as Internal Transfers and still count toward totals."
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

      {/* ── 3. Data ─────────────────────────────────────────────────────────── */}
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

      {/* ── 4. Danger Zone ──────────────────────────────────────────────────── */}
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
