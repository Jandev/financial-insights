import { useState, useMemo } from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { Search, Pencil, Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCategoryOverrides } from '@/hooks/useCategoryOverrides'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { useCategoryRuleList } from '@/store/selectors'
import { useStore } from '@/store'
import { FALLBACK_CATEGORY_COLOR } from '@/lib/categories'
import type { Transaction } from '@/types/transaction'

/** Minimal transaction fields required by the picker and badge components. */
export type TxCategorizable = Pick<Transaction, 'id' | 'category' | 'counterpartyName'>

interface CategoryPickerDropdownProps {
  tx: TxCategorizable
  onClose: () => void
}

type PickerStep = 'list' | 'confirm'

interface GroupedCategoryOption {
  name: string
  color: string
  icon: string
  ids: string[]
  targetId: string
}

function pickTargetCategoryId(ids: string[], currentId: string): string {
  if (ids.includes(currentId)) return currentId
  const preferred = ids.find((id) => !id.startsWith('custom-'))
  return preferred ?? ids[0] ?? currentId
}

/**
 * Popover content for selecting a category for a transaction.
 * Step 1: Searchable list of categories.
 * Step 2: Inline confirmation — "Just this transaction" or "All from [counterparty]".
 */
export function CategoryPickerDropdown({ tx, onClose }: CategoryPickerDropdownProps) {
  const { overrides, setOverride, removeOverride } = useCategoryOverrides()
  const { rules, addRule } = useCategoryRules()
  const recategorize = useStore((s) => s.recategorize)
  const aiCategories = useStore((s) => s.aiCategories)
  const removeAiCategory = useStore((s) => s.removeAiCategory)

  const [step, setStep] = useState<PickerStep>('list')
  const [search, setSearch] = useState('')
  const [pendingCategory, setPendingCategory] = useState<GroupedCategoryOption | null>(null)

  const hasOverride = Boolean(overrides[tx.id])
  const isAICategorized = aiCategories[tx.id]?.source === 'llm'

  // Group categories by display name (first-seen color/icon wins).
  const allCategories = useMemo(() => {
    const byName = new Map<string, Omit<GroupedCategoryOption, 'targetId'>>()
    for (const rule of rules) {
      const existing = byName.get(rule.name)
      if (!existing) {
        byName.set(rule.name, {
          name: rule.name,
          color: rule.color,
          icon: rule.icon,
          ids: [rule.id],
        })
        continue
      }
      if (!existing.ids.includes(rule.id)) existing.ids.push(rule.id)
    }

    return [...byName.values()].map((group) => ({
      ...group,
      targetId: pickTargetCategoryId(group.ids, tx.category),
    }))
  }, [rules, tx.category])

  const filtered = useMemo(() => {
    if (!search.trim()) return allCategories
    const q = search.toLowerCase()
    return allCategories.filter((g) => g.name.toLowerCase().includes(q))
  }, [allCategories, search])

  function handleSelectCategory(group: GroupedCategoryOption) {
    setPendingCategory(group)
    setStep('confirm')
  }

  function handleJustThis() {
    if (!pendingCategory) return
    setOverride(tx.id, pendingCategory.targetId)
    recategorize()
    onClose()
  }

  function handleAllFromCounterparty() {
    if (!pendingCategory) return
    addRule({
      kind: 'condition',
      name: pendingCategory.name,
      color: pendingCategory.color,
      icon: pendingCategory.icon,
      conditions: [
        {
          id: `rule-${Date.now()}`,
          field: 'description',
          operator: 'contains',
          value: tx.counterpartyName.toLowerCase(),
        },
      ],
      combinator: 'and',
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    })
    recategorize()
    onClose()
  }

  function handleRemoveOverride() {
    removeOverride(tx.id)
    recategorize()
    onClose()
  }

  function handleRevertAiCategory() {
    removeAiCategory(tx.id)
    recategorize()
    onClose()
  }

  return (
    <div className="w-64 overflow-hidden">
      {step === 'list' ? (
        <>
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 rounded-md bg-bg-base border border-border px-2 h-7">
              <Search size={12} className="text-text-muted shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="flex-1 min-w-0 text-xs bg-transparent text-text-primary placeholder:text-text-muted outline-none"
              />
            </div>
          </div>

          {/* Category list */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-text-muted">No categories found</p>
            ) : (
              filtered.map((rule) => (
                <button
                  key={rule.name}
                  type="button"
                  onClick={() => handleSelectCategory(rule)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-1.5 text-left',
                    'text-xs text-text-primary',
                    'hover:bg-bg-elevated transition-colors duration-100 cursor-pointer',
                    rule.ids.includes(tx.category) && 'bg-accent-dim',
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: rule.color }}
                  />
                  <span className="flex-1">{rule.name}</span>
                  {rule.ids.includes(tx.category) && (
                    <Check size={10} className="text-accent shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Remove override footer */}
          {hasOverride && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={handleRemoveOverride}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors cursor-pointer"
              >
                Restore rule-based category
              </button>
            </div>
          )}

          {/* Revert AI category footer */}
          {isAICategorized && !hasOverride && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={handleRevertAiCategory}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors cursor-pointer"
              >
                Revert to rule-based category
              </button>
            </div>
          )}
        </>
      ) : (
        /* Step 2: confirmation */
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('list')}
              className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              aria-label="Back"
            >
              ←
            </button>
            <p className="text-xs text-text-secondary flex-1">
              Assign{' '}
              <span className="font-medium text-text-primary">{pendingCategory?.name}</span> to:
            </p>
          </div>

          <button
            type="button"
            onClick={handleJustThis}
            className="w-full flex items-center justify-between rounded-md bg-bg-base hover:bg-bg-elevated border border-border px-3 py-2 text-left transition-colors cursor-pointer"
          >
            <div>
              <p className="text-xs font-medium text-text-primary">Just this transaction</p>
              <p className="text-[10px] text-text-muted mt-0.5">
                Manual override — stays when rules change
              </p>
            </div>
            <ChevronRight size={12} className="text-text-muted shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleAllFromCounterparty}
            className="w-full flex items-center justify-between rounded-md bg-bg-base hover:bg-bg-elevated border border-border px-3 py-2 text-left transition-colors cursor-pointer"
          >
            <div>
              <p className="text-xs font-medium text-text-primary">
                All from{' '}
                <span className="text-accent">{tx.counterpartyName || 'this counterparty'}</span>
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">
                Creates a rule — applies to future imports too
              </p>
            </div>
            <ChevronRight size={12} className="text-text-muted shrink-0" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CategoryBadge (exported, used in table rows) ─────────────────────────────

interface CategoryBadgeProps {
  tx: TxCategorizable
  /** Overrides map from the parent table — used to show the override indicator. */
  overrides: Record<string, string>
}

/**
 * Color-coded pill badge showing the transaction category.
 * Clicking opens a category picker popover.
 * Shows a small pencil dot if the category was manually overridden.
 */
export function CategoryBadge({ tx, overrides }: CategoryBadgeProps) {
  const [open, setOpen] = useState(false)
  const rules = useCategoryRuleList()
  const aiCategories = useStore((s) => s.aiCategories)

  // Resolve name + color from the full ruleset (covers custom rules too)
  const meta = rules.find((r) => r.id === tx.category)
  const hasOverride = Boolean(overrides[tx.id])
  const isAICategorized = aiCategories[tx.id]?.source === 'llm'

  const color = meta?.color ?? FALLBACK_CATEGORY_COLOR
  const name = meta?.name ?? tx.category ?? '—'

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          title={
            isAICategorized
              ? `AI categorized${hasOverride ? ' (overridden)' : ''} — click to change`
              : hasOverride
                ? 'Manual override — click to change'
                : 'Click to change category'
          }
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1',
            'text-[11px] font-medium leading-none',
            'bg-bg-elevated text-text-primary',
            'hover:bg-bg-surface border border-transparent hover:border-border',
            'transition-colors duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="max-w-[80px] truncate">{name}</span>
          {isAICategorized && !hasOverride && (
            <span className="shrink-0 text-[9px] text-accent leading-none" aria-label="AI categorized">✦</span>
          )}
          {hasOverride && (
            <Pencil size={9} className="shrink-0 text-text-muted" aria-label="Manual override" />
          )}
        </button>
      </RadixPopover.Trigger>

      <RadixPopover.Portal>
        <RadixPopover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 rounded-lg shadow-lg',
            'bg-bg-elevated border border-border',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CategoryPickerDropdown tx={tx} onClose={() => setOpen(false)} />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
