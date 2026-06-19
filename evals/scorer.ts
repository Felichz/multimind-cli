/**
 * LLM-as-judge scorer for the reaction eval.
 *
 * Given a thinking output, the expected quality criteria, and the
 * must-avoid list, asks an LLM to score 0-100. Returns a number and
 * a one-sentence reason.
 *
 * The judge is intentionally simple: a single prompt, structured JSON
 * output. The eval driver doesn't try to be clever about prompt
 * design — the harness's job is to think well, the judge's job is
 * to score honestly.
 */

import type { LLMProvider } from "../src/llm/provider"

export type JudgeInput = {
  caseID: string
  thinking: string
  expectedQuality: string
  mustAvoid: string[]
  userMessage: string
  history: string
}

export type JudgeResult = {
  score: number
  reason: string
  latencyMs: number
}

const JUDGE_SYSTEM = `You are scoring an LLM's response to a user's message in a software engineering context.

You will be given:
- The conversation history (what the assistant said before, what the user said)
- The user's latest message
- The actual response from the system under test
- Expected quality criteria (what a good response should do)
- A must-avoid list (what a bad response would do)

Score 0-100 based on:
- Did it cover the expected quality criteria?
- Did it avoid the must-avoid list?
- Is the reasoning sound and grounded in evidence?
- Is the action concrete and testable?

Return JSON only, no other text:
{"score": <0-100>, "reason": "<one sentence>"}

Score calibration:
- 90-100: Strong response, covers all criteria, avoids everything in must-avoid
- 70-89: Good but missing 1-2 elements or with minor reasoning gaps
- 50-69: Partial coverage, some must-avoid items triggered
- 30-49: Significant gaps or major must-avoid hits
- 0-29: Off-topic, hallucinates, or does the opposite of what was asked

Do not be generous. The point of the eval is to find weaknesses, not to validate the harness.`

export async function judgeThinking(provider: LLMProvider, input: JudgeInput, model?: { providerID: string; modelID: string }): Promise<JudgeResult> {
  const startedAt = Date.now()
  const userPrompt = [
    `Case: ${input.caseID}`,
    ``,
    `Conversation history:`,
    input.history,
    ``,
    `User's latest message: ${input.userMessage}`,
    ``,
    `Expected quality (what a good response should do):`,
    input.expectedQuality,
    ``,
    `Must avoid (these are failure modes):`,
    ...input.mustAvoid.map((item) => `- ${item}`),
    ``,
    `Actual response from the system:`,
    input.thinking || "(empty response — system returned no thinking)",
    ``,
    `Score JSON:`,
  ].join("\n")

  try {
    const response = await provider.complete({
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      ...(model ? { model } : {}),
    })
    const parsed = parseJudgeResponse(response.content)
    return { ...parsed, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      score: 0,
      reason: `judge failed: ${error instanceof Error ? error.message : String(error)}`,
      latencyMs: Date.now() - startedAt,
    }
  }
}

function parseJudgeResponse(content: string): { score: number; reason: string } {
  // The judge is asked to return JSON. Be lenient: find the first {...} block
  // and parse it. If the model wraps the JSON in code fences, strip them.
  const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  const text = match ? match[0] : stripped
  try {
    const parsed = JSON.parse(text) as { score?: number; reason?: string }
    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0
    const reason = typeof parsed.reason === "string" ? parsed.reason : "no reason given"
    return { score, reason }
  } catch {
    return { score: 0, reason: `judge returned non-JSON: ${text.slice(0, 200)}` }
  }
}
