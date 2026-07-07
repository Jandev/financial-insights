import { useEffect, useRef } from 'react'

const HYDRATION_EVENT = 'state-hydrated'

export function useStorageHydration<T>(reader: () => T, setter: (value: T) => void): void {
  const readerRef = useRef(reader)
  const setterRef = useRef(setter)

  readerRef.current = reader
  setterRef.current = setter

  useEffect(() => {
    const handler = () => {
      setterRef.current(readerRef.current())
    }

    window.addEventListener(HYDRATION_EVENT, handler)
    return () => window.removeEventListener(HYDRATION_EVENT, handler)
  }, [])
}
