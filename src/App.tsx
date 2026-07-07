import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Layout } from '@/components/layout/Layout'
import { DashboardPage } from '@/pages/DashboardPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { MonthlyPage } from '@/pages/MonthlyPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { AiAdvisorPage } from '@/pages/AiAdvisorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useStateSync } from '@/hooks/useStateHydration'
import { ChatSlideIn } from '@/components/ai/ChatSlideIn'

function AppRoutes() {
  // Sync Zustand from server on mount and every 30s (issue #70).
  useStateSync()

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="monthly" element={<MonthlyPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="ai-advisor" element={<AiAdvisorPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <ChatSlideIn />
      <Toaster position="bottom-right" richColors closeButton />
    </BrowserRouter>
  )
}
