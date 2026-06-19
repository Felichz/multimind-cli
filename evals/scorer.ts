/**
 * LLM-as-judge scorer for the reaction eval.
 *
 * This is the calibrated judge prompt that was used by the reaction eval
 * in the opencode monorepo. The earlier naive version in this package
 * gave scores 18-38 on cases that scored 85+ with this prompt. The
 * difference is the scoring bands, the strictness rules, the explicit
 * "response-only turn" context, and the structured JSON output.
 *
 * The judge is intentionally calibrated for the "Subconscious Heads-Up"
 * use case: the input is a notification from the background thinking
 * layer, not a full agent execution. It scores whether the response
 * describes the right path with professional autonomy, not whether it
 * actually executed tools.
 */

import type { LLMProvider } from "../src/llm/provider"

export type JudgeInput = {
  caseID: string
  thinking: string
  expectedQuality: string
  mustAvoid: string[]
  userMessage: string
  history: string
  minScore: number
}

export type JudgeResult = {
  score: number
  pass: boolean
  valueAdded: number
  strengths: string[]
  missing: string[]
  rationale: string
  raw: string
  latencyMs: number
}

const JUDGE_PROMPT = (input: JudgeInput): string => `You are a strict black-box judge for a main coding agent reaction.

Evaluate only the final assistant response quality. Do not care which internal architecture produced it.

Benchmark setup for the judge:
- The final assistant response was produced in a response-only turn. The assistant was asked to say what it thinks and what it would do once tool use is available; it was not allowed to execute tools, modify files, or claim new command results during that turn.
- Do not penalize the response for not actually editing files or running tests.
- Do penalize the response if it hides behind that constraint, becomes passive, asks for broad repo context without a real blocker, or fails to provide a concrete professional next response for the user-visible situation.
- A strong response can describe the exact implementation path, artifacts to inspect/change, assumptions, tests, evidence gates, and decision criteria without falsely claiming that those actions already happened.
- When exact repository paths or existing artifacts cannot be verified because tools are unavailable, do not require a real confirmed path. Reward a clearly marked plausible repo-relative target slot or ready-to-add artifact shape. Penalize vague "I would find the eval/test/logs later" language.
- In response-only turns, before/after evidence means a concrete protocol, command pair, evidence slots, and run-record template. Do not require completed before/after results, because the assistant was not allowed to run tools.

Score on a 0-100 scale:
- 0-9: harmful, evasive, or actively contrary to the expected behavior.
- 10-24: mostly misses the point; may contain generic apology/agreement but no useful professional action.
- 25-39: weakly related; catches a surface issue but misses the main principle or professional operating method.
- 40-59: partial; identifies the theme but leaves major gaps, vague next steps, or too much cognitive load on the user.
- 60-74: decent but not pass-worthy; useful response with at least one critical missing behavior or risk.
- 75-84: solid but below a strong gate; covers much of the expected behavior but still lacks some professional completeness, evidence, or autonomy.
- 85-95: strong pass; situated, autonomous, calibrated, low-friction, and clearly explains why the approach is professional.
- 96-100: exceptional top 5%; all strong-pass criteria plus additional useful value beyond the expected behavior.

Value-added bonus:
- If score is 96-100, set "valueAdded" to score - 95, an integer from 1 to 5.
- Award this only for concrete extra value: a better iteration strategy, sharper risk gate, clearer user debug evidence, or a lower-friction path that was not explicitly demanded.
- If score is below 96, valueAdded must be 0.

Strictness rules:
- Do not award 80+ if the response violates any must-avoid item.
- Do not award 80+ for merely repeating the user's correction back without an operational plan.
- Do not award 90+ unless the response shows professional autonomy: it reduces user cognitive load, defines evidence, and makes the next step clear.
- Apply eval/self-improvement artifact requirements only when the Expected behavior or latest user message explicitly asks for evals, tests, benchmarks, readiness, proof, implementation verification, or system improvement artifacts. Do not apply them to user-facing cognitive-load/debug handoff cases whose expected behavior is a screenshot/status/checklist/PR-link workflow.
- For true eval/self-improvement cases, do not award 85+ unless the response includes an operational loop: fail-first artifact or target slot, expected baseline failure, same-case before/after rerun, quick regression gate, and run metadata. The path may be marked unverified when tools are unavailable.
- Do not award 90+ for true eval/self-improvement cases unless the response names the first artifact, includes a ready-to-add artifact shape, states a decision table for accept/reject/regression outcomes, and provides a run-record template or equivalent metadata capture plan.
- Do not award 96+ unless the response adds concrete extra leverage beyond pass: sharper artifact naming, lower-friction user evidence, clearer rollback/stop conditions, or a better fast-vs-full test strategy.
- Prefer lower scores when the response sounds polished but does not materially improve the delivery workflow.

Return only JSON:
{
  "score": 0,
  "pass": false,
  "valueAdded": 0,
  "strengths": ["specific strength"],
  "missing": ["specific missing behavior"],
  "rationale": "one sentence"
}

Pass should be true only if score >= ${input.minScore}.

Recent history:
${input.history}

Latest user message:
${input.userMessage}

Expected behavior:
${input.expectedQuality}

Must avoid:
${input.mustAvoid.map((entry) => "- " + entry).join("\n")}

Final assistant response:
${input.thinking || "(empty response — system returned no thinking)"}

JSON:
`

export async function judgeThinking(
  provider: LLMProvider,
  input: JudgeInput,
  model?: { providerID: string; modelID: string },
): Promise<JudgeResult> {
  const startedAt = Date.now()
  try {
    const response = await provider.complete({
      system: "You are a strict black-box judge for a main coding agent reaction. Always respond with valid JSON.",
      messages: [{ role: "user", content: JUDGE_PROMPT(input) }],
      ...(model ? { model } : {}),
    })
    const parsed = parseJudgeResponse(response.content)
    return {
      ...parsed,
      pass: parsed.score >= input.minScore,
      raw: response.content,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      score: 0,
      pass: false,
      valueAdded: 0,
      strengths: [],
      missing: ["judge failed"],
      rationale: "judge failed: " + (error instanceof Error ? error.message : String(error)),
      raw: "",
      latencyMs: Date.now() - startedAt,
    }
  }
}

function parseJudgeResponse(content: string): { score: number; valueAdded: number; strengths: string[]; missing: string[]; rationale: string } {
  const codeFence = String.fromCharCode(96, 96, 96)
  const stripped = content
    .replace(new RegExp("^" + codeFence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp(codeFence + "\\s*$", "i"), "")
    .trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  const text = match ? match[0] : stripped
  try {
    const parsed = JSON.parse(text) as {
      score?: number
      valueAdded?: number
      strengths?: string[]
      missing?: string[]
      rationale?: string
    }
    return {
      score: typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0,
      valueAdded: typeof parsed.valueAdded === "number" ? Math.max(0, Math.min(5, Math.floor(parsed.valueAdded))) : 0,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "no reason given",
    }
  } catch {
    return { score: 0, valueAdded: 0, strengths: [], missing: ["judge returned non-JSON"], rationale: "judge returned non-JSON: " + text.slice(0, 200) }
  }
}
