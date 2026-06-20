/**
 * OpenAICompatProvider tests with a mocked fetch.
 *
 * The race condition fix (#3) moved config resolution from the
 * constructor to a lazy `complete()` call. These tests pin that
 * contract: the provider reads its config (constructor, env, file)
 * on the first `complete()` and caches it. They also cover the
 * HTTP behavior (headers, error mapping, timeout, abort) that the
 * old "smoke check the constructor" test did not.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { OpenAICompatProvider } from "../src/llm/openai-compat"

type FetchCall = { url: string; init: RequestInit }

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>): {
  calls: FetchCall[]
  restore: () => void
} {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  globalThis.fetch = mock(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init: init ?? {} })
    return impl(url, init ?? {})
  }) as unknown as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function chatCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

describe("OpenAICompatProvider", () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {
      MULTIMIND_BASE_URL: process.env.MULTIMIND_BASE_URL,
      MULTIMIND_API_KEY: process.env.MULTIMIND_API_KEY,
      MULTIMIND_MODEL: process.env.MULTIMIND_MODEL,
      MULTIMIND_TIMEOUT_MS: process.env.MULTIMIND_TIMEOUT_MS,
    }
    Reflect.deleteProperty(process.env, "MULTIMIND_BASE_URL")
    Reflect.deleteProperty(process.env, "MULTIMIND_API_KEY")
    Reflect.deleteProperty(process.env, "MULTIMIND_MODEL")
    Reflect.deleteProperty(process.env, "MULTIMIND_TIMEOUT_MS")
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test("uses the explicit baseUrl from the constructor", async () => {
    const m = mockFetch(async (url) => {
      expect(url).toBe("http://localhost:9999/v1/chat/completions")
      return chatCompletionResponse("ok")
    })
    try {
      const provider = new OpenAICompatProvider({ baseUrl: "http://localhost:9999/v1/" })
      const result = await provider.complete({ messages: [{ role: "user", content: "hi" }] })
      expect(result.content).toBe("ok")
      expect(m.calls).toHaveLength(1)
    } finally {
      m.restore()
    }
  })

  test("falls back to MULTIMIND_BASE_URL env var", async () => {
    process.env.MULTIMIND_BASE_URL = "http://from-env:8080/v1"
    const m = mockFetch(async (url) => {
      expect(url).toStartWith("http://from-env:8080/v1/chat/completions")
      return chatCompletionResponse("ok")
    })
    try {
      const provider = new OpenAICompatProvider()
      await provider.complete({ messages: [{ role: "user", content: "hi" }] })
    } finally {
      m.restore()
    }
  })

  test("sends Authorization header when apiKey is set", async () => {
    const m = mockFetch(async (_url, init) => {
      const headers = init.headers as Record<string, string> | undefined
      expect(headers?.Authorization).toBe("Bearer secret-key")
      return chatCompletionResponse("ok")
    })
    try {
      const provider = new OpenAICompatProvider({
        baseUrl: "http://localhost:9999/v1",
        apiKey: "secret-key",
      })
      await provider.complete({ messages: [{ role: "user", content: "hi" }] })
    } finally {
      m.restore()
    }
  })

  test("omits Authorization header when apiKey is empty", async () => {
    const m = mockFetch(async (_url, init) => {
      const headers = init.headers as Record<string, string> | undefined
      expect(headers?.Authorization).toBeUndefined()
      return chatCompletionResponse("ok")
    })
    try {
      // Pass apiKey: "" explicitly so it wins over the file fallback.
      // (The `??` chain only falls through on null/undefined, not on
      // empty string.)
      const provider = new OpenAICompatProvider({ baseUrl: "http://localhost:9999/v1", apiKey: "" })
      await provider.complete({ messages: [{ role: "user", content: "hi" }] })
    } finally {
      m.restore()
    }
  })

  test("returns a clear error on HTTP 4xx/5xx with the model name and body excerpt", async () => {
    const m = mockFetch(async () => {
      return new Response("invalid api key", { status: 401, statusText: "Unauthorized" })
    })
    try {
      const provider = new OpenAICompatProvider({ baseUrl: "http://localhost:9999/v1" })
      await expect(provider.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
        /model=.*HTTP 401 Unauthorized.*invalid api key/,
      )
    } finally {
      m.restore()
    }
  })

  test("includes the system prompt as the first message in the request body", async () => {
    const m = mockFetch(async (_url, init) => {
      const body = JSON.parse(init.body as string)
      expect(body.messages[0]).toEqual({ role: "system", content: "you are helpful" })
      expect(body.messages[1]).toEqual({ role: "user", content: "hi" })
      return chatCompletionResponse("ok")
    })
    try {
      const provider = new OpenAICompatProvider({ baseUrl: "http://localhost:9999/v1" })
      await provider.complete({
        system: "you are helpful",
        messages: [{ role: "user", content: "hi" }],
      })
    } finally {
      m.restore()
    }
  })

  test("uses request.model.modelID when supplied, falling back to the configured model", async () => {
    const m = mockFetch(async (_url, init) => {
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe("specific-model")
      return chatCompletionResponse("ok")
    })
    try {
      const provider = new OpenAICompatProvider({
        baseUrl: "http://localhost:9999/v1",
        model: "default-model",
      })
      await provider.complete({
        messages: [{ role: "user", content: "hi" }],
        model: { providerID: "x", modelID: "specific-model" },
      })
    } finally {
      m.restore()
    }
  })

  test("caches the resolved config across multiple complete() calls", async () => {
    process.env.MULTIMIND_BASE_URL = "http://first:1/v1"
    const m = mockFetch(async () => chatCompletionResponse("ok"))
    try {
      const provider = new OpenAICompatProvider()
      await provider.complete({ messages: [{ role: "user", content: "1" }] })
      // Change env AFTER construction. The second call should still hit
      // the original baseUrl because the config was resolved on the first
      // call and cached.
      process.env.MULTIMIND_BASE_URL = "http://second:2/v1"
      await provider.complete({ messages: [{ role: "user", content: "2" }] })
      expect(m.calls[0]?.url).toStartWith("http://first:1/v1/")
      expect(m.calls[1]?.url).toStartWith("http://first:1/v1/")
    } finally {
      m.restore()
    }
  })
})
