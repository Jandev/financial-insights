import type { LLMInfo } from './llm.js'

type LLMFeature = 'chat' | 'categorize' | 'analyze' | 'insights'

export interface LLMErrorContext {
  llm: LLMInfo | null
  feature: LLMFeature
}

export interface NormalizedLLMError {
  status: number
  code: 'llm_mode_mismatch' | 'llm_api_version_mismatch' | 'llm_model_not_found' | 'llm_request_failed'
  message: string
  hint: string
  details: string
  isCompatibilityError: boolean
}

export class LLMRequestError extends Error {
  readonly normalized: NormalizedLLMError

  constructor(normalized: NormalizedLLMError) {
    super(normalized.message)
    this.name = 'LLMRequestError'
    this.normalized = normalized
  }
}

function envVars(info: LLMInfo | null): { modeVar: string; modelVar: string; versionVar?: string } {
  if (info?.provider === 'azure_openai') {
    return {
      modeVar: 'AZURE_OPENAI_API_MODE',
      modelVar: 'AZURE_OPENAI_DEPLOYMENT',
      versionVar: 'AZURE_OPENAI_API_VERSION',
    }
  }
  return {
    modeVar: 'OPENAI_API_MODE',
    modelVar: 'OPENAI_MODEL',
  }
}

function detailString(err: unknown): string {
  if (err instanceof LLMRequestError) return err.normalized.details
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}

export function normalizeLLMError(err: unknown, context: LLMErrorContext): NormalizedLLMError {
  if (err instanceof LLMRequestError) return err.normalized

  const details = detailString(err)
  const lower = details.toLowerCase()
  const vars = envVars(context.llm)
  const providerLabel = context.llm?.provider === 'azure_openai' ? 'Azure OpenAI' : 'OpenAI'
  const modelLabel = context.llm?.model ?? 'the configured model'
  const modeLabel = context.llm?.mode ?? 'chat'

  const chatEndpointMismatch =
    lower.includes('/chat/completions') &&
    (lower.includes('responses') || lower.includes('reasoning'))
  if (chatEndpointMismatch) {
    return {
      status: 400,
      code: 'llm_mode_mismatch',
      message: `${providerLabel} rejected ${modelLabel} in chat mode.`,
      hint: `Set ${vars.modeVar}=responses for this model (or switch to a chat-compatible model). Current mode: ${modeLabel}.`,
      details,
      isCompatibilityError: true,
    }
  }

  const responsesEndpointMismatch =
    lower.includes('/responses') &&
    (lower.includes('chat') || lower.includes('chat.completions') || lower.includes('chat completion'))
  if (responsesEndpointMismatch) {
    return {
      status: 400,
      code: 'llm_mode_mismatch',
      message: `${providerLabel} rejected ${modelLabel} in responses mode.`,
      hint: `Set ${vars.modeVar}=chat for this model (or switch to a responses-compatible model). Current mode: ${modeLabel}.`,
      details,
      isCompatibilityError: true,
    }
  }

  if (
    lower.includes('api version') &&
    (lower.includes('unsupported') || lower.includes('not supported') || lower.includes('invalid'))
  ) {
    return {
      status: 400,
      code: 'llm_api_version_mismatch',
      message: `${providerLabel} API version is incompatible with ${modelLabel}.`,
      hint: vars.versionVar
        ? `Update ${vars.versionVar} and verify deployment compatibility for ${vars.modelVar}.`
        : `Verify provider API version support for ${vars.modelVar}.`,
      details,
      isCompatibilityError: true,
    }
  }

  if (
    (lower.includes('deployment') || lower.includes('model')) &&
    (lower.includes('not found') || lower.includes('does not exist') || lower.includes('unknown model'))
  ) {
    return {
      status: 400,
      code: 'llm_model_not_found',
      message: `${providerLabel} could not find ${modelLabel}.`,
      hint: `Check ${vars.modelVar} and ensure the deployment/model exists for the selected provider and mode (${modeLabel}).`,
      details,
      isCompatibilityError: true,
    }
  }

  return {
    status: 500,
    code: 'llm_request_failed',
    message: `Failed to complete ${context.feature} request.`,
    hint: `Check provider credentials, ${vars.modelVar}, and ${vars.modeVar} configuration.`,
    details,
    isCompatibilityError: false,
  }
}

export function asLLMRequestError(err: unknown, context: LLMErrorContext): LLMRequestError {
  return new LLMRequestError(normalizeLLMError(err, context))
}
