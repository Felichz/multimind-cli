/**
 * Provider-agnostic interface for the LLM calls the thinking pipeline makes.
 *
 * The CLI ships with one default implementation (`openai-compat.ts`) that
 * talks to any service exposing the OpenAI-compatible chat completions API
 * over plain HTTP. The implementation uses raw `fetch` — no proprietary
 * SDK dependency.
 *
 * Custom providers (streaming, Anthropic direct, local models with a
 * different wire format) implement this interface and are passed to
 * `runThinkingPipeline(input, provider)`. The CLI itself does not care
 * which one you use.
 *
 * The interface is intentionally small: only what the workers need.
 */

export type LLMMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

export type LLMRequest = {
  system?: string
  messages: LLMMessage[]
  model?: { providerID: string; modelID: string }
  tools?: Record<string, boolean>
  maxTokens?: number
  temperature?: number
}

export type LLMResponse = {
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  finishReason: "stop" | "length" | "tool_use" | "error"
  latencyMs: number
}

export type LLMError = {
  kind: "timeout" | "rate_limit" | "server_error" | "invalid_request" | "unknown"
  message: string
  retriable: boolean
}

export interface LLMProvider {
  /** A short identifier for logs and config (e.g. "openai-compat", "anthropic-direct"). */
  readonly name: string

  /** Run a single completion. Throws on unrecoverable error. Returns the full response. */
  complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>
}
