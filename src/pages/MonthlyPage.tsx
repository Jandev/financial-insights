import { MonthlyPageContent } from '@/components/monthly/MonthlyPageContent'
import { useMonthlyBreakdown } from '@/hooks/useMonthlyBreakdown'

export function MonthlyPage() {
  const breakdown = useMonthlyBreakdown()
  return <MonthlyPageContent data={breakdown} />
}
