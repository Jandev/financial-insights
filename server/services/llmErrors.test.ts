import { describe, expect, it } from 'vitest'
import { normalizeLLMError } from './llmErrors.js'

describe('normalizeLLMError', () => {
  it('maps chat endpoint mismatches to actionable mode guidance', () => {
    const normalized = normalizeLLMError(
      new Error('This model is only available on /responses. Endpoint /chat/completions is not supported.'),
      {
        feature: 'chat',
        llm: { provider: 'openai', model: 'gpt-5.3-codex', mode: 'chat' },
      },
    )

    expect(normalized.code).toBe('llm_mode_mismatch')
    expect(normalized.status).toBe(400)
    expect(normalized.isCompatibilityError).toBe(true)
    expect(normalized.hint).toContain('OPENAI_API_MODE')
    expect(normalized.hint).toContain('responses')
  })

  it('maps API version errors for Azure to explicit version guidance', () => {
    const normalized = normalizeLLMError(
      new Error('Unsupported API version 2024-10-01 for this deployment.'),
      {
        feature: 'insights',
        llm: { provider: 'azure_openai', model: 'gpt-5.4', mode: 'responses' },
      },
    )

    expect(normalized.code).toBe('llm_api_version_mismatch')
    expect(normalized.status).toBe(400)
    expect(normalized.isCompatibilityError).toBe(true)
    expect(normalized.hint).toContain('AZURE_OPENAI_API_VERSION')
  })

  it('maps model/deployment-not-found errors to model guidance', () => {
    const normalized = normalizeLLMError(
      new Error('The specified deployment was not found.'),
      {
        feature: 'categorize',
        llm: { provider: 'azure_openai', model: 'missing-model', mode: 'chat' },
      },
    )

    expect(normalized.code).toBe('llm_model_not_found')
    expect(normalized.status).toBe(400)
    expect(normalized.isCompatibilityError).toBe(true)
    expect(normalized.hint).toContain('AZURE_OPENAI_DEPLOYMENT')
  })

  it('falls back to generic request failures for unknown errors', () => {
    const normalized = normalizeLLMError(new Error('socket hang up'), {
      feature: 'analyze',
      llm: { provider: 'openai', model: 'gpt-4o-mini', mode: 'chat' },
    })

    expect(normalized.code).toBe('llm_request_failed')
    expect(normalized.status).toBe(500)
    expect(normalized.isCompatibilityError).toBe(false)
    expect(normalized.hint).toContain('OPENAI_MODEL')
  })
})
