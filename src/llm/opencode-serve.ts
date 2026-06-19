/**
 * OpenCode Serve provider — talks to a running `opencode serve` via the SDK.
 *
 * The CLI expects an `opencode serve` running on OPENCODE_BASE_URL (default
 * http://127.0.0.1:4096). The server exposes Anthropic/OpenAI/DeepSeek/etc.
 * depending on the user's configured providers, so this provider inherits
 * whatever auth the server already has.
 *
 * This is the minimum-viable provider: it covers every model the harness
 * can use, and reuses the user's existing opencode auth. Future providers
 * (direct Anthropic, direct OpenAI, etc.) can implement `LLMProvider` and
 * be selected via config without touching the pipeline code.
 */

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import type { LLMProvider, LLMRequest, LLMResponse } from "./provider"

const DEFAULT_BASE_URL = "http://127.0.0.1:4096"
const DEFAULT_TIMEOUT_MS = 120_000

export type OpenCodeServeConfig = {
  baseUrl?: string
  directory?: string
  timeoutMs?: number
}

export class OpenCodeServeProvider implements LLMProvider {
  readonly name = "opencode-serve"
  private client: OpencodeClient
  private directory: string
  private timeoutMs: number

  constructor(config: OpenCodeServeConfig = {}) {
    const baseUrl = config.baseUrl ?? process.env.OPENCODE_BASE_URL ?? DEFAULT_BASE_URL
    this.client = createOpencodeClient({ baseUrl })
    this.directory = config.directory ?? process.cwd()
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    const startedAt = Date.now()

    // Create a one-shot session, prompt it, harvest the response, delete the session.
    // The v2 SDK uses flat parameters (no path/body wrappers).
    const session = await this.client.session.create({
      directory: this.directory,
      title: "multimind-cli-worker",
    })
    const sessionID = session.data?.id
    if (!sessionID) {
      throw new Error("opencode-serve: failed to create session")
    }

    try {
      if (signal?.aborted) throw new Error("aborted before prompt")

      const response = await Promise.race([
        this.client.session.prompt({
          sessionID,
          directory: this.directory,
          parts: [{ type: "text", text: buildPromptText(request) }],
          ...(request.model ? { model: request.model } : {}),
          ...(request.tools ? { tools: request.tools } : {}),
        }),
        abortAfter(signal, this.timeoutMs, sessionID, this.client, this.directory),
      ])

      const output = (response.data?.parts ?? [])
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")

      return {
        content: output,
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: "stop",
        latencyMs: Date.now() - startedAt,
      }
    } finally {
      await this.client.session.delete({ sessionID, directory: this.directory }).catch(() => undefined)
    }
  }
}

function buildPromptText(request: LLMRequest): string {
  const system = request.system ? `${request.system}\n\n` : ""
  const messages = request.messages
    .map((message) => `[${message.role.toUpperCase()}]: ${message.content}`)
    .join("\n\n")
  return `${system}${messages}`
}

function abortAfter(signal: AbortSignal | undefined, timeoutMs: number, sessionID: string, client: OpencodeClient, directory: string) {
  return new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      client.session.delete({ sessionID, directory }).catch(() => undefined)
      reject(new Error(`opencode-serve: timeout after ${timeoutMs}ms`))
    }, timeoutMs)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        client.session.delete({ sessionID, directory }).catch(() => undefined)
        reject(new Error(signal.reason ? String(signal.reason) : "aborted"))
      },
      { once: true },
    )
  })
}
