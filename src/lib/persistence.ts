import { debouncePut } from '@/lib/serverState'

export interface PersistFns<T> {
  persistLocal: (data: T) => void
  persistAll: (data: T) => void
}

export function createPersistFns<T>(
  storageKey: string,
  apiPath: string,
  apiField?: string,
): PersistFns<T> {
  const persistLocal = (data: T): void => {
    localStorage.setItem(storageKey, JSON.stringify(data))
  }

  const persistAll = (data: T): void => {
    persistLocal(data)

    if (apiField) {
      debouncePut(apiPath, { [apiField]: data })
      return
    }

    debouncePut(apiPath, data)
  }

  return { persistLocal, persistAll }
}
