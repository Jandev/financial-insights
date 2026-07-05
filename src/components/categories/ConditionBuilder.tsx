import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Condition, ConditionField, ConditionOperator } from '@/lib/categories'

// ─── Field + operator metadata ────────────────────────────────────────────────

interface FieldOption {
  value: ConditionField
  label: string
}

interface OperatorOption {
  value: ConditionOperator
  label: string
}

const FIELD_OPTIONS: FieldOption[] = [
  { value: 'description',     label: 'Description' },
  { value: 'counterpartyIban', label: 'Target IBAN' },
  { value: 'direction',        label: 'Direction' },
  { value: 'amount',           label: 'Amount (€)' },
]

const OPERATORS_BY_FIELD: Record<ConditionField, OperatorOption[]> = {
  description:      [
    { value: 'contains',    label: 'contains' },
    { value: 'equals',      label: 'equals' },
    { value: 'startsWith',  label: 'starts with' },
  ],
  counterpartyIban: [
    { value: 'contains',    label: 'contains' },
    { value: 'equals',      label: 'equals' },
    { value: 'startsWith',  label: 'starts with' },
  ],
  direction: [
    { value: 'is', label: 'is' },
  ],
  amount: [
    { value: 'gte', label: '>= (at least)' },
    { value: 'lte', label: '<= (at most)' },
  ],
}

const DEFAULT_VALUE_BY_FIELD: Record<ConditionField, string> = {
  description:      '',
  counterpartyIban: '',
  direction:        'debit',
  amount:           '',
}

function defaultOperatorForField(field: ConditionField): ConditionOperator {
  return OPERATORS_BY_FIELD[field][0].value
}

function generateConditionId() {
  return `cond-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ─── Shared input/select styles ───────────────────────────────────────────────

const inputCls = cn(
  'h-7 rounded-md border border-border bg-bg-base px-2 text-xs text-text-primary',
  'placeholder:text-text-muted outline-none',
  'focus:ring-2 focus:ring-accent/40 focus:border-accent/50',
  'transition-colors duration-150',
)

// ─── Props ────────────────────────────────────────────────────────────────────

interface ConditionBuilderProps {
  conditions: Condition[]
  combinator: 'and' | 'or'
  onChange: (conditions: Condition[]) => void
  onCombinatorChange: (combinator: 'and' | 'or') => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConditionBuilder({
  conditions,
  combinator,
  onChange,
  onCombinatorChange,
}: ConditionBuilderProps) {
  function updateCondition(id: string, patch: Partial<Condition>) {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function removeCondition(id: string) {
    onChange(conditions.filter((c) => c.id !== id))
  }

  function addCondition() {
    const field: ConditionField = 'description'
    onChange([
      ...conditions,
      {
        id: generateConditionId(),
        field,
        operator: defaultOperatorForField(field),
        value: DEFAULT_VALUE_BY_FIELD[field],
      },
    ])
  }

  function handleFieldChange(id: string, newField: ConditionField) {
    updateCondition(id, {
      field: newField,
      operator: defaultOperatorForField(newField),
      value: DEFAULT_VALUE_BY_FIELD[newField],
    })
  }

  return (
    <div className="space-y-2">
      {/* Condition rows */}
      {conditions.length === 0 ? (
        <p className="text-xs text-text-muted italic py-1">
          No conditions — add at least one to match transactions.
        </p>
      ) : (
        conditions.map((cond, idx) => (
          <div key={cond.id} className="flex items-center gap-1.5">
            {/* Combinator badge (shown between rows) */}
            {idx > 0 && (
              <button
                type="button"
                onClick={() => onCombinatorChange(combinator === 'and' ? 'or' : 'and')}
                title="Click to toggle AND / OR"
                className={cn(
                  'w-8 shrink-0 rounded text-[10px] font-bold uppercase tracking-wide',
                  'h-7 flex items-center justify-center cursor-pointer select-none',
                  'border transition-colors duration-150',
                  combinator === 'and'
                    ? 'bg-accent-dim text-accent border-accent/20'
                    : 'bg-warn-dim text-warn border-warn/20',
                )}
              >
                {combinator === 'and' ? 'AND' : 'OR'}
              </button>
            )}
            {/* Spacer on first row to keep alignment */}
            {idx === 0 && <div className="w-8 shrink-0" />}

            {/* Field select */}
            <select
              value={cond.field}
              onChange={(e) => handleFieldChange(cond.id, e.target.value as ConditionField)}
              className={cn(inputCls, 'cursor-pointer')}
            >
              {FIELD_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {/* Operator select */}
            <select
              value={cond.operator}
              onChange={(e) => updateCondition(cond.id, { operator: e.target.value as ConditionOperator })}
              className={cn(inputCls, 'cursor-pointer')}
            >
              {OPERATORS_BY_FIELD[cond.field].map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Value input — varies by field */}
            {cond.field === 'direction' ? (
              <select
                value={cond.value}
                onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                className={cn(inputCls, 'cursor-pointer flex-1')}
              >
                <option value="debit">Debit (outgoing)</option>
                <option value="credit">Credit (incoming)</option>
              </select>
            ) : cond.field === 'amount' ? (
              <input
                type="number"
                min={0}
                step={0.01}
                value={cond.value}
                onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                placeholder="0.00"
                className={cn(inputCls, 'flex-1 min-w-0')}
              />
            ) : (
              <input
                type="text"
                value={cond.value}
                onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                placeholder={cond.field === 'counterpartyIban' ? 'NL00AAAA…' : 'e.g. Albert Heijn'}
                className={cn(inputCls, 'flex-1 min-w-0')}
              />
            )}

            {/* Remove button */}
            <button
              type="button"
              onClick={() => removeCondition(cond.id)}
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-expense hover:bg-expense-dim transition-colors duration-150 cursor-pointer"
              aria-label="Remove condition"
            >
              <X size={13} />
            </button>
          </div>
        ))
      )}

      {/* Add condition */}
      <button
        type="button"
        onClick={addCondition}
        className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors duration-150 cursor-pointer"
      >
        <Plus size={12} />
        Add condition
      </button>
    </div>
  )
}
