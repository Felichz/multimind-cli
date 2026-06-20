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

import { loadConfig } from "../config-store"
import type { LLMProvider, LLMRequest, LLMResponse } from "./provider"

export type OpenAICompatConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
  timeoutMs?: number
}

type ResolvedConfig = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export class OpenAICompatProvider implements LLMProvider {
  readonly name = "openai-compat"
  private readonly explicit: OpenAICompatConfig
  private configPromise: Promise<ResolvedConfig> | null = null

  constructor(config: OpenAICompatConfig = {}) {
    this.explicit = config
  }

  /**
   * Resolve the effective config once, on the first call. Caches the
   * promise so concurrent `complete()` calls share the same resolution.
   *
   * Resolution order (first non-empty wins per field):
   *   1. Constructor argument
   *   2. `MULTIMIND_*` env vars
   *   3. Config file at $XDG_CONFIG_HOME/multimind/config.json
   *   4. Built-in default
   */
  private async resolveConfig(): Promise<ResolvedConfig> {
    if (this.configPromise) return this.configPromise
    this.configPromise = (async () => {
      const file = await loadConfig()
      const envBase = process.env.MULTIMIND_BASE_URL
      const envKey = process.env.MULTIMIND_API_KEY
      const envModel = process.env.MULTIMIND_MODEL
      const envTimeout = process.env.MULTIMIND_TIMEOUT_MS
      return {
        baseUrl: (this.explicit.baseUrl ?? envBase ?? file.config.baseUrl).replace(/\/+$/, ""),
        apiKey: this.explicit.apiKey ?? envKey ?? file.config.apiKey,
        model: this.explicit.model ?? envModel ?? file.config.model,
        timeoutMs:
          this.explicit.timeoutMs ?? (envTimeout ? Number(envTimeout) : undefined) ?? file.config.timeoutMs,
      }
    })()
    return this.configPromise
  }

  async complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    const config = await this.resolveConfig()
    const startedAt = Date.now()

    const messages = []
    if (request.system) messages.push({ role: "system", content: request.system })
    for (const message of request.messages) messages.push({ role: message.role, content: message.content })

    const body = {
      model: request.model?.modelID ?? config.model,
      messages,
      ...(request.tools ? { tools: mapTools(request.tools) } : {}),
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      stream: false,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort("provider timeout"), config.timeoutMs)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId)
        throw new Error(signal.reason ? String(signal.reason) : "aborted")
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
    }

    let response: Response
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `openai-compat: model=${body.model} HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
      )
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
