import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  LayoutDashboard,
  ArrowLeftRight,
  Calendar,
  Tag,
  ChartColumn,
  Sparkles,
  CircleUser,
  Settings,
  Bug,
  ChevronDown,
  ChevronRight,
  Cloud,
  HardDrive,
} from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { useStore } from '@/store'

const navItems = [
  { to: '/',              label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/transactions',  label: 'Transactions', Icon: ArrowLeftRight   },
  { to: '/monthly',       label: 'Monthly',      Icon: Calendar         },
  { to: '/categories',    label: 'Categories',   Icon: Tag              },
  { to: '/insights',      label: 'Insights',     Icon: ChartColumn      },
  { to: '/ai-advisor',    label: 'AI Advisor',   Icon: Sparkles         },
] as const

/**
 * Frosted-glass sidebar navigation.
 * Fixed left, below the WindowChrome (top offset = h-12 = 48px).
 *
 * Uses .glass-sidebar for the translucent surface.
 * Width: 220px (matches design spec).
 */
export function Sidebar() {
  const [debugOpen, setDebugOpen] = useState(false)
  const { fileLog, stateLastSynced } = useStore()

  return (
    <aside className="glass-sidebar fixed bottom-0 left-0 top-12 z-40 hidden sm:flex w-[220px] flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-5">
        <Activity className="h-5 w-5 text-accent" strokeWidth={2} />
        <span className="text-sm font-bold text-text-primary">FinInsights</span>
      </div>

      {/* Separator */}
      <div className="h-px bg-border mx-0" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2',
                    'text-[13px] transition-colors duration-150',
                    isActive
                      ? 'bg-accent-dim text-accent font-medium'
                      : 'text-text-secondary hover:bg-bg-elevated font-normal',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Debug panel */}
      <div className="h-px bg-border" />
      <div className="px-2 py-1.5">
        {/* Toggle header */}
        <button
          onClick={() => setDebugOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-2 rounded-[8px] px-3 py-2',
            'text-[12px] text-text-muted transition-colors duration-150 hover:bg-bg-elevated',
            debugOpen && 'text-text-secondary',
          )}
        >
          <Bug className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">
            Debug
            {fileLog.length > 0 && (
              <span className="ml-1 text-text-muted">({fileLog.length})</span>
            )}
          </span>
          {debugOpen
            ? <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2} />
            : <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2} />}
        </button>

        {/* File log list */}
        {debugOpen && (
          <ul className="mt-1 max-h-48 overflow-y-auto space-y-px pb-1">
            {fileLog.length === 0 ? (
              <li className="px-3 py-1.5 text-[11px] text-text-muted italic">
                No files loaded yet
              </li>
            ) : (
              fileLog.map((entry, i) => (
                <li
                  key={i}
                  className="rounded-[6px] px-3 py-1.5 hover:bg-bg-elevated"
                >
                  {/* Filename — strip long prefix, keep month part */}
                  <p
                    className="truncate font-mono text-[10px] text-text-primary"
                    title={entry.filename}
                  >
                    {entry.filename}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {entry.rowCount} rows · {formatTime(entry.loadedAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* Footer: storage indicator + user + settings link */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Storage mode indicator */}
        <div className="flex items-center gap-1.5">
          {stateLastSynced ? (
            <>
              <Cloud className="h-3 w-3 shrink-0 text-green-500" strokeWidth={1.75} />
              <span className="text-[10px] text-text-muted">Server state</span>
            </>
          ) : (
            <>
              <HardDrive className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={1.75} />
              <span className="text-[10px] text-text-muted">Syncing…</span>
            </>
          )}
        </div>

        {/* User row + settings link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleUser className="h-5 w-5 text-text-secondary" strokeWidth={1.75} />
            <span className="text-xs text-text-secondary">Jan de Vries</span>
          </div>
          <NavLink
            to="/settings"
            title="Settings"
            className={({ isActive }) =>
              cn(
                'rounded-[6px] p-1 transition-colors',
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:bg-bg-elevated hover:text-text-secondary',
              )
            }
          >
            <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
          </NavLink>
        </div>
      </div>
    </aside>
  )
}
