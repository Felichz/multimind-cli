/**
 * LLM-as-judge scorer for the thinking pipeline.
 *
 * The input is a "Heads-Up" — the structured thinking the
 * CLI returns from `runThinkingPipeline`. It is private context for a
 * downstream LLM (the consumer), not a user-facing response. The judge
 * scores whether the thinking:
 *
 *   1. Identifies the right risks, gaps, and missed professional steps
 *   2. Names concrete evidence gates, file paths, and decision criteria
 *   3. Reduces cognitive load on whoever reads it
 *   4. Avoids the must-avoid failure modes
 *
 * The judge does NOT score user-facing polish (length, tone, format).
 * The CLI returns thinking; the consumer turns it into a response.
 * The CLI's job ends at the thinking. The judge tests that job.
 *
 * This is the same calibrated rubric that scored 84-94 on the
 * standalone (synthesis-free) case in the opencode monorepo, adapted
 * to score the heads-up directly instead of the synthesized response.
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

const JUDGE_PROMPT = (
  input: JudgeInput,
): string => `You are a strict black-box judge for a "Heads-Up" produced by the multimind thinking pipeline.

The heads-up is private, structured context that a downstream LLM (the consumer) will read to produce a user-facing response. It is not a response to the user. Judge it on whether it equips a senior engineer to act, not on whether it is polite, brief, or user-facing.

Benchmark setup for the judge:
- The heads-up is produced by running a small set of cognitive lenses (W0 routing, W1-W17 workers, C0 synthesis) over the conversation. The consumer is responsible for any synthesis into a user-facing message.
- A strong heads-up names concrete risks, gaps, evidence gates, file paths, command pairs, decision criteria, and next steps — even when those things have not been verified yet.
- Heads-ups are intentionally long and structured. Do not penalize length. Penalize vagueness, missing professional steps, and reliance on user cognitive load to fill gaps.
- "I would find the eval/test/logs later" is a failure. A clearly marked plausible target slot, ready-to-add artifact shape, or named protocol is a pass.
- The heads-up may include worker names, C0 markers (safe_to_end / continue / blocked), and meta-process language. These are private to the consumer; do not penalize them.

Score on a 0-100 scale:
- 0-9: harmful, evasive, or actively contrary to the expected behavior.
- 10-24: mostly misses the point; may contain generic agreement but no useful professional action.
- 25-39: weakly related; catches a surface issue but misses the main principle or professional operating method.
- 40-59: partial; identifies the theme but leaves major gaps, vague next steps, or too much cognitive load on the consumer.
- 60-74: decent but not pass-worthy; useful content with at least one critical missing behavior or risk.
- 75-84: solid but below a strong gate; covers much of the expected behavior but still lacks some professional completeness, evidence, or autonomy.
- 85-95: strong pass; situated, autonomous, calibrated, low-friction, and clearly explains why the approach is professional.
- 96-100: exceptional top 5%; all strong-pass criteria plus additional useful value beyond the expected behavior.

Value-added bonus:
- If score is 96-100, set "valueAdded" to score - 95, an integer from 1 to 5.
- Award this only for concrete extra value: a better iteration strategy, sharper risk gate, clearer debug evidence, or a lower-friction path that was not explicitly demanded.
- If score is below 96, valueAdded must be 0.

Strictness rules:
- Do not award 80+ if the heads-up violates any must-avoid item.
- Do not award 80+ for merely repeating the user's correction back without an operational plan.
- Do not award 90+ unless the heads-up shows professional autonomy: it reduces consumer cognitive load, defines evidence gates, and makes the next step clear.
- Apply eval/self-improvement artifact requirements only when the Expected behavior or latest user message explicitly asks for evals, tests, benchmarks, readiness, proof, implementation verification, or system improvement artifacts. Do not apply them to user-facing cognitive-load/debug handoff cases whose expected behavior is a screenshot/status/checklist/PR-link workflow.
- For true eval/self-improvement cases, do not award 85+ unless the heads-up includes an operational loop: fail-first artifact or target slot, expected baseline failure, same-case before/after rerun, quick regression gate, and run metadata. The path may be marked unverified when verification is unavailable.
- Do not award 90+ for true eval/self-improvement cases unless the heads-up names the first artifact, includes a ready-to-add artifact shape, states a decision table for accept/reject/regression outcomes, and provides a run-record template or equivalent metadata capture plan.
- Do not award 96+ unless the heads-up adds concrete extra leverage beyond pass: sharper artifact naming, lower-friction evidence, clearer rollback/stop conditions, or a better fast-vs-full test strategy.
- Prefer lower scores when the heads-up sounds polished but does not materially improve the delivery workflow.

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
${input.mustAvoid.map((entry) => `- ${entry}`).join("\n")}

Heads-up:
${input.thinking || "(empty heads-up — pipeline returned no thinking)"}

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
      system:
        "You are a strict black-box judge for a main coding agent reaction. Always respond with valid JSON.",
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
      rationale: `judge failed: ${error instanceof Error ? error.message : String(error)}`,
      raw: "",
      latencyMs: Date.now() - startedAt,
    }
  }
}

export function parseJudgeResponse(content: string): {
  score: number
  valueAdded: number
  strengths: string[]
  missing: string[]
  rationale: string
} {
  const codeFence = String.fromCharCode(96, 96, 96)
  const stripped = content
    .replace(new RegExp(`^${codeFence}(?:json)?\\s*`, "i"), "")
    .replace(new RegExp(`${codeFence}\\s*$`, "i"), "")
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
      valueAdded:
        typeof parsed.valueAdded === "number" ? Math.max(0, Math.min(5, Math.floor(parsed.valueAdded))) : 0,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "no reason given",
    }
  } catch {
    return {
      score: 0,
      valueAdded: 0,
      strengths: [],
      missing: ["judge returned non-JSON"],
      rationale: `judge returned non-JSON: ${text.slice(0, 200)}`,
    }
  }
}
