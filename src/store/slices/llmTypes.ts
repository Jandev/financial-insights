export type LLMProvider = 'azure_openai' | 'openai'

export interface AICategoryResult {
  category: string
  confidence: number
  reasoning: string
  source: 'llm' | 'rule'
}

export type Severity = 'info' | 'warning' | 'alert'

export interface AnomalyFinding {
  transactionId: string
  severity: Severity
  title: string
  explanation: string
  actionSuggestion?: string
  falsePositiveLikelihood: number
  detectorType: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { tool: string; summary: string }[]
  createdAt: string
}
