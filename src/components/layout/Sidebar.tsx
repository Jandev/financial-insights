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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  return (
    <aside className="glass-sidebar fixed bottom-0 left-0 top-12 z-40 flex w-[220px] flex-col">
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

      {/* Separator */}
      <div className="h-px bg-border" />

      {/* User footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <CircleUser className="h-5 w-5 text-text-secondary" strokeWidth={1.75} />
          <span className="text-xs text-text-secondary">Jan de Vries</span>
        </div>
        <Settings className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.75} />
      </div>
    </aside>
  )
}
