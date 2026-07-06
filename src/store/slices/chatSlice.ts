import type { StateCreator } from 'zustand'
import type { StoreState } from '../useStore'
import type { ChatMessage } from './llmTypes'

export interface ChatSlice {
  chatThreadId: string | null
  chatMessages: ChatMessage[]
  setChatThreadId: (id: string | null) => void
  addChatMessage: (msg: ChatMessage) => void
  updateLastAssistantMessage: (appendText: string, toolCalls?: ChatMessage['toolCalls']) => void
  clearChat: () => void
}

export const createChatSlice: StateCreator<StoreState, [], [], ChatSlice> = (set, get) => ({
  chatThreadId: null,
  chatMessages: [],

  setChatThreadId: (id) => set({ chatThreadId: id }),

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  updateLastAssistantMessage: (appendText, toolCalls) =>
    set((s) => {
      const messages = [...s.chatMessages]
      const lastIndex = messages.length - 1
      if (lastIndex < 0 || messages[lastIndex].role !== 'assistant') return s

      const lastMessage = messages[lastIndex]
      messages[lastIndex] = {
        ...lastMessage,
        content: lastMessage.content + appendText,
        toolCalls: toolCalls ?? lastMessage.toolCalls,
      }

      return { chatMessages: messages }
    }),

  clearChat: () => {
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
