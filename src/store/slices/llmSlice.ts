/**
 * Zustand LLM slice — issue #17.
 *
 * Holds all AI-related state: availability flag, AI-assigned categories,
 * anomaly findings, insight cache, and chat session.
 *
 * AI categories are stored as an overlay — they never mutate Transaction.category.
 * The display layer merges: aiCategories[tx.id]?.category ?? tx.category.
 *
 * Dismissed finding IDs and insight cache are persisted to StateStore (server)
 * or localStorage (fallback). Chat state is session-only (sessionStorage).
 */

import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'
import { debouncePut } from '@/lib/serverState'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMProvider = 'azure_openai' | 'openai'

export interface AICategoryResult {
  category: string
  confidence: number
  reasoning: string
  /** 'llm' when assigned by AI, 'rule' when rule-based fallback was used */
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
  /** Stage 1 detector that flagged this */
  detectorType: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Tool calls made during this message (shown as inline chips) */
  toolCalls?: { tool: string; summary: string }[]
  createdAt: string // ISO string
}

// ─── Slice ────────────────────────────────────────────────────────────────────

export interface LLMSlice {
  // ── #17 — availability ─────────────────────────────────────────────────────
  llmAvailable: boolean
  llmProvider: LLMProvider | null
  llmModel: string | null
  checkLLMStatus: () => Promise<void>
  /** Directly apply a pre-fetched LLM status response — avoids double fetch. */
  setLLMStatusDirect: (data: { available: boolean; provider: LLMProvider | null; model: string | null }) => void

  // ── #18 — AI categories (overlay on Transaction.category) ──────────────────
  aiCategories: Record<string, AICategoryResult>
  setAiCategories: (categories: Record<string, AICategoryResult>) => void
  clearAiCategories: () => void

  // ── #19 — anomaly findings ──────────────────────────────────────────────────
  findings: AnomalyFinding[]
  dismissedFindingIds: Set<string>
  setFindings: (findings: AnomalyFinding[]) => void
  dismissFinding: (id: string) => void
  restoreFinding: (id: string) => void
  /** Bulk-set dismissed IDs (union with current) — used by hydration. */
  setDismissedFindingIds: (ids: string[]) => void

  // ── #20 — insight cache (period → rendered text) ────────────────────────────
  insightCache: Record<string, string>
  setInsight: (period: string, text: string) => void
  clearInsight: (period: string) => void
  /** Bulk-restore insight cache from server — server wins only for missing keys. */
  bulkSetInsights: (insights: Record<string, string>) => void

  // ── #21 — chat ──────────────────────────────────────────────────────────────
  chatThreadId: string | null
  chatMessages: ChatMessage[]
  setChatThreadId: (id: string | null) => void
  addChatMessage: (msg: ChatMessage) => void
  updateLastAssistantMessage: (appendText: string, toolCalls?: ChatMessage['toolCalls']) => void
  clearChat: () => void
}

export const createLLMSlice: StateCreator<StoreState, [], [], LLMSlice> = (set, get) => ({
  // ── availability ─────────────────────────────────────────────────────────────
  llmAvailable: false,
  llmProvider: null,
  llmModel: null,

  checkLLMStatus: async () => {
    try {
      const res = await fetch('/api/llm/status')
      if (!res.ok) {
        set({ llmAvailable: false, llmProvider: null, llmModel: null })
        return
      }
      const data = (await res.json()) as {
        available: boolean
        provider: LLMProvider | null
        model: string | null
      }
      set({
        llmAvailable: data.available,
        llmProvider: data.provider,
        llmModel: data.model,
      })
    } catch {
      set({ llmAvailable: false, llmProvider: null, llmModel: null })
    }
  },

  setLLMStatusDirect: (data) =>
    set({ llmAvailable: data.available, llmProvider: data.provider, llmModel: data.model }),

  // ── AI categories ────────────────────────────────────────────────────────────
  aiCategories: {},

  setAiCategories: (categories) => set({ aiCategories: categories }),

  clearAiCategories: () => set({ aiCategories: {} }),

  // ── anomaly findings ─────────────────────────────────────────────────────────
  findings: [],
  dismissedFindingIds: new Set(),

  setFindings: (findings) => set({ findings }),

  dismissFinding: (id) => {
    set((s) => ({ dismissedFindingIds: new Set([...s.dismissedFindingIds, id]) }))
    debouncePut('dismissed', { ids: [...get().dismissedFindingIds] })
  },

  restoreFinding: (id) => {
    set((s) => {
      const next = new Set(s.dismissedFindingIds)
      next.delete(id)
      return { dismissedFindingIds: next }
    })
    debouncePut('dismissed', { ids: [...get().dismissedFindingIds] })
  },

  setDismissedFindingIds: (ids) =>
    set((s) => ({ dismissedFindingIds: new Set([...s.dismissedFindingIds, ...ids]) })),

  // ── insight cache ─────────────────────────────────────────────────────────────
  insightCache: {},

  setInsight: (period, text) =>
    set((s) => ({ insightCache: { ...s.insightCache, [period]: text } })),

  clearInsight: (period) =>
    set((s) => {
      const next = { ...s.insightCache }
      delete next[period]
      return { insightCache: next }
    }),

  bulkSetInsights: (insights) =>
    // Local (Zustand) cache wins — spread server data first, then local on top
    set((s) => ({ insightCache: { ...insights, ...s.insightCache } })),

  // ── chat ──────────────────────────────────────────────────────────────────────
  chatThreadId: null,
  chatMessages: [],

  setChatThreadId: (id) => set({ chatThreadId: id }),

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  updateLastAssistantMessage: (appendText, toolCalls) =>
    set((s) => {
      const msgs = [...s.chatMessages]
      const lastIdx = msgs.length - 1
      if (lastIdx < 0 || msgs[lastIdx].role !== 'assistant') return s
      const last = msgs[lastIdx]
      msgs[lastIdx] = {
        ...last,
        content: last.content + appendText,
        toolCalls: toolCalls ?? last.toolCalls,
      }
      return { chatMessages: msgs }
    }),

  clearChat: () => {
    // Also clear sessionStorage thread ID
    const { chatThreadId } = get()
    if (chatThreadId) {
      try {
        sessionStorage.removeItem('llm:chatThreadId')
      } catch {
        // sessionStorage may be unavailable
      }
    }
    set({ chatThreadId: null, chatMessages: [] })
  },
})
