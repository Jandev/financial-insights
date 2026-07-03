import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { DashboardPage } from '@/pages/DashboardPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { MonthlyPage } from '@/pages/MonthlyPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { AiAdvisorPage } from '@/pages/AiAdvisorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="monthly" element={<MonthlyPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="ai-advisor" element={<AiAdvisorPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
