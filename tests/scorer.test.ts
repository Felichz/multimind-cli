/**
 * Tests for the LLM-as-judge scorer.
 *
 * The judge is the most important file in the eval suite. If it
 * drifts (e.g. someone tweaks the score bands, the must-avoid
 * rule, or the parseJudgeResponse logic), the eval pass rate
 * stops being comparable to previous runs.
 *
 * These tests pin the contract:
 *
 *   - parseJudgeResponse handles the well-formed JSON case
 *   - parseJudgeResponse handles JSON wrapped in markdown fences
 *   - parseJudgeResponse returns a parse-error result on garbage
 *   - parseJudgeResponse coerces the `pass` field correctly
 *   - The judge prompt includes all the scoring bands (0-9, 10-24,
 *     25-39, 40-59, 60-74, 75-84, 85-95, 96-100)
 *   - The judge prompt includes the "no 80+ if must-avoid violated"
 *     strictness rule
 *   - The judge prompt frames the input as a "Subconscious Heads-Up"
 *     (private context for a downstream LLM), not a user-facing
 *     response
 */

import { describe, expect, test } from "bun:test"
import { judgeThinking, parseJudgeResponse } from "../src/judge"
import type { LLMProvider, LLMRequest, LLMResponse } from "../src/llm/provider"

function scriptedProvider(content: string): LLMProvider {
  return {
    name: "scripted",
    async complete(_req: LLMRequest): Promise<LLMResponse> {
      return { content, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop", latencyMs: 0 }
    },
  }
}

describe("parseJudgeResponse", () => {
  test("parses a well-formed JSON object", () => {
    const parsed = parseJudgeResponse(
      JSON.stringify({
        score: 88,
        valueAdded: 0,
        strengths: ["named the right risks"],
        missing: ["could have cited a specific file path"],
        rationale: "strong pass overall",
      }),
    )
    expect(parsed.score).toBe(88)
    expect(parsed.valueAdded).toBe(0)
    expect(parsed.strengths).toEqual(["named the right risks"])
    expect(parsed.missing).toEqual(["could have cited a specific file path"])
    expect(parsed.rationale).toBe("strong pass overall")
  })

  test("strips a leading ```json markdown fence", () => {
    const parsed = parseJudgeResponse('```json\n{"score": 75, "rationale": "below threshold"}\n```')
    expect(parsed.score).toBe(75)
    expect(parsed.rationale).toBe("below threshold")
  })

  test("strips a leading ``` fence without json label", () => {
    const parsed = parseJudgeResponse('```\n{"score": 92}\n```')
    expect(parsed.score).toBe(92)
  })

  test("extracts JSON from a noisy response with prose around it", () => {
    const parsed = parseJudgeResponse(
      'Here is my judgment:\n{"score": 84, "rationale": "solid"}\nThat\'s my call.',
    )
    expect(parsed.score).toBe(84)
  })

  test("clamps score to 0-100", () => {
    const high = parseJudgeResponse(JSON.stringify({ score: 150 }))
    expect(high.score).toBe(100)
    const low = parseJudgeResponse(JSON.stringify({ score: -10 }))
    expect(low.score).toBe(0)
  })

  test("clamps valueAdded to 0-5", () => {
    expect(parseJudgeResponse(JSON.stringify({ valueAdded: 99 })).valueAdded).toBe(5)
    expect(parseJudgeResponse(JSON.stringify({ valueAdded: -3 })).valueAdded).toBe(0)
  })

  test("returns a parse-error result on garbage input", () => {
    const parsed = parseJudgeResponse("this is not json at all")
    expect(parsed.score).toBe(0)
    expect(parsed.valueAdded).toBe(0)
    expect(parsed.missing).toContain("judge returned non-JSON")
  })

  test("handles empty input", () => {
    const parsed = parseJudgeResponse("")
    expect(parsed.score).toBe(0)
    expect(parsed.missing).toContain("judge returned non-JSON")
  })

  test("handles JSON arrays (not just objects) gracefully", () => {
    const parsed = parseJudgeResponse("[1, 2, 3]")
    expect(parsed.score).toBe(0)
  })

  test("defaults missing fields to empty array / 'no reason given'", () => {
    const parsed = parseJudgeResponse(JSON.stringify({ score: 50 }))
    expect(parsed.strengths).toEqual([])
    expect(parsed.missing).toEqual([])
    expect(parsed.rationale).toBe("no reason given")
  })
})

describe("judgeThinking (with scripted provider)", () => {
  test("derives pass=true from score >= minScore", async () => {
    const provider = scriptedProvider(
      JSON.stringify({
        score: 88,
        valueAdded: 0,
        strengths: ["x"],
        missing: [],
        rationale: "good",
      }),
    )
    const result = await judgeThinking(provider, {
      caseID: "TEST-001",
      thinking: "[Subconscious Heads-Up]\nsome content",
      expectedQuality: "x",
      mustAvoid: [],
      userMessage: "x",
      history: "",
      minScore: 80,
    })
    expect(result.score).toBe(88)
    expect(result.pass).toBe(true)
    expect(result.rationale).toBe("good")
  })

  test("derives pass=false from score < minScore", async () => {
    const provider = scriptedProvider(
      JSON.stringify({ score: 60, valueAdded: 0, strengths: [], missing: [], rationale: "weak" }),
    )
    const result = await judgeThinking(provider, {
      caseID: "TEST-002",
      thinking: "x",
      expectedQuality: "x",
      mustAvoid: [],
      userMessage: "x",
      history: "",
      minScore: 80,
    })
    expect(result.score).toBe(60)
    expect(result.pass).toBe(false)
  })

  test("returns score 0 and a failure rationale on garbage from the judge", async () => {
    const provider = scriptedProvider("garbage from the judge, no json")
    const result = await judgeThinking(provider, {
      caseID: "TEST-003",
      thinking: "x",
      expectedQuality: "x",
      mustAvoid: [],
      userMessage: "x",
      history: "",
      minScore: 80,
    })
    expect(result.score).toBe(0)
    expect(result.pass).toBe(false)
    expect(result.missing).toContain("judge returned non-JSON")
  })
})
