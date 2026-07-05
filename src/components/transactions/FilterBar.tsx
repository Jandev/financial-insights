import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X, ChevronDown, Check, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { useCategoryRules } from '@/hooks/useCategoryRules'
import { DEFAULT_FILTERS } from '@/store/slices/filterSlice'
import type { TransactionCode } from '@/types/transaction'

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANSACTION_CODES: { code: TransactionCode; label: string }[] = [
  { code: 'bc', label: 'bc — Bank credit' },
  { code: 'cb', label: 'cb — Creditor payment' },
  { code: 'ei', label: 'ei — Direct debit' },
  { code: 'tb', label: 'tb — Point of sale' },
]

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateToInputValue(date: Date | null): string {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function inputValueToDate(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ─── Dropdown helper ──────────────────────────────────────────────────────────

interface MultiSelectDropdownProps {
  label: string
  options: { value: string; label: string; color?: string }[]
  selected: string[]
  onChange: (values: string[]) => void
}

function MultiSelectDropdown({ label, options, selected, onChange }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const isActive = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs',
          'transition-colors duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          isActive
            ? 'border-accent bg-accent-dim text-accent'
            : 'border-border bg-bg-elevated text-text-secondary hover:bg-bg-surface hover:text-text-primary',
        )}
      >
        {label}
        {isActive && (
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent text-white text-[10px] font-medium leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1.5 z-50 min-w-[180px] rounded-lg',
            'bg-bg-elevated border border-border shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          <div className="py-1 max-h-52 overflow-y-auto">
            {options.map(({ value, label: optLabel, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggle(value)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
              >
                <span
                  className={cn(
                    'flex items-center justify-center h-4 w-4 rounded shrink-0',
                    'border transition-colors',
                    selected.includes(value)
                      ? 'bg-accent border-accent'
                      : 'border-border bg-bg-base',
                  )}
                >
                  {selected.includes(value) && <Check size={10} className="text-white" />}
                </span>
                {color && (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="flex-1">{optLabel}</span>
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

/**
 * Full filter bar for the transactions page.
 * Drives the Zustand filter slice — all changes are immediately reflected
 * in the table and stats row.
 */
export function FilterBar() {
  const filters = useStore((s) => s.filters)
  const setFilter = useStore((s) => s.setFilter)
  const clearFilters = useStore((s) => s.clearFilters)

  const { rules } = useCategoryRules()

  // Group all rules by display name → [ids].
  // Multiple rules can share a name (e.g. a default "Groceries" rule and a
  // custom pattern rule also called "Groceries"). For filtering we treat them
  // as one logical category and match against all their IDs.
  const nameToIds = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const r of rules) {
      const existing = map.get(r.name) ?? []
      if (!existing.includes(r.id)) existing.push(r.id)
      map.set(r.name, existing)
    }
    return map
  }, [rules])

  // One option per unique name (first-seen color wins for the dot)
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>()
    return rules
      .filter((r) => {
        if (seen.has(r.name)) return false
        seen.add(r.name)
        return true
      })
      .map((r) => ({ value: r.name, label: r.name, color: r.color }))
  }, [rules])

  // Which names are currently active — a name is active when at least one of
  // its IDs is present in filters.categories
  const selectedCategoryNames = useMemo(
    () =>
      categoryOptions
        .filter(({ value: name }) =>
          (nameToIds.get(name) ?? []).some((id) => filters.categories.includes(id)),
        )
        .map(({ value }) => value),
    [categoryOptions, nameToIds, filters.categories],
  )

  // Selecting/deselecting a name adds/removes ALL IDs for that name
  const handleCategoryNamesChange = useCallback(
    (names: string[]) => {
      const newIds = names.flatMap((name) => nameToIds.get(name) ?? [])
      setFilter('categories', newIds)
    },
    [nameToIds, setFilter],
  )

  // Debounced search
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        setFilter('search', value)
      }, 300)
    },
    [setFilter],
  )

  // Sync draft if filters are cleared externally
  useEffect(() => {
    setSearchDraft(filters.search)
  }, [filters.search])

  // Count active (non-default) filter fields
  const activeCount = [
    filters.search !== DEFAULT_FILTERS.search,
    filters.dateFrom !== DEFAULT_FILTERS.dateFrom,
    filters.dateTo !== DEFAULT_FILTERS.dateTo,
    filters.categories.length > 0,
    filters.transactionCodes.length > 0,
    filters.amountMin !== DEFAULT_FILTERS.amountMin,
    filters.amountMax !== DEFAULT_FILTERS.amountMax,
  ].filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-bg-elevated min-w-[200px] flex-1 max-w-xs">
        <Search size={13} className="text-text-muted shrink-0" />
        <input
          type="text"
          value={searchDraft}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search counterparty or description…"
          className="flex-1 min-w-0 text-xs bg-transparent text-text-primary placeholder:text-text-muted outline-none"
        />
        {searchDraft && (
          <button
            type="button"
            onClick={() => handleSearchChange('')}
            className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Date from */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-text-muted whitespace-nowrap">From</label>
        <input
          type="date"
          value={dateToInputValue(filters.dateFrom)}
          onChange={(e) => setFilter('dateFrom', inputValueToDate(e.target.value))}
          className={cn(
            'h-8 px-2 rounded-lg border text-xs bg-bg-elevated text-text-primary',
            'border-border outline-none cursor-pointer',
            'focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors',
            filters.dateFrom && 'border-accent bg-accent-dim text-accent',
          )}
        />
      </div>

      {/* Date to */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-text-muted whitespace-nowrap">To</label>
        <input
          type="date"
          value={dateToInputValue(filters.dateTo)}
          onChange={(e) => setFilter('dateTo', inputValueToDate(e.target.value))}
          className={cn(
            'h-8 px-2 rounded-lg border text-xs bg-bg-elevated text-text-primary',
            'border-border outline-none cursor-pointer',
            'focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors',
            filters.dateTo && 'border-accent bg-accent-dim text-accent',
          )}
        />
      </div>

      {/* Category multi-select */}
      <MultiSelectDropdown
        label="Category"
        options={categoryOptions}
        selected={selectedCategoryNames}
        onChange={handleCategoryNamesChange}
      />

      {/* Type multi-select */}
      <MultiSelectDropdown
        label="Type"
        options={TRANSACTION_CODES.map(({ code, label }) => ({ value: code, label }))}
        selected={filters.transactionCodes}
        onChange={(v) => setFilter('transactionCodes', v as TransactionCode[])}
      />

      {/* Amount range */}
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal size={13} className="text-text-muted" />
        <input
          type="number"
          min={0}
          placeholder="Min €"
          value={filters.amountMin ?? ''}
          onChange={(e) =>
            setFilter('amountMin', e.target.value === '' ? null : Number(e.target.value))
          }
          className={cn(
            'h-8 w-20 px-2 rounded-lg border text-xs bg-bg-elevated text-text-primary',
            'border-border outline-none',
            'focus:ring-2 focus:ring-accent/50',
            'transition-colors',
            filters.amountMin !== null && 'border-accent bg-accent-dim',
          )}
        />
        <span className="text-xs text-text-muted">–</span>
        <input
          type="number"
          min={0}
          placeholder="Max €"
          value={filters.amountMax ?? ''}
          onChange={(e) =>
            setFilter('amountMax', e.target.value === '' ? null : Number(e.target.value))
          }
          className={cn(
            'h-8 w-20 px-2 rounded-lg border text-xs bg-bg-elevated text-text-primary',
            'border-border outline-none',
            'focus:ring-2 focus:ring-accent/50',
            'transition-colors',
            filters.amountMax !== null && 'border-accent bg-accent-dim',
          )}
        />
      </div>

      {/* Show excluded toggle */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.showExcluded}
          onChange={(e) => setFilter('showExcluded', e.target.checked)}
          className="sr-only peer"
        />
        <span
          className={cn(
            'relative inline-flex h-4.5 w-8 items-center rounded-full border',
            'transition-colors duration-200',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50',
            filters.showExcluded ? 'bg-accent border-accent' : 'bg-bg-surface border-border',
          )}
        >
          <span
            className={cn(
              'absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200',
              filters.showExcluded ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>
        <span className="text-xs text-text-secondary">Show hidden</span>
      </label>

      {/* Clear filters */}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors cursor-pointer"
        >
          <X size={12} />
          Clear ({activeCount})
        </button>
      )}
    </div>
  )
}
