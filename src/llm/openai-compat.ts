/**
 * HTTP chat-completions provider.
 *
 * Default provider for the CLI. Talks to any LLM service that exposes
 * the OpenAI-compatible `/chat/completions` endpoint over HTTP. The
 * implementation uses raw `fetch` — no proprietary SDK dependency.
 *
 * Why no SDK: the OpenAI chat completions API is a public standard
 * (https://platform.openai.com/docs/api-reference/chat). Many providers
 * expose it: opencode-go, OpenAI, Anthropic via a proxy, Ollama's
 * OpenAI-compatible mode, LM Studio, vLLM, llama.cpp's server mode,
 * etc. The CLI should be able to talk to any of them without taking
 * on a per-provider SDK dependency.
 *
 * Configuration is via environment variables:
 *   LLM_BASE_URL   — e.g. https://opencode.ai/zen/go/v1
 *   LLM_API_KEY    — bearer token sent in the Authorization header
 *   LLM_MODEL      — defaults to "minimax-m3" if unset
 *
 * OPENCODE_BASE_URL and OPENCODE_API_KEY are also accepted as fallbacks
 * for users who already have them in their environment.
 */

import type { LLMProvider, LLMRequest, LLMResponse } from "./provider"

const DEFAULT_BASE_URL =
  process.env.LLM_BASE_URL ?? process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096/v1"
const DEFAULT_API_KEY = process.env.LLM_API_KEY ?? process.env.OPENCODE_API_KEY ?? ""
const DEFAULT_MODEL = process.env.LLM_MODEL ?? "minimax-m3"
const DEFAULT_TIMEOUT_MS = 120_000

export type OpenAICompatConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
  timeoutMs?: number
}

export class OpenAICompatProvider implements LLMProvider {
  readonly name = "openai-compat"
  private baseUrl: string
  private apiKey: string
  private defaultModel: string
  private timeoutMs: number

  constructor(config: OpenAICompatConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.apiKey = config.apiKey ?? DEFAULT_API_KEY
    this.defaultModel = config.model ?? DEFAULT_MODEL
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    const startedAt = Date.now()

    const messages = []
    if (request.system) messages.push({ role: "system", content: request.system })
    for (const message of request.messages) messages.push({ role: message.role, content: message.content })

    const body = {
      model: request.model?.modelID ?? this.defaultModel,
      messages,
      ...(request.tools ? { tools: mapTools(request.tools) } : {}),
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream: false,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort("provider timeout"), this.timeoutMs)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId)
        throw new Error(signal.reason ? String(signal.reason) : "aborted")
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`openai-compat: HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`)
    }

    const data = (await response.json()) as ChatCompletionResponse
    const choice = data.choices?.[0]
    const content = choice?.message?.content ?? ""
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    return {
      content,
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
      finishReason: choice?.finish_reason === "length" ? "length" : "stop",
      latencyMs: Date.now() - startedAt,
    }
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { role: string; content: string }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

function mapTools(tools: Record<string, boolean>) {
  // The OpenAI-compatible API expects tool definitions, not just booleans.
  // For the multimind harness the worker prompts are self-contained, so
  // the tool flag is informational; we send a minimal placeholder.
  return Object.entries(tools)
    .filter(([, enabled]) => enabled)
    .map(([name]) => ({ type: "function", function: { name, parameters: {} } }))
}
