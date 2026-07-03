import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/store/theme'

/**
 * Window chrome bar.
 *
 * Layout:
 *   [App title — centered]   [Theme toggle]
 *
 * Uses .glass-chrome for the frosted-glass surface.
 * Fixed at top, z-50.
 */
export function WindowChrome() {
  const { theme, toggleTheme } = useThemeStore()
  const isDark = theme === 'dark'

  return (
    <header className="glass-chrome fixed inset-x-0 top-0 z-50 flex h-12 items-center px-4">
      {/* App title — absolutely centred regardless of toggle width */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-semibold text-text-secondary select-none">
          Financial Insights
        </span>
      </div>

      {/* Theme toggle — right-aligned */}
      <div className="ml-auto flex items-center">
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={cn(
            'relative flex items-center rounded-[20px] border border-border bg-bg-surface p-[3px] gap-0.5',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          )}
        >
          {/* Sun pill */}
          <span
            className={cn(
              'flex items-center justify-center rounded-[14px] px-2 py-1 transition-all duration-200',
              !isDark ? 'bg-accent-dim' : 'bg-transparent',
            )}
          >
            <Sun
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                !isDark ? 'text-accent' : 'text-text-muted',
              )}
              strokeWidth={2}
            />
          </span>
          {/* Moon pill */}
          <span
            className={cn(
              'flex items-center justify-center rounded-[14px] px-2 py-1 transition-all duration-200',
              isDark ? 'bg-accent-dim' : 'bg-transparent',
            )}
          >
            <Moon
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                isDark ? 'text-accent' : 'text-text-muted',
              )}
              strokeWidth={2}
            />
          </span>
        </button>
      </div>
    </header>
  )
}
