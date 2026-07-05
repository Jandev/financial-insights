/**
 * Global chat slide-in panel — issue #21.
 *
 * Fixed trigger button in the bottom-right corner.
 * Opens a slide-in panel that overlays the current page.
 * Shares the same ChatInterface and Zustand state as AiAdvisorPage.
 */

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, X } from 'lucide-react'
import { ChatInterface } from './ChatInterface'
import { cn } from '@/lib/utils'

export function ChatSlideIn() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // Full-page chat is already shown on /ai-advisor — no floating button needed
  if (pathname === '/ai-advisor') return null

  return (
    <>
      {/* Trigger button — bottom right, above toaster */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="AI Advisor"
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-accent text-white',
          'hover:opacity-90 active:opacity-80 transition-opacity',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        )}
      >
        {open
          ? <X className="h-5 w-5" strokeWidth={2} />
          : <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
        }
      </button>

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed bottom-0 right-0 z-40',
          'w-[380px] h-[600px] max-h-[80dvh]',
          'glass-card rounded-tl-2xl rounded-bl-none rounded-br-none rounded-tr-none',
          'border-l border-t border-border',
          'flex flex-col shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-accent" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-text-primary">AI Advisor</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-text-muted hover:text-text-secondary transition-colors p-0.5"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 min-h-0">
          <ChatInterface />
        </div>
      </div>
    </>
  )
}
