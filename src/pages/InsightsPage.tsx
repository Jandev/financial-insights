import { AlertTriangle } from 'lucide-react'
import { AnomalyAlerts } from '@/components/ai/AnomalyAlerts'

export function InsightsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-accent" strokeWidth={1.75} />
        <h1 className="text-2xl font-bold text-text-primary">Insights</h1>
      </div>

      {/* Anomaly alerts — LLM-powered unusual transaction detection */}
      <AnomalyAlerts limit={10} />
    </div>
  )
}
