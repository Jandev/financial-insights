/**
 * LLM provider abstraction — issue #17.
 *
 * Auto-selects Azure OpenAI (preferred when AZURE_OPENAI_ENDPOINT +
 * AZURE_OPENAI_API_KEY are set) or falls back to OpenAI-direct.
 * Returns null when no credentials are configured so callers can
 * degrade gracefully instead of crashing.
 */

import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai'

export type LLMProvider = 'azure_openai' | 'openai'
export type LLMClient = AzureChatOpenAI | ChatOpenAI

export interface LLMInfo {
  provider: LLMProvider
  model: string
}

interface LLMProviderDefinition {
  provider: LLMProvider
  isConfigured: () => boolean
  create: (options: { temperature: number; maxTokens: number }) => LLMClient
  getModel: () => string
}

function getRuntimeOptions(): { temperature: number; maxTokens: number } {
  return {
    temperature: parseFloat(process.env.LLM_TEMPERATURE ?? '0.1'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? '4096', 10),
  }
}

const providers: LLMProviderDefinition[] = [
  {
    provider: 'azure_openai',
    isConfigured: () => Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY),
    getModel: () => process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
    create: ({ temperature, maxTokens }) =>
      new AzureChatOpenAI({
        azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
        temperature,
        maxTokens,
      }),
  },
  {
    provider: 'openai',
    isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
    getModel: () => process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    create: ({ temperature, maxTokens }) =>
      new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        configuration: process.env.OPENAI_BASE_URL
          ? { baseURL: process.env.OPENAI_BASE_URL }
          : undefined,
        temperature,
        maxTokens,
      }),
  },
]

function getConfiguredProvider(): LLMProviderDefinition | null {
  return providers.find((provider) => provider.isConfigured()) ?? null
}

/**
 * Create an LLM client from environment variables.
 * Returns null when no credentials are configured.
 */
export function createLLMClient(): LLMClient | null {
  const provider = getConfiguredProvider()
  if (!provider) return null
  return provider.create(getRuntimeOptions())
}

/**
 * Probe which provider is configured without instantiating the client.
 * Safe to call at any time — no network requests.
 */
export function getLLMInfo(): { available: boolean; info: LLMInfo | null } {
  const provider = getConfiguredProvider()
  if (!provider) return { available: false, info: null }

  return {
    available: true,
    info: {
      provider: provider.provider,
      model: provider.getModel(),
    },
  }
}
