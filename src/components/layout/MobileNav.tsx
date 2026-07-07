import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Calendar,
  Tag,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bottom navigation bar shown only on mobile (hidden on sm+ where the sidebar is visible).
 * Displays the five primary navigation destinations in a compact icon+label strip.
 */

const mobileNavItems = [
  { to: '/',             label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', Icon: ArrowLeftRight   },
  { to: '/monthly',      label: 'Monthly',      Icon: Calendar         },
  { to: '/categories',   label: 'Categories',   Icon: Tag              },
  { to: '/ai-advisor',   label: 'AI',           Icon: Sparkles         },
] as const

export function MobileNav() {
  return (
    <nav className="glass-chrome fixed bottom-0 inset-x-0 z-40 flex sm:hidden h-16 border-t border-border">
      {mobileNavItems.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors',
              isActive
                ? 'text-accent'
                : 'text-text-muted hover:text-text-secondary',
            )
          }
        >
          <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
