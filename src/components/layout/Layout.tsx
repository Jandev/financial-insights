import { Outlet } from 'react-router-dom'
import { WindowChrome } from './WindowChrome'
import { Sidebar } from './Sidebar'
import { useTransactionLoader } from '@/hooks/useTransactionLoader'

/**
 * Root application shell.
 * WindowChrome (fixed top) + Sidebar (fixed left) + scrollable main content.
 *
 * All page routes render into <Outlet />.
 * CSV loading is triggered here so it starts immediately on first render,
 * regardless of which page the user lands on.
 */
export function Layout() {
  useTransactionLoader()

  return (
    <div className="min-h-dvh bg-bg-base">
      <WindowChrome />
      <Sidebar />

      {/* Main content area — offset by chrome height (48px) and sidebar width (220px) */}
      <main className="ml-[220px] pt-12 min-h-dvh">
        <div className="min-h-full bg-bg-base p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
