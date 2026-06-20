/**
 * Pipeline smoke tests using a mock LLM provider.
 *
 * These don't require opencode serve or any real LLM. They prove the
 * pipeline orchestrator: W0 routing, worker selection, C0 synthesis,
 * consolidation, and the various skip paths.
 */

import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { LLMProvider, LLMRequest, LLMResponse } from "../src/llm/provider"
import { runThinkingPipeline } from "../src/pipeline/run"
import type { ThinkingInput } from "../src/types"

const PROMPTS_DIR = path.join(import.meta.dir, "..", "src", "prompts")
const RUNS_DIR = path.join(import.meta.dir, "..", ".test-runs")

function makeInput(text: string, response: string): ThinkingInput {
  return {
    history: [
      { info: { id: "u1", role: "user", time: { created: 1 } }, parts: [{ type: "text", text }] },
      {
        info: { id: "a1", role: "assistant", time: { created: 2 } },
        parts: [{ type: "text", text: response }],
      },
    ],
  }
}

function scriptedProvider(scripted: string[]): LLMProvider & { calls: number } {
  const calls = { value: 0 }
  return {
    name: "scripted",
    get calls() {
      return calls.value
    },
    async complete(_request: LLMRequest): Promise<LLMResponse> {
      const output = scripted[calls.value] ?? scripted[scripted.length - 1] ?? ""
      calls.value++
      return {
        content: output,
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: "stop",
        latencyMs: 1,
      }
    },
  }
}

describe("pipeline", () => {
  test("skips when disabled in config", async () => {
    const provider = scriptedProvider([])
    const result = await runThinkingPipeline(
      { ...makeInput("q", "a"), config: { enabled: false } },
      provider,
      {
        promptsDir: PROMPTS_DIR,
        runsDir: RUNS_DIR,
      },
    )
    expect(result.meta.routerDecision).toBe("SKIP")
    expect(result.meta.notes).toContain("disabled")
  })

  test("skips when W0 says SKIP", async () => {
    const provider = scriptedProvider(["STATUS: SKIP\nREASON: nothing to do"])
    const result = await runThinkingPipeline(makeInput("q", "a"), provider, {
      promptsDir: PROMPTS_DIR,
      runsDir: RUNS_DIR,
    })
    expect(result.meta.routerDecision).toBe("SKIP")
    expect(result.meta.notes).toContain("skipped")
  })

  test("fires workers and consolidates when W0 says ACTIVATE", async () => {
    const provider = scriptedProvider([
      "STATUS: ACTIVATE\nWORKERS: W2\nCONTEXT: gap detection needed",
      "GAP: missing consistency check",
    ])
    const result = await runThinkingPipeline(makeInput("review this", "looks good"), provider, {
      promptsDir: PROMPTS_DIR,
      runsDir: RUNS_DIR,
    })
    expect(result.meta.routerDecision).toBe("ACTIVATE")
    expect(Object.keys(result.workers)).toEqual(["W2"])
    expect(result.workers.W2?.key).toBe("W2")
    expect(result.workers.W2?.output).toContain("missing consistency check")
    expect(result.headsUp).toContain("[Heads-Up]")
  })

  test("runs C0 synthesizer when C0 prompt is available and W0 activates", async () => {
    const provider = scriptedProvider([
      "STATUS: ACTIVATE\nWORKERS: W14\nCONTEXT: delivery contract",
      "DELIVERY_CONTRACT: must verify before done.",
      "[Multimind Completion Contract]\nCOMPLETION_CONTRACT:\n  evidence:\n    - verified\n[multimind:safe_to_end]",
    ])
    const result = await runThinkingPipeline(makeInput("build it", "done"), provider, {
      promptsDir: PROMPTS_DIR,
      runsDir: RUNS_DIR,
    })
    expect(result.meta.routerDecision).toBe("ACTIVATE")
    expect(result.meta.c0Decision).toBe("safe_to_end")
  })

  test("rejects when latest user message is a self-injection (avoids recursion)", async () => {
    const provider = scriptedProvider([])
    const result = await runThinkingPipeline(
      {
        history: [
          {
            info: { id: "u1", role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "real question" }],
          },
          {
            info: { id: "a1", role: "assistant", time: { created: 2 } },
            parts: [{ type: "text", text: "answer" }],
          },
          {
            info: { id: "u2", role: "user", time: { created: 3 } },
            parts: [{ type: "text", text: "previous thinking", metadata: { source: "multimind" } }],
          },
        ],
      },
      provider,
      { promptsDir: PROMPTS_DIR, runsDir: RUNS_DIR },
    )
    expect(result.meta.notes).toContain("injection_recent")
  })

  test("skips when assistant hasn't answered the latest real user message", async () => {
    const provider = scriptedProvider([])
    const result = await runThinkingPipeline(
      {
        history: [
          {
            info: { id: "u1", role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "first" }],
          },
          {
            info: { id: "a1", role: "assistant", time: { created: 2 } },
            parts: [{ type: "text", text: "ok" }],
          },
          {
            info: { id: "u2", role: "user", time: { created: 3 } },
            parts: [{ type: "text", text: "follow-up" }],
          },
        ],
      },
      provider,
      { promptsDir: PROMPTS_DIR, runsDir: RUNS_DIR },
    )
    expect(result.meta.notes).toContain("assistant_pending")
  })

  test("honors workers override from input when router activates", async () => {
    const provider = scriptedProvider([
      "STATUS: ACTIVATE\nWORKERS: ignored\nCONTEXT: but override forces specific workers",
      "FROM W4: risk noted",
      "FROM W2: gap noted",
    ])
    const result = await runThinkingPipeline({ ...makeInput("q", "a"), workers: ["W2", "W4"] }, provider, {
      promptsDir: PROMPTS_DIR,
      runsDir: RUNS_DIR,
    })
    expect(result.meta.routerDecision).toBe("ACTIVATE")
    expect(Object.keys(result.workers).sort()).toEqual(["W2", "W4"])
  })
})
