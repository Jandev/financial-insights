import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { Pencil, Trash2, Plus, AlertTriangle, Check, ChevronRight, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_RULES,
  isConditionRule,
  isLegacyRule,
  type CategoryRule,
  type CategoryRuleDraft,
  type Condition,
} from '@/lib/categories'
import { ConditionBuilder } from './ConditionBuilder'

// ─── macOS system color palette ──────────────────────────────────────────────

const MACOS_PALETTE = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#30D158', '#00C7BE', '#30B0C7', '#007AFF',
  '#5856D6', '#AF52DE', '#FF2D55', '#A2845E',
  '#8E8E93',
]

// ─── Condition display helpers ────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  description:      'Description',
  counterpartyIban: 'IBAN',
  direction:        'Direction',
  amount:           'Amount (€)',
}

const OP_LABELS: Record<string, string> = {
  contains:   'contains',
  equals:     'equals',
  startsWith: 'starts with',
  is:         'is',
  gte:        '≥',
  lte:        '≤',
}

function ConditionChip({
  condition,
  combinator,
  isFirst,
}: {
  condition: Condition
  combinator: 'and' | 'or'
  isFirst: boolean
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] flex-wrap">
      {!isFirst && (
        <span
          className={cn(
            'font-bold uppercase tracking-wide text-[9px] rounded px-1 py-0 leading-tight',
            combinator === 'and'
              ? 'text-accent bg-accent-dim'
              : 'text-warn bg-warn-dim',
          )}
        >
          {combinator}
        </span>
      )}
      <span className="text-text-secondary">{FIELD_LABELS[condition.field] ?? condition.field}</span>
      <span className="text-text-muted">{OP_LABELS[condition.operator] ?? condition.operator}</span>
      <span className="font-mono text-text-primary bg-bg-elevated border border-border rounded px-1 max-w-[120px] truncate">
        {condition.value || '—'}
      </span>
    </div>
  )
}

// ─── Add/Edit form ────────────────────────────────────────────────────────────

interface RuleFormProps {
  initial?: CategoryRule
  onSave: (draft: CategoryRuleDraft) => void
  onCancel: () => void
}

function RuleForm({ initial, onSave, onCancel }: RuleFormProps) {
  const initialConditionRule = initial && isConditionRule(initial) ? initial : null

  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? MACOS_PALETTE[7])
  const [conditions, setConditions] = useState<Condition[]>(
    initialConditionRule?.conditions ?? [],
  )
  const [combinator, setCombinator] = useState<'and' | 'or'>(
    initialConditionRule?.combinator ?? 'and',
  )

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({
      kind: 'condition',
      name: trimmed,
      color,
      icon: initial?.icon ?? 'Tag',
      conditions,
      combinator,
    })
  }

  const isValid = name.trim().length > 0

  return (
    <div className="space-y-3 rounded-xl border border-accent/20 bg-accent-dim/30 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {initial ? 'Edit rule' : 'New rule'}
      </p>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Savings"
          autoFocus
          className={cn(
            'w-full h-7 rounded-md border border-border bg-bg-base px-2 text-xs text-text-primary',
            'placeholder:text-text-muted outline-none',
            'focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-colors',
          )}
        />
      </div>

      {/* Color */}
      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Color</label>
        <div className="flex flex-wrap gap-1.5">
          {MACOS_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setColor(hex)}
              style={{ backgroundColor: hex }}
              className={cn(
                'h-5 w-5 rounded-full cursor-pointer transition-transform duration-100',
                'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                color === hex && 'ring-2 ring-offset-1 ring-text-secondary scale-110',
              )}
              aria-label={hex}
            />
          ))}
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Match conditions</label>
        <ConditionBuilder
          conditions={conditions}
          combinator={combinator}
          onChange={setConditions}
          onCombinatorChange={setCombinator}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium',
            'bg-accent text-white transition-opacity duration-150 cursor-pointer',
            'disabled:opacity-40 disabled:pointer-events-none',
          )}
        >
          <Check size={12} />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            'inline-flex items-center h-7 px-3 rounded-md text-xs text-text-secondary',
            'border border-border hover:bg-bg-elevated transition-colors duration-150 cursor-pointer',
          )}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Pattern chips (used for read-only DEFAULT_RULES display) ─────────────────

const CHIP_PREVIEW = 4

