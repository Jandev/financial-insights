import { MessageCircle } from 'lucide-react'
import { ChatInterface } from '@/components/ai/ChatInterface'

export function AiAdvisorPage() {
  return (
    <div className="space-y-6 h-[calc(100dvh-48px-3rem)] flex flex-col">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-accent" strokeWidth={1.75} />
        <h1 className="text-2xl font-bold text-text-primary">AI Advisor</h1>
      </div>

      {/* Chat fills remaining vertical space */}
      <div className="flex-1 glass-card overflow-hidden flex flex-col min-h-0">
        <ChatInterface />
      </div>
    </div>
  )
}
