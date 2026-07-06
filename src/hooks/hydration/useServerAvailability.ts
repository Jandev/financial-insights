import { useCallback } from 'react'
import { useStore } from '@/store'
import { setServerAvailable } from '@/lib/serverState'

export function useServerAvailability() {
  const setServerStateAvailable = useStore((s) => s.setServerStateAvailable)

  return useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/health')
      const available = response.ok
      setServerAvailable(available)
      setServerStateAvailable(available)
      return available
    } catch {
      setServerAvailable(false)
      setServerStateAvailable(false)
      return false
    }
  }, [setServerStateAvailable])
}