function PatternChips({ patterns }: { patterns: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? patterns : patterns.slice(0, CHIP_PREVIEW)
  const more = patterns.length - CHIP_PREVIEW

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {visible.map((p) => (
        <span
          key={p}
          className="rounded bg-bg-elevated border border-border px-1.5 py-0.5 text-[10px] text-text-secondary font-mono"
        >
          {p}
        </span>
      ))}
      {!expanded && more > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] text-accent hover:text-accent/80 self-center cursor-pointer transition-colors"
        >
          +{more} more
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[10px] text-text-muted hover:text-text-secondary self-center cursor-pointer transition-colors"
        >
          show less
        </button>
      )}
    </div>
  )
}

// ─── Custom rule row ──────────────────────────────────────────────────────────

const CONDITIONS_PREVIEW = 2

interface CustomRuleRowProps {
  rule: CategoryRule
  onEdit: () => void
  onDelete: () => void
}

function CustomRuleRow({ rule, onEdit, onDelete }: CustomRuleRowProps) {
  const [expanded, setExpanded] = useState(false)

  const conditionRule = isConditionRule(rule) ? rule : null
  const legacyRule = isLegacyRule(rule) ? rule : null

  const all = conditionRule?.conditions ?? []
  const combinator = conditionRule?.combinator ?? 'and'
  const hasMore = all.length > CONDITIONS_PREVIEW
  const visible = expanded ? all : all.slice(0, CONDITIONS_PREVIEW)

  return (
    <div className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-bg-elevated transition-colors duration-100">
      <span
        className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: rule.color }}
      />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary">{rule.name}</p>

        {conditionRule && all.length === 0 ? (
          <p className="text-[10px] text-text-muted mt-0.5 italic">No conditions</p>
        ) : (
          <>
            {conditionRule && (
              <div className="mt-1 space-y-0.5">
                {visible.map((c, idx) => (
                  <ConditionChip
                    key={c.id}
                    condition={c}
                    combinator={combinator}
                    isFirst={idx === 0}
                  />
                ))}
                {!expanded && hasMore && (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-[10px] text-accent hover:text-accent/80 cursor-pointer transition-colors"
                  >
                    +{all.length - CONDITIONS_PREVIEW} more
                  </button>
                )}
                {expanded && hasMore && (
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer transition-colors"
                  >
                    show less
                  </button>
                )}
              </div>
            )}
            {legacyRule && (
              <div className="mt-1">
                {legacyRule.patterns.length > 0 ? (
                  <PatternChips patterns={legacyRule.patterns} />
                ) : (
                  <p className="text-[10px] text-text-muted mt-0.5 italic">Legacy rule</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
          aria-label="Edit rule"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-expense hover:bg-expense-dim transition-colors cursor-pointer"
          aria-label="Delete rule"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ─── Default rule row (accordion + rename) ────────────────────────────────────

function ConstraintBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-accent-dim border border-accent/15 px-1.5 py-0.5 text-[10px] text-accent font-medium">
      {children}
    </span>
  )
}

interface DefaultRuleRowProps {
  rule: CategoryRule
  /** Current display name — may differ from rule.name when overridden */
  displayName: string
  /** Whether this rule's name has been overridden by the user */
  isOverridden: boolean
  onRename: (newName: string) => void
  onResetName: () => void
}

function DefaultRuleRow({ rule, displayName, isOverridden, onRename, onResetName }: DefaultRuleRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const legacyRule = isLegacyRule(rule) ? rule : null
  const hasPatterns = legacyRule !== null && legacyRule.patterns.length > 0
  const hasCodes = legacyRule !== null && (legacyRule.transactionCodes?.length ?? 0) > 0
  const hasDirection = legacyRule !== null && legacyRule.isCredit !== undefined
  const hasAmount = legacyRule !== null && (legacyRule.amountMin !== undefined || legacyRule.amountMax !== undefined)
  const hasAnyCriteria = hasPatterns || hasCodes || hasDirection || hasAmount

  function startEditing() {
    setDraftName(displayName)
    setEditing(true)
    // Focus input on next tick after render
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== displayName) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <div className="group rounded-lg overflow-hidden">
      {/* Clickable header */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2',
          'transition-all duration-100',
          hasAnyCriteria
            ? 'hover:bg-bg-elevated opacity-75 hover:opacity-100'
            : 'opacity-60',
          expanded && 'bg-bg-elevated !opacity-100',
        )}
      >
        {/* Expand toggle — only when criteria exist */}
        <button
          type="button"
          onClick={() => hasAnyCriteria && setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-2.5 flex-1 min-w-0 text-left',
            hasAnyCriteria ? 'cursor-pointer' : 'cursor-default',
          )}
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: rule.color }}
          />

          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
              }}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex-1 min-w-0 h-5 rounded border border-accent/40 bg-bg-base px-1.5 text-xs text-text-primary',
                'outline-none focus:ring-1 focus:ring-accent/40',
              )}
            />
          ) : (
            <span className={cn(
              'flex-1 min-w-0 text-xs font-medium text-text-primary truncate',
              isOverridden && 'text-accent',
            )}>
              {displayName}
            </span>
          )}

          {!editing && hasAnyCriteria && (
            <ChevronRight
              size={12}
              className={cn(
                'shrink-0 text-text-muted transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
          )}
        </button>

        {/* Hover actions: pencil + optional reset */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {isOverridden && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onResetName() }}
                title={`Reset to "${rule.name}"`}
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
                aria-label={`Reset name to ${rule.name}`}
              >
                <RotateCcw size={11} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startEditing() }}
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
              aria-label="Rename category"
            >
              <Pencil size={11} />
            </button>
          </div>
        )}

        {/* Confirm / cancel while editing */}
        {editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitEdit() }}
              className="h-6 w-6 flex items-center justify-center rounded text-accent hover:bg-bg-surface transition-colors cursor-pointer"
              aria-label="Confirm rename"
            >
              <Check size={11} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cancelEdit() }}
              className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
              aria-label="Cancel rename"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded criteria */}
      {expanded && (
        <div className="px-2.5 pb-3 space-y-2.5" style={{ paddingLeft: '2.125rem' }}>
          {/* Patterns — OR semantics */}
          {hasPatterns && (
            <div>
              <p className="text-[10px] text-text-muted mb-1">
                Counterparty / description contains any of:
              </p>
              <PatternChips patterns={legacyRule?.patterns ?? []} />
            </div>
          )}

          {/* Hard AND constraints */}
          {(hasDirection || hasCodes || hasAmount) && (
            <div>
              <p className="text-[10px] text-text-muted mb-1">
                {hasPatterns ? 'And also requires:' : 'Requires:'}
              </p>
              <div className="flex flex-wrap gap-1">
                {hasDirection && (
                  <ConstraintBadge>
                    Direction is {legacyRule?.isCredit ? 'credit' : 'debit'}
                  </ConstraintBadge>
                )}
                {hasCodes && legacyRule?.transactionCodes?.map((code) => (
                  <ConstraintBadge key={code}>Code: {code}</ConstraintBadge>
                ))}
                {legacyRule?.amountMin !== undefined && (
                  <ConstraintBadge>Amount ≥ €{legacyRule.amountMin}</ConstraintBadge>
                )}
                {legacyRule?.amountMax !== undefined && (
                  <ConstraintBadge>Amount ≤ €{legacyRule.amountMax}</ConstraintBadge>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RuleEditorProps {
  customRules: CategoryRule[]
  onAdd: (draft: CategoryRuleDraft) => void
  onUpdate: (id: string, patch: CategoryRuleDraft) => void
  onDelete: (id: string) => void
  onResetToDefaults: () => void
  /** Current map of categoryId → custom display name for built-in defaults */
  defaultNameOverrides: Record<string, string>
  /** Set a custom display name for a built-in default category */
  onRenameDefault: (id: string, name: string) => void
  /** Reset the display name for a built-in default category to its English original */
  onResetDefaultName: (id: string) => void
}

function RuleGroupSection({
  name,
  count,
  children,
}: {
  name: string
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-bg-elevated transition-colors duration-100 cursor-pointer"
      >
        <ChevronRight
          size={12}
          className={cn(
            'shrink-0 text-text-muted transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1 text-[11px] font-medium text-text-secondary truncate">{name}</span>
        <span className="inline-flex items-center rounded-full bg-bg-elevated border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
          {count}
        </span>
      </button>

      {open && children}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleEditor({
  customRules,
  onAdd,
  onUpdate,
  onDelete,
  onResetToDefaults,
  defaultNameOverrides,
  onRenameDefault,
  onResetDefaultName,
}: RuleEditorProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const handleAdd = useCallback(
    (draft: CategoryRuleDraft) => {
      onAdd(draft)
      setIsAdding(false)
    },
    [onAdd],
  )

  const handleUpdate = useCallback(
    (id: string, draft: CategoryRuleDraft) => {
      onUpdate(id, draft)
      setEditingId(null)
    },
    [onUpdate],
  )

  const handleDeleteConfirm = useCallback(
    (id: string) => {
      onDelete(id)
      setDeletingId(null)
    },
    [onDelete],
  )

  const handleReset = useCallback(() => {
    onResetToDefaults()
    setConfirmingReset(false)
    setIsAdding(false)
    setEditingId(null)
  }, [onResetToDefaults])

  const groupedCustomRules = useMemo(() => {
    const groups = new Map<string, CategoryRule[]>()
    for (const rule of customRules) {
      const name = rule.name.trim() || 'Unnamed'
      const bucket = groups.get(name) ?? []
      bucket.push(rule)
      groups.set(name, bucket)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([name, rules]) => ({ name, rules }))
  }, [customRules])

  const groupedDefaultRules = useMemo(() => {
    const groups = new Map<string, CategoryRule[]>()
    for (const rule of DEFAULT_RULES.filter((r) => r.id !== 'uncategorized')) {
      const name = defaultNameOverrides[rule.id] ?? rule.name
      const bucket = groups.get(name) ?? []
      bucket.push(rule)
      groups.set(name, bucket)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map(([name, rules]) => ({ name, rules }))
  }, [defaultNameOverrides])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Category Rules</h2>
        <div className="flex items-center gap-2">
          {!isAdding && !editingId && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs text-accent border border-accent/20 bg-accent-dim hover:bg-accent-dim/70 transition-colors cursor-pointer"
            >
              <Plus size={11} />
              Add rule
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-0.5">
        {/* Add form */}
        {isAdding && (
          <RuleForm onSave={handleAdd} onCancel={() => setIsAdding(false)} />
        )}

        {/* Custom rules */}
        {customRules.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              Custom
            </p>
            {groupedCustomRules.map((group) => (
              <RuleGroupSection key={group.name} name={group.name} count={group.rules.length}>
                <div className="space-y-1.5">
                  {group.rules.map((rule) => (
                    <div key={rule.id} className="space-y-1.5">
                      {editingId === rule.id ? (
                        <RuleForm
                          initial={rule}
                          onSave={(draft) => handleUpdate(rule.id, draft)}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : deletingId === rule.id ? (
                        /* Inline delete confirmation */
                        <div className="flex items-center gap-2 rounded-lg border border-expense/20 bg-expense-dim px-3 py-2">
                          <AlertTriangle size={12} className="text-expense shrink-0" />
                          <span className="flex-1 text-xs text-expense">Delete "{rule.name}"?</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteConfirm(rule.id)}
                            className="text-xs font-medium text-expense hover:text-expense/80 cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="text-xs text-text-muted hover:text-text-secondary cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <CustomRuleRow
                          rule={rule}
                          onEdit={() => {
                            setEditingId(rule.id)
                            setIsAdding(false)
                          }}
                          onDelete={() => setDeletingId(rule.id)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </RuleGroupSection>
            ))}
          </section>
        )}

        {/* Default rules */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Built-in defaults
            </p>
            <span className="text-[10px] text-text-muted">Read-only · click to expand · hover to rename</span>
          </div>
          {groupedDefaultRules.map((group) => (
            <RuleGroupSection key={group.name} name={group.name} count={group.rules.length}>
              <div className="space-y-0.5">
                {group.rules.map((rule) => (
                  <DefaultRuleRow
                    key={rule.id}
                    rule={rule}
                    displayName={defaultNameOverrides[rule.id] ?? rule.name}
                    isOverridden={Object.prototype.hasOwnProperty.call(defaultNameOverrides, rule.id)}
                    onRename={(name) => onRenameDefault(rule.id, name)}
                    onResetName={() => onResetDefaultName(rule.id)}
                  />
                ))}
              </div>
            </RuleGroupSection>
          ))}
        </section>

        {/* Reset to defaults */}
        <div className="pb-1">
          {confirmingReset ? (
            <div className="flex items-center gap-2 rounded-lg border border-warn/20 bg-warn-dim px-3 py-2">
              <AlertTriangle size={12} className="text-warn shrink-0" />
              <span className="flex-1 text-xs text-warn">Remove all custom rules?</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-medium text-warn hover:text-warn/80 cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="text-xs text-text-muted hover:text-text-secondary cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            customRules.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="text-xs text-text-muted hover:text-expense transition-colors duration-150 cursor-pointer"
              >
                Reset to defaults…
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
