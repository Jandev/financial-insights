import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type PaginationState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, EyeOff, ChevronLeft, ChevronRight, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateFull } from '@/lib/utils'
import { useFilteredTransactions, useStore } from '@/store'
import { useCategoryOverrides } from '@/hooks/useCategoryOverrides'
import type { Transaction } from '@/types/transaction'
import type { AnomalyFinding } from '@/store/slices/llmSlice'
import { TypeBadge } from './TypeBadge'
import { ExclusionToggle } from './ExclusionToggle'
import { CategoryBadge } from './CategoryBadge'
import { Tooltip } from '@/components/ui/Tooltip'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50
const columnHelper = createColumnHelper<Transaction>()

// ─── Sort header helper ────────────────────────────────────────────────────────

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc') return <ArrowUp size={12} className="shrink-0" />
  if (isSorted === 'desc') return <ArrowDown size={12} className="shrink-0" />
  return <ArrowUpDown size={12} className="shrink-0 opacity-40" />
}

// ─── Severity badge ───────────────────────────────────────────────────────────

const SEVERITY_META = {
  alert:   { Icon: AlertCircle,   cls: 'text-[#FF3B30]' },
  warning: { Icon: AlertTriangle, cls: 'text-[#FF9500]' },
  info:    { Icon: Info,          cls: 'text-[#007AFF]' },
} as const

