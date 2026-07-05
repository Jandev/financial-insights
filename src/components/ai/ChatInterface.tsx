/**
 * Chat interface — issue #21.
 *
 * Used by both AiAdvisorPage (full-page) and ChatSlideIn (panel).
 * Manages thread ID (sessionStorage), message list, and SSE streaming.
 */

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Bot, User, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { randomUUID } from '@/lib/uuid'
import type { ChatMessage } from '@/store/slices/llmSlice'

const SUGGESTED_QUESTIONS = [
  'Where am I spending the most this month?',
  'How does this month compare to last month?',
  'What were my biggest expenses last month?',
  'Show my savings trend over the last 6 months',
]

export function ChatInterface() {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const chatThreadId = useStore((s) => s.chatThreadId)
  const chatMessages = useStore((s) => s.chatMessages)
  const setChatThreadId = useStore((s) => s.setChatThreadId)
  const addChatMessage = useStore((s) => s.addChatMessage)
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage)
  const clearChat = useStore((s) => s.clearChat)
  const llmAvailable = useStore((s) => s.llmAvailable)
  const serverStateAvailable = useStore((s) => s.serverStateAvailable)
  const setAiCategories = useStore((s) => s.setAiCategories)

  // Restore threadId from sessionStorage on mount
  useEffect(() => {
    if (!chatThreadId) {
      const stored = sessionStorage.getItem('llm:chatThreadId')
      if (stored) setChatThreadId(stored)
    }
  }, [chatThreadId, setChatThreadId])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function sendMessage(text: string) {
    if (!text.trim() || isSending) return

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    setInput('')
    setIsSending(true)

    try {
      // Step 1: POST message → get threadId + messageId
      const postRes = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), threadId: chatThreadId ?? undefined }),
      })

      if (!postRes.ok) throw new Error('Failed to send message')

      const { threadId } = (await postRes.json()) as { threadId: string; messageId: string }

      // Persist threadId
      setChatThreadId(threadId)
      sessionStorage.setItem('llm:chatThreadId', threadId)

      // Add placeholder assistant message for streaming
      const assistantMsg: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        createdAt: new Date().toISOString(),
      }
      addChatMessage(assistantMsg)

      // Step 2: SSE stream the response
      const streamRes = await fetch(`/api/llm/chat/${threadId}/stream`)
      if (!streamRes.ok || !streamRes.body) throw new Error('Failed to connect to stream')

      const reader = streamRes.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6)) as {
            type: string
            text?: string
            tool?: string
            summary?: string
            message?: string
          }

          if (data.type === 'token' && data.text) {
            updateLastAssistantMessage(data.text)
            } else if (data.type === 'tool_call') {
            // Read current state directly — avoids stale closure over chatMessages
            // captured at render time (would drop chips on multi-tool turns).
            const currentMsgs = useStore.getState().chatMessages
            const lastMsg = currentMsgs[currentMsgs.length - 1]
            updateLastAssistantMessage('', [
              ...(lastMsg?.toolCalls ?? []),
              { tool: data.tool ?? '', summary: `Checking ${data.tool}…` },
            ])
          } else if (data.type === 'categories_updated') {
            // Advisor ran runCategorization — re-fetch and merge into store.
            // Merge (not replace) so a period-scoped chat categorization does
            // not wipe out AI categories from a prior full-run via the button.
            fetch('/api/state/categories')
              .then((r) => r.ok ? r.json() : null)
              .then((json: { data?: Record<string, { category: string; confidence: number; reasoning: string; source: string }> } | null) => {
                if (!json) return
                const raw = json.data ?? {}
                const newEntries = Object.fromEntries(
                  Object.entries(raw)
                    .filter(([, v]) => v.source === 'llm')
                    .map(([id, v]) => [id, { category: v.category, confidence: v.confidence, reasoning: v.reasoning, source: 'llm' as const }])
                )
                if (Object.keys(newEntries).length > 0) {
                  const existing = useStore.getState().aiCategories
                  setAiCategories({ ...existing, ...newEntries })
                }
              })
              .catch(() => {/* best-effort */})
          } else if (data.type === 'tool_result') {
            // no-op — summary shown via tool_call chip
          } else if (data.type === 'error') {
            updateLastAssistantMessage(data.message ?? 'An error occurred.')
          }
        }
      }
    } catch (err) {
      console.error('[ChatInterface]', err)
      addChatMessage({
        id: randomUUID(),
        role: 'assistant',
        content: 'Something went wrong. Please check the server is running with `npm run dev:full`.',
        createdAt: new Date().toISOString(),
      })
    } finally {
      setIsSending(false)
    }
  }

  function handleNewConversation() {
    fetch(`/api/llm/chat/${chatThreadId}`, { method: 'DELETE' }).catch(() => {})
    clearChat()
  }

  if (!llmAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <Bot className="h-10 w-10 text-text-muted" strokeWidth={1} />
        <p className="text-sm text-text-secondary font-medium">AI Advisor unavailable</p>
        <p className="text-[12px] text-text-muted max-w-xs">
          {serverStateAvailable ? (
            <>
              Configure AI credentials in{' '}
              <code className="font-mono text-accent">.env</code> to use the conversational advisor.
            </>
          ) : (
            <>
              Start the server with{' '}
              <code className="font-mono text-accent">npm run dev:full</code> to use the conversational advisor.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Bot className="h-10 w-10 text-accent opacity-60" strokeWidth={1} />
            <div>
              <p className="text-sm text-text-secondary font-medium">Ask me about your finances</p>
              <p className="text-[12px] text-text-muted mt-1">I can look up your transactions, categories, and trends.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs mt-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-[12px] text-text-secondary rounded-lg border border-border px-3 py-2 hover:bg-bg-elevated hover:text-accent transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
                  </div>
                )}
                <div className={cn('max-w-[80%] space-y-1.5', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  {/* Tool call chips */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {msg.toolCalls.map((tc, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[10px] text-text-muted bg-bg-elevated border border-border rounded-full px-2 py-0.5"
                        >
                          <Wrench className="h-2.5 w-2.5" strokeWidth={1.75} />
                          {tc.summary}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Message bubble */}
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-accent text-white rounded-tr-sm whitespace-pre-wrap'
                        : 'bg-bg-elevated text-text-primary rounded-tl-sm',
                    )}
                  >
                    {msg.role === 'user' ? (
                      msg.content || <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                    ) : msg.content ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          ol: ({ children }) => <ol className="list-decimal list-outside ml-4 space-y-0.5 my-1">{children}</ol>,
                          ul: ({ children }) => <ul className="list-disc list-outside ml-4 space-y-0.5 my-1">{children}</ul>,
                          li: ({ children }) => <li>{children}</li>,
                          code: ({ children }) => <code className="font-mono text-[12px] bg-bg-base px-1 py-0.5 rounded">{children}</code>,
                          pre: ({ children }) => <pre className="font-mono text-[12px] bg-bg-base p-2 rounded my-1.5 overflow-x-auto">{children}</pre>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.75} />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3 space-y-2">
        {chatMessages.length > 0 && (
          <button
            onClick={handleNewConversation}
            className="text-[11px] text-text-muted hover:text-accent transition-colors w-full text-center"
          >
            New conversation
          </button>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            placeholder="Ask about your finances…"
            disabled={isSending}
            className={cn(
              'flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[13px]',
              'text-text-primary placeholder:text-text-muted outline-none',
              'focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
              'disabled:opacity-50',
            )}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={isSending || !input.trim()}
            className="shrink-0"
          >
            {isSending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
