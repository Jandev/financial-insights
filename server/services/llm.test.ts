import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { AzureChatOpenAIMock, ChatOpenAIMock } = vi.hoisted(() => ({
  AzureChatOpenAIMock: vi.fn(
    class AzureMock {
      provider = 'azure'
      options: unknown
      constructor(options: unknown) {
        this.options = options
      }
    },
  ),
  ChatOpenAIMock: vi.fn(
    class OpenAIMock {
      provider = 'openai'
      options: unknown
      constructor(options: unknown) {
        this.options = options
      }
    },
  ),
}))

vi.mock('@langchain/openai', () => ({
  AzureChatOpenAI: AzureChatOpenAIMock,
  ChatOpenAI: ChatOpenAIMock,
}))

import { createLLMClient, getLLMInfo } from './llm.js'

const ORIGINAL_ENV = { ...process.env }
const LLM_ENV_KEYS = [
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_MODE',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_API_MODE',
] as const

describe('createLLMClient', () => {
  beforeEach(() => {
    for (const key of LLM_ENV_KEYS) {
      delete process.env[key]
    }
    vi.clearAllMocks()
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('uses Azure provider in chat mode by default', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'secret'
    process.env.AZURE_OPENAI_DEPLOYMENT = 'gpt-4o-mini'

    const client = createLLMClient() as { options: { useResponsesApi: boolean } } | null

    expect(client).not.toBeNull()
    expect(AzureChatOpenAIMock).toHaveBeenCalledTimes(1)
    expect(ChatOpenAIMock).not.toHaveBeenCalled()
    expect(client?.options.useResponsesApi).toBe(false)
    expect(getLLMInfo()).toEqual({
      available: true,
      info: {
        provider: 'azure_openai',
        model: 'gpt-4o-mini',
        mode: 'chat',
      },
    })
  })

  it('uses OpenAI provider responses mode when configured', () => {
    process.env.OPENAI_API_KEY = 'secret'
    process.env.OPENAI_MODEL = 'gpt-5.3-codex'
    process.env.OPENAI_API_MODE = 'responses'

    const client = createLLMClient() as { options: { useResponsesApi: boolean } } | null

    expect(client).not.toBeNull()
    expect(ChatOpenAIMock).toHaveBeenCalledTimes(1)
    expect(client?.options.useResponsesApi).toBe(true)
    expect(getLLMInfo()).toEqual({
      available: true,
      info: {
        provider: 'openai',
        model: 'gpt-5.3-codex',
        mode: 'responses',
      },
    })
  })

  it('falls back to chat mode when mode is invalid', () => {
    process.env.OPENAI_API_KEY = 'secret'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    process.env.OPENAI_API_MODE = 'invalid-mode'

    const client = createLLMClient() as { options: { useResponsesApi: boolean } } | null

    expect(client).not.toBeNull()
    expect(client?.options.useResponsesApi).toBe(false)
    expect(getLLMInfo().info?.mode).toBe('chat')
  })

  it('prefers Azure over OpenAI when both are configured', () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://example.cognitiveservices.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'secret'
    process.env.AZURE_OPENAI_DEPLOYMENT = 'azure-model'
    process.env.AZURE_OPENAI_API_MODE = 'chat'
    process.env.OPENAI_API_KEY = 'secret'
    process.env.OPENAI_MODEL = 'openai-model'
    process.env.OPENAI_API_MODE = 'responses'

    createLLMClient()

    expect(AzureChatOpenAIMock).toHaveBeenCalledTimes(1)
    expect(ChatOpenAIMock).not.toHaveBeenCalled()
    expect(getLLMInfo().info?.provider).toBe('azure_openai')
  })
})
