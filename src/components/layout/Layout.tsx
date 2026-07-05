import { Outlet } from 'react-router-dom'
import { WindowChrome } from './WindowChrome'
import { Sidebar } from './Sidebar'
import { useTransactionLoader } from '@/hooks/useTransactionLoader'
import { useTransactionSync } from '@/hooks/useTransactionSync'

/**
 * Root application shell.
 * WindowChrome (fixed top) + Sidebar (fixed left) + scrollable main content.
 *
 * All page routes render into <Outlet />.
 * CSV loading is triggered here so it starts immediately on first render,
 * regardless of which page the user lands on.
 * Transaction sync (issue #17) pushes loaded data to the LLM server store.
 */
export function Layout() {
  useTransactionLoader()
  useTransactionSync()

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
