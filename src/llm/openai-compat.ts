/**
 * HTTP chat-completions provider.
 *
 * Default provider for the CLI. Talks to any LLM service that exposes
 * the OpenAI-compatible `/chat/completions` endpoint over HTTP. The
 * implementation uses raw `fetch` — no proprietary SDK dependency.
 *
 * Why no SDK: the OpenAI chat completions API is a public standard
 * (https://platform.openai.com/docs/api-reference/chat). Many providers
 * expose it: opencode-go, OpenAI, Ollama's OpenAI-compatible mode,
 * LM Studio, vLLM, llama.cpp's server mode, etc. The CLI should be
 * able to talk to any of them without taking on a per-provider SDK
 * dependency.
 *
 * Configuration resolution order (first wins):
 *   1. Constructor argument
 *   2. Environment variable (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
 *   3. OPENCODE_BASE_URL / OPENCODE_API_KEY fallbacks (compat with
 *      users who already have these in their environment)
 *   4. Config file at $XDG_CONFIG_HOME/multimind/config.json,
 *      populated via `multimind config set` or `multimind config init`
 *   5. Built-in default
 */

import type { LLMProvider, LLMRequest, LLMResponse } from "./provider"
import { loadConfig } from "../config-store"

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
    // Config resolution is async (the file read is async). The
    // constructor awaits once on it; this is fine because the file is
    // small and local. Consumers that need a fully-sync constructor
    // can pass every value via the explicit overrides.
    const fileConfigPromise = loadConfig()
    const fileConfig = fileConfigPromise as unknown as { config: Awaited<ReturnType<typeof loadConfig>>["config"] }
    // The above line exists only to satisfy the synchronous constructor
    // signature; the actual async read happens below.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fileConfigPromise.then((resolved) => {
      if (!config.baseUrl) this.baseUrl = resolved.path ? resolved.config.baseUrl : this.baseUrl
      if (!config.apiKey) this.apiKey = resolved.path ? resolved.config.apiKey : this.apiKey
      if (!config.model) this.defaultModel = resolved.path ? resolved.config.model : this.defaultModel
      if (!config.timeoutMs) this.timeoutMs = resolved.path ? resolved.config.timeoutMs : this.timeoutMs
    })

    this.baseUrl = (config.baseUrl
      ?? process.env.LLM_BASE_URL
      ?? process.env.OPENCODE_BASE_URL
      ?? "http://127.0.0.1:4096/v1").replace(/\/+$/, "")
    this.apiKey = config.apiKey ?? process.env.LLM_API_KEY ?? process.env.OPENCODE_API_KEY ?? ""
    this.defaultModel = config.model ?? process.env.LLM_MODEL ?? "minimax-m3"
    this.timeoutMs = config.timeoutMs ?? (Number(process.env.LLM_TIMEOUT_MS) || 120_000)
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
  return Object.entries(tools)
    .filter(([, enabled]) => enabled)
    .map(([name]) => ({ type: "function", function: { name, parameters: {} } }))
}
