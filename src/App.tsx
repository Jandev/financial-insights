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
import { useStateHydration } from '@/hooks/useStateHydration'
import { ChatSlideIn } from '@/components/ai/ChatSlideIn'

function AppRoutes() {
  // Hydrate Zustand + localStorage from server on mount (issue #22).
  // Falls back silently to localStorage when Express is not available.
  useStateHydration()

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
