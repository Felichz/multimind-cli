/**
 * Tests for the research and evolution engines.
 *
 * These are the two engines the pipeline calls in its main flow
 * (steps 7 and 8 in `runThinkingPipeline`). They are also the
 * only public modules in `src/` that have no test coverage.
 *
 * What the tests pin down:
 *   - Trigger detection (hasXTriggers) is true iff the marker
 *     appears in any worker output
 *   - Marker extraction (extractXRequests) handles well-formed,
 *     multiple, malformed, and missing-field cases
 *   - Marker processing (processXTriggers) calls the provider
 *     with the right prompt and returns the expected shape
 *
 * The `loadPrompt` helper is private and is exercised indirectly
 * through `processXTriggers`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import path from "node:path"
import {
  extractExtensionRequests,
  hasEvolutionTriggers,
  processEvolutionTriggers,
} from "../src/engines/evolution-engine"
import {
  extractResearchRequests,
  hasResearchTriggers,
  processResearchTriggers,
} from "../src/engines/research-engine"
import type { LLMProvider, LLMRequest, LLMResponse } from "../src/llm/provider"

const ROOT = path.join(import.meta.dir, "..")
const PROMPTS_DIR = path.join(ROOT, "src", "prompts")
const EMPTY_EXT_DIR = path.join(ROOT, "src", "prompts-extensions")

const MODEL = { providerID: "x", modelID: "m" }

function scriptedProvider(content: string): LLMProvider & { calls: LLMRequest[] } {
  const calls: LLMRequest[] = []
  return {
    name: "scripted",
    get calls() {
      return calls
    },
    async complete(req: LLMRequest): Promise<LLMResponse> {
      calls.push(req)
      return { content, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop", latencyMs: 0 }
    },
  }
}

// ---------------------------------------------------------------------------
// research-engine
// ---------------------------------------------------------------------------

describe("research-engine > hasResearchTriggers", () => {
  test("returns false when no insight contains [EXECUTE_RESEARCH]", () => {
    expect(hasResearchTriggers([{ key: "W2", name: "Gap", output: "no markers here" }])).toBe(false)
  })

  test("returns true when at least one insight contains the marker", () => {
    expect(
      hasResearchTriggers([
        { key: "W2", name: "Gap", output: "no markers here" },
        {
          key: "W13",
          name: "Researcher",
          output: `[EXECUTE_RESEARCH] {"queries": ["a"]} [/EXECUTE_RESEARCH]`,
        },
      ]),
    ).toBe(true)
  })

  test("returns true on an empty marker block with a closing tag", () => {
    expect(
      hasResearchTriggers([
        { key: "W13", name: "R", output: "text [EXECUTE_RESEARCH] {} [/EXECUTE_RESEARCH] more" },
      ]),
    ).toBe(true)
  })
})

describe("research-engine > extractResearchRequests", () => {
  test("extracts a single request with one query", () => {
    const requests = extractResearchRequests([
      {
        key: "W13",
        name: "Researcher",
        output: `[EXECUTE_RESEARCH] {"queries": ["is X safe?"]} [/EXECUTE_RESEARCH]`,
      },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.queries).toEqual(["is X safe?"])
    expect(requests[0]?.source.key).toBe("W13")
  })

  test("extracts multiple requests from a single insight", () => {
    const requests = extractResearchRequests([
      {
        key: "W13",
        name: "R",
        output: `first [EXECUTE_RESEARCH] {"queries": ["a"]} [/EXECUTE_RESEARCH]
        second [EXECUTE_RESEARCH] {"queries": ["b", "c"]} [/EXECUTE_RESEARCH]`,
      },
    ])
    expect(requests).toHaveLength(2)
    expect(requests[0]?.queries).toEqual(["a"])
    expect(requests[1]?.queries).toEqual(["b", "c"])
  })

  test("extracts from multiple insights", () => {
    const requests = extractResearchRequests([
      { key: "W2", name: "Gap", output: `[EXECUTE_RESEARCH] {"queries": ["a"]} [/EXECUTE_RESEARCH]` },
      { key: "W13", name: "R", output: `[EXECUTE_RESEARCH] {"queries": ["b"]} [/EXECUTE_RESEARCH]` },
    ])
    expect(requests).toHaveLength(2)
  })

  test("skips malformed JSON silently", () => {
    const requests = extractResearchRequests([
      { key: "W13", name: "R", output: "[EXECUTE_RESEARCH] {not json} [/EXECUTE_RESEARCH]" },
    ])
    expect(requests).toHaveLength(0)
  })

  test("skips markers where the JSON parses but queries is not a non-empty array", () => {
    const cases = [
      "{EXECUTE_RESEARCH] {} [/EXECUTE_RESEARCH]", // missing queries
      '[EXECUTE_RESEARCH] {"queries": []} [/EXECUTE_RESEARCH]', // empty array
      '[EXECUTE_RESEARCH] {"queries": "not an array"} [/EXECUTE_RESEARCH]', // wrong type
    ]
    for (const output of cases) {
      const requests = extractResearchRequests([{ key: "W13", name: "R", output }])
      expect(requests, `should skip: ${output}`).toHaveLength(0)
    }
  })

  test("returns an empty array for an empty insights list", () => {
    expect(extractResearchRequests([])).toEqual([])
  })
})

describe("research-engine > processResearchTriggers", () => {
  beforeEach(async () => {
    // Sanity: the real W13 prompt is present. If it disappears,
    // the test below should fail explicitly.
    const exists = await Bun.file(path.join(PROMPTS_DIR, "W13_RESEARCHER.md")).exists()
    if (!exists) throw new Error("W13_RESEARCHER.md missing; this test depends on it")
  })

  test("calls the provider once per query and formats the results", async () => {
    const provider = scriptedProvider("the answer is 42")
    const results = await processResearchTriggers(
      [
        {
          key: "W13",
          name: "Researcher",
          output: `[EXECUTE_RESEARCH] {"queries": ["q1", "q2"]} [/EXECUTE_RESEARCH]`,
        },
      ],
      PROMPTS_DIR,
      EMPTY_EXT_DIR,
      provider,
      MODEL,
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toContain("q1")
    expect(results[0]).toContain("the answer is 42")
    expect(results[1]).toContain("q2")
    expect(provider.calls).toHaveLength(2)
  })

  test("skips a request when the W13 prompt is missing", async () => {
    const provider = scriptedProvider("should not be called")
    const results = await processResearchTriggers(
      [{ key: "W13", name: "R", output: `[EXECUTE_RESEARCH] {"queries": ["x"]} [/EXECUTE_RESEARCH]` }],
      "/nonexistent",
      EMPTY_EXT_DIR,
      provider,
      MODEL,
    )
    expect(results).toEqual(["Research request skipped: W13_RESEARCHER.md not found"])
    expect(provider.calls).toHaveLength(0)
  })

  test("passes the W13 prompt as the system message", async () => {
    const provider = scriptedProvider("ok")
    await processResearchTriggers(
      [{ key: "W13", name: "R", output: `[EXECUTE_RESEARCH] {"queries": ["x"]} [/EXECUTE_RESEARCH]` }],
      PROMPTS_DIR,
      EMPTY_EXT_DIR,
      provider,
      MODEL,
    )
    const firstCall = provider.calls[0]
    expect(firstCall?.system).toContain("Researcher")
  })

  test("returns an empty array when there are no triggers", async () => {
    const provider = scriptedProvider("ok")
    const results = await processResearchTriggers(
      [{ key: "W2", name: "Gap", output: "no markers" }],
      PROMPTS_DIR,
      EMPTY_EXT_DIR,
      provider,
      MODEL,
    )
    expect(results).toEqual([])
    expect(provider.calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// evolution-engine
// ---------------------------------------------------------------------------

describe("evolution-engine > hasEvolutionTriggers", () => {
  test("returns false when no insight contains a marker", () => {
    expect(hasEvolutionTriggers([{ key: "W10", name: "Meta", output: "no markers" }])).toBe(false)
  })

  test("returns true on [WRITE_EXTENSION]", () => {
    expect(
      hasEvolutionTriggers([
        {
          key: "W10",
          name: "M",
          output: `[WRITE_EXTENSION] {"target": "W14", "reason": "r"} [/WRITE_EXTENSION]`,
        },
      ]),
    ).toBe(true)
  })

  test("returns true on [SYNTHETIC_TEST]", () => {
    expect(
      hasEvolutionTriggers([
        { key: "W12", name: "T", output: `[SYNTHETIC_TEST] {"id": "x", "context": "y"} [/SYNTHETIC_TEST]` },
      ]),
    ).toBe(true)
  })
})

describe("evolution-engine > extractExtensionRequests", () => {
  test("extracts a single request", () => {
    const requests = extractExtensionRequests([
      {
        key: "W10",
        name: "M",
        output: `[WRITE_EXTENSION] {"target": "W14", "reason": "needs hardening"} [/WRITE_EXTENSION]`,
      },
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.target).toBe("W14")
    expect(requests[0]?.reason).toBe("needs hardening")
    expect(requests[0]?.source.key).toBe("W10")
  })

  test("extracts multiple requests", () => {
    const requests = extractExtensionRequests([
      {
        key: "W10",
        name: "M",
        output: `first [WRITE_EXTENSION] {"target": "W14", "reason": "r1"} [/WRITE_EXTENSION]
        second [WRITE_EXTENSION] {"target": "W6", "reason": "r2"} [/WRITE_EXTENSION]`,
      },
    ])
    expect(requests).toHaveLength(2)
    expect(requests[0]?.target).toBe("W14")
    expect(requests[1]?.target).toBe("W6")
  })

  test("skips malformed JSON", () => {
    const requests = extractExtensionRequests([
      { key: "W10", name: "M", output: "[WRITE_EXTENSION] not json [/WRITE_EXTENSION]" },
    ])
    expect(requests).toHaveLength(0)
  })

  test("skips when target or reason are not strings", () => {
    const cases = [
      '[WRITE_EXTENSION] {"target": "W14"} [/WRITE_EXTENSION]', // missing reason
      '[WRITE_EXTENSION] {"reason": "r"} [/WRITE_EXTENSION]', // missing target
      '[WRITE_EXTENSION] {"target": 123, "reason": "r"} [/WRITE_EXTENSION]', // wrong type
    ]
    for (const output of cases) {
      const requests = extractExtensionRequests([{ key: "W10", name: "M", output }])
      expect(requests, `should skip: ${output}`).toHaveLength(0)
    }
  })

  test("returns an empty array for empty insights", () => {
    expect(extractExtensionRequests([])).toEqual([])
  })
})

describe("evolution-engine > processEvolutionTriggers", () => {
  beforeEach(async () => {
    const exists = await Bun.file(path.join(PROMPTS_DIR, "W12_AUTO_TESTER.md")).exists()
    if (!exists) throw new Error("W12_AUTO_TESTER.md missing; this test depends on it")
  })

  test("calls the provider once per request and returns the requests plus a note", async () => {
    const provider = scriptedProvider("synthetic test body")
    const result = await processEvolutionTriggers(
      [
        {
          key: "W10",
          name: "M",
          output: `[WRITE_EXTENSION] {"target": "W14", "reason": "harden"} [/WRITE_EXTENSION]`,
        },
      ],
      PROMPTS_DIR,
      EMPTY_EXT_DIR,
      provider,
      MODEL,
      "/tmp/runs",
    )
    expect(result.extensionRequests).toHaveLength(1)
    expect(result.extensionRequests[0]?.target).toBe("W14")
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toContain("W14")
    expect(result.notes[0]).toContain("synthetic test body")
    expect(provider.calls).toHaveLength(1)
  })

  test("skips a request when the W12 prompt is missing", async () => {
    const provider = scriptedProvider("should not be called")
    const result = await processEvolutionTriggers(
      [
        {
          key: "W10",
          name: "M",
          output: `[WRITE_EXTENSION] {"target": "W14", "reason": "r"} [/WRITE_EXTENSION]`,
        },
      ],
      "/nonexistent",
      EMPTY_EXT_DIR,
      provider,
      MODEL,
      "/tmp/runs",
    )
    expect(result.extensionRequests).toHaveLength(1) // extraction still happens
    expect(result.notes[0]).toContain("W12_AUTO_TESTER.md missing")
    expect(provider.calls).toHaveLength(0)
  })

  test("returns no requests and no notes when there are no triggers", async () => {
    const provider = scriptedProvider("ok")
    const result = await processEvolutionTriggers(
      [{ key: "W10", name: "M", output: "no markers" }],
      PROMPTS_DIR,
      EMPTY_EXT_DIR,
      provider,
      MODEL,
      "/tmp/runs",
    )
    expect(result.extensionRequests).toEqual([])
    expect(result.notes).toEqual([])
    expect(provider.calls).toHaveLength(0)
  })
})