function FlagCell({ finding }: { finding: AnomalyFinding | undefined }) {
  if (!finding) return <span className="inline-block w-4" />
  const { Icon, cls } = SEVERITY_META[finding.severity]
  const tip = finding.actionSuggestion
    ? `${finding.title} — ${finding.explanation} ${finding.actionSuggestion}`
    : `${finding.title} — ${finding.explanation}`
  return (
    <Tooltip content={tip}>
      <span className="flex justify-center cursor-default">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', cls)} strokeWidth={1.75} />
      </span>
    </Tooltip>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionTable() {
  const filteredTxs = useFilteredTransactions()
  const { excludedIds, restoreFiltered, findings, dismissedFindingIds } = useStore(
    useShallow((s) => ({
      excludedIds: s.excludedIds,
      restoreFiltered: s.restoreFiltered,
      findings: s.findings,
      dismissedFindingIds: s.dismissedFindingIds,
    })),
  )
  const { overrides } = useCategoryOverrides()

  // Build lookup: transactionId → finding (only undismissed)
  const activeFindingByTxId = useMemo(() => {
    const map = new Map<string, AnomalyFinding>()
    for (const f of findings) {
      if (!dismissedFindingIds.has(f.transactionId)) map.set(f.transactionId, f)
    }
    return map
  }, [findings, dismissedFindingIds])

  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })

  // IDs of excluded transactions within the current filtered set
  const filteredExcludedIds = useMemo(
    () => filteredTxs.filter((tx) => excludedIds.has(tx.id)).map((tx) => tx.id),
    [filteredTxs, excludedIds],
  )
  const hiddenCount = filteredExcludedIds.length

  // Column definitions — recreated when excludedIds, overrides, or findings change
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'flag',
        header: '',
        size: 32,
        enableSorting: false,
        cell: ({ row }) => <FlagCell finding={activeFindingByTxId.get(row.original.id)} />,
      }),

      columnHelper.accessor('date', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center gap-1 cursor-pointer select-none"
          >
            Date
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-xs text-text-secondary tabular-nums whitespace-nowrap">
            {formatDateFull(getValue())}
          </span>
        ),
        sortingFn: 'datetime',
      }),

      columnHelper.accessor('counterpartyName', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center gap-1 cursor-pointer select-none"
          >
            Counterparty
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 200,
        cell: ({ getValue }) => {
          const name = getValue()
          return (
            <span
              title={name}
              className="block truncate max-w-[188px] text-sm font-medium text-text-primary"
            >
              {name || '—'}
            </span>
          )
        },
        sortingFn: 'alphanumeric',
      }),

      columnHelper.accessor('description', {
        header: 'Description',
        size: 250,
        enableSorting: false,
        cell: ({ getValue }) => {
          const desc = getValue()
          return (
            <span
              title={desc}
              className="block truncate max-w-[238px] text-xs text-text-secondary"
            >
              {desc || '—'}
            </span>
          )
        },
      }),

      columnHelper.accessor('transactionCode', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center gap-1 cursor-pointer select-none"
          >
            Type
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 80,
        cell: ({ getValue }) => <TypeBadge code={getValue()} />,
      }),

      columnHelper.accessor('category', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center gap-1 cursor-pointer select-none"
          >
            Category
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 120,
        cell: ({ row }) => (
          <CategoryBadge tx={row.original} overrides={overrides} />
        ),
      }),

      columnHelper.accessor('amount', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center justify-end gap-1 w-full cursor-pointer select-none"
          >
            Amount
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 110,
        cell: ({ getValue, row }) => {
          const amount = getValue()
          const isExcluded = excludedIds.has(row.original.id)
          return (
            <span
              className={cn(
                'block text-right text-sm tabular-nums font-medium',
                amount > 0 ? 'text-income' : 'text-expense',
                isExcluded && 'line-through',
              )}
            >
              {formatCurrency(amount)}
            </span>
          )
        },
        sortingFn: 'basic',
      }),

      columnHelper.accessor('balanceAfter', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center justify-end gap-1 w-full cursor-pointer select-none"
          >
            Balance
            <SortIcon isSorted={column.getIsSorted()} />
          </button>
        ),
        size: 110,
        cell: ({ getValue }) => (
          <span className="block text-right text-sm text-text-secondary tabular-nums">
            {formatCurrency(getValue())}
          </span>
        ),
        sortingFn: 'basic',
      }),

      columnHelper.display({
        id: 'exclude',
        header: '',
        size: 56,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <ExclusionToggle
              txId={row.original.id}
              isExcluded={excludedIds.has(row.original.id)}
            />
          </div>
        ),
      }),
    ],
    [excludedIds, overrides, activeFindingByTxId],
  )

  const table = useReactTable({
    data: filteredTxs,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      setSorting(updater)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const totalRows = filteredTxs.length
  const pageCount = table.getPageCount()
  const currentPage = pagination.pageIndex
  const rows = table.getRowModel().rows

  // ── Render ──────────────────────────────────────────────────────────────────

  if (totalRows === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <p className="text-sm">No transactions match the current filters.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar — hidden count + restore all */}
      {hiddenCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-base rounded-t-lg">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <EyeOff size={12} />
            {hiddenCount} hidden
          </span>
          <button
            type="button"
            onClick={() => restoreFiltered(filteredExcludedIds)}
            className="text-xs text-accent hover:underline cursor-pointer"
          >
            Restore all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2.5 text-left text-xs font-medium text-text-secondary whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row) => {
              const isExcluded = excludedIds.has(row.original.id)
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/50 transition-opacity duration-150',
                    'hover:bg-bg-elevated/40',
                    isExcluded && 'opacity-40 bg-bg-base/50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-3 py-2 overflow-hidden"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-text-muted">
            {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, totalRows)} of {totalRows}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className={cn(
                'inline-flex items-center justify-center h-7 w-7 rounded-md',
                'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
                'transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer',
              )}
            >
              <ChevronLeft size={14} />
            </button>

            <PageNumbers
              currentPage={currentPage}
              pageCount={pageCount}
              onPageChange={(p) => table.setPageIndex(p)}
            />

            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className={cn(
                'inline-flex items-center justify-center h-7 w-7 rounded-md',
                'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
                'transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer',
              )}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page number buttons ──────────────────────────────────────────────────────

function PageNumbers({
  currentPage,
  pageCount,
  onPageChange,
}: {
  currentPage: number
  pageCount: number
  onPageChange: (page: number) => void
}) {
  // Build visible page list: first, window around current, last — with ellipsis
  const pages: (number | '...')[] = []

  if (pageCount <= 7) {
    for (let i = 0; i < pageCount; i++) pages.push(i)
  } else {
    pages.push(0)
    if (currentPage > 2) pages.push('...')
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(pageCount - 2, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < pageCount - 3) pages.push('...')
    pages.push(pageCount - 1)
  }

  return (
    <>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs text-text-muted select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={cn(
              'inline-flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-md',
              'text-xs transition-colors cursor-pointer',
              p === currentPage
                ? 'bg-accent text-white font-medium'
                : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
            )}
          >
            {p + 1}
          </button>
        ),
      )}
    </>
  )
}
