import { Outlet } from 'react-router-dom'
import { WindowChrome } from './WindowChrome'
import { Sidebar } from './Sidebar'

/**
 * Root application shell.
 * WindowChrome (fixed top) + Sidebar (fixed left) + scrollable main content.
 *
 * All page routes render into <Outlet />.
 */
export function Layout() {
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
