import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSSEStream } from '@/lib/sse'

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('readSSEStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses data events across chunk boundaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          streamFromChunks([
            'data: {"type":"token","text":"Hel',
            'lo"}\n\n',
            'data: {"type":"token","text":" world"}\n\n',
          ]),
          { status: 200 },
        ),
      ),
    )

    const texts: string[] = []
    let done = false

    await readSSEStream<{ type: string; text?: string }>(
      '/api/test',
      {},
      {
        onData: (payload) => {
          if (payload.type === 'token' && payload.text) {
            texts.push(payload.text)
          }
        },
        onDone: () => {
          done = true
        },
      },
    )

    expect(texts).toEqual(['Hello', ' world'])
    expect(done).toBe(true)
  })

  it('throws on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    await expect(
      readSSEStream('/api/test', {}, { onData: () => undefined }),
    ).rejects.toThrow('SSE request failed: 500')
  })

  it('calls onError then rethrows when payload is invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(streamFromChunks(['data: {bad-json}\n\n']), { status: 200 }),
      ),
    )

    const onError = vi.fn()

    await expect(
      readSSEStream('/api/test', {}, { onData: () => undefined, onError }),
    ).rejects.toThrow()

    expect(onError).toHaveBeenCalledTimes(1)
  })
})
