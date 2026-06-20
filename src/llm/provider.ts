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
 *
 * @packageDocumentation
 */

/** A single message in a chat completion request. */
export type LLMMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

/** A chat completion request, in provider-agnostic form. */
export type LLMRequest = {
  /** Optional system prompt. Prepended to the request as the
   *  first message. */
  system?: string
  /** The conversation. The first message is the oldest, the
   *  last is the most recent. */
  messages: LLMMessage[]
  /** Model override in `provider/model` form. If omitted, the
   *  provider's default model is used. */
  model?: { providerID: string; modelID: string }
  /** Optional tool registry (a map of tool name → enabled). The
   *  default provider passes these to the underlying API as
   *  OpenAI-style `tools`. Most workers do not use tools. */
  tools?: Record<string, boolean>
  /** Cap on output tokens. */
  maxTokens?: number
  /** Sampling temperature. */
  temperature?: number
}

/** A chat completion response, in provider-agnostic form. */
export type LLMResponse = {
  /** The model's text output. */
  content: string
  /** Token usage, as reported by the underlying API. */
  usage: {
    inputTokens: number
    outputTokens: number
  }
  /** Why the model stopped generating. `length` means it hit
   *  the max-tokens cap; `tool_use` means it produced a tool
   *  call; `error` means the API reported an error mid-stream. */
  finishReason: "stop" | "length" | "tool_use" | "error"
  /** Wall-clock time the provider spent on this call. */
  latencyMs: number
}

/**
 * Structured error returned by providers that want to surface
 * retry hints. Not currently used by the pipeline (it just lets
 * errors throw), but reserved for future use.
 */
export type LLMError = {
  kind: "timeout" | "rate_limit" | "server_error" | "invalid_request" | "unknown"
  message: string
  retriable: boolean
}

/**
 * The interface every LLM provider implements.
 *
 * @example
 *   import type { LLMProvider } from "multimind-cli/llm/provider"
 *
 *   class AnthropicDirectProvider implements LLMProvider {
 *     readonly name = "anthropic-direct"
 *     async complete(request: LLMRequest): Promise<LLMResponse> {
 *       // call Anthropic's API directly using the official SDK
 *     }
 *   }
 */
export interface LLMProvider {
  /** A short identifier for logs and config (e.g. "openai-compat", "anthropic-direct"). */
  readonly name: string

  /**
   * Run a single completion. Throws on unrecoverable error.
   * Returns the full response including usage and finish reason.
   *
   * The `signal` is used by the pipeline to enforce a
   * per-worker timeout. Providers should wire it into the
   * underlying HTTP request (e.g. as the `AbortSignal` of a
   * `fetch` call) so a stuck request is cancelled cleanly.
   */
  complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>
}
