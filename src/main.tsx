import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useStore } from '@/store'

// Expose store in development for E2E test injection (Playwright)
if (import.meta.env.DEV) {
  ;(window as Window & { __store__?: typeof useStore }).__store__ = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
