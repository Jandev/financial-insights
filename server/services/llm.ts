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

export interface LLMInfo {
  provider: LLMProvider
  model: string
}

/**
 * Create an LLM client from environment variables.
 * Returns null when no credentials are configured.
 */
export function createLLMClient(): (AzureChatOpenAI | ChatOpenAI) | null {
  const temperature = parseFloat(process.env.LLM_TEMPERATURE ?? '0.1')
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS ?? '4096', 10)

  // Azure OpenAI — takes priority when both endpoint and key are set
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return new AzureChatOpenAI({
      azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
      temperature,
      maxTokens,
    })
  }

  // OpenAI direct
  if (process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      configuration: process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : undefined,
      temperature,
      maxTokens,
    })
  }

  return null
}

/**
 * Probe which provider is configured without instantiating the client.
 * Safe to call at any time — no network requests.
 */
export function getLLMInfo(): { available: boolean; info: LLMInfo | null } {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return {
      available: true,
      info: {
        provider: 'azure_openai',
        model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini',
      },
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      available: true,
      info: {
        provider: 'openai',
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      },
    }
  }

  return { available: false, info: null }
}
