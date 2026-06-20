/**
 * Shared test helpers.
 *
 * Imported by `tests/provider.test.ts` and by any future test
 * file that needs a mocked LLM provider or a captured fetch.
 *
 * The `mockFetch` helper handles the boilerplate of replacing
 * `globalThis.fetch` with a `bun:test` mock, capturing the
 * calls, and providing a `restore()` callback that the test's
 * `finally` block calls to put the real fetch back. The pattern
 * is easy to get wrong (forgetting to restore leaks the mock
 * into the next test) so it lives here.
 */

import { mock } from "bun:test"

export type FetchCall = { url: string; init: RequestInit }

export type MockFetch = {
  calls: FetchCall[]
  restore: () => void
}

/**
 * Replace `globalThis.fetch` with a bun mock that records each
 * call and returns the response from `impl`. Always pair with
 * `try { ... } finally { m.restore() }` in the test, or the
 * mock leaks into the next test.
 *
 * @example
 *   const m = mockFetch(async () => new Response("ok", { status: 200 }))
 *   try {
 *     // ...call code under test...
 *     expect(m.calls).toHaveLength(1)
 *   } finally {
 *     m.restore()
 *   }
 */
export function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>): MockFetch {
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

/**
 * Build a 200 OK chat-completion response with the given
 * assistant content. The body shape matches the OpenAI
 * chat-completions API.
 */
export function chatCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}
