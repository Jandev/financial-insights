export interface SSEHandlers<T> {
  onData: (payload: T) => void
  onDone?: () => void
  onError?: (err: unknown) => void
}

function handleLine<T>(line: string, onData: (payload: T) => void): void {
  if (!line.startsWith('data:')) return

  const raw = line.slice(5).trimStart()
  if (!raw) return

  onData(JSON.parse(raw) as T)
}

export async function readSSEStream<T>(
  url: string,
  options: RequestInit,
  handlers: SSEHandlers<T>,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    ...options,
    signal: signal ?? options.signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        handleLine(line, handlers.onData)
      }
    }

    if (buffer.length > 0) {
      handleLine(buffer, handlers.onData)
    }

    handlers.onDone?.()
  } catch (err) {
    handlers.onError?.(err)
    throw err
  }
}
