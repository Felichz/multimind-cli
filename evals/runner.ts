/**
 * Reaction eval runner — drives the thinking pipeline against a dataset
 * of test cases and scores each one with an LLM-as-judge.
 *
 * Usage:
 *   bun run evals/runner.ts                          # run all cases
 *   bun run evals/runner.ts --case REACT-001         # run one case
 *   bun run evals/runner.ts --limit 5                # run first 5
 *   bun run evals/runner.ts --no-judge               # skip the LLM judge
 *   bun run evals/runner.ts --output report.json     # write full report
 *
 * The runner is intentionally a thin orchestrator. The thinking happens
 * in `runThinkingPipeline`, the scoring in `judgeThinking`, the data
 * is just JSONL on disk. No external orchestration needed.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { judgeThinking } from "../src/judge"
import { OpenAICompatProvider } from "../src/llm/openai-compat"
import type { LLMProvider } from "../src/llm/provider"
import { runThinkingPipeline } from "../src/pipeline/run"
import type { ThinkingInput } from "../src/types"

const ROOT = path.join(import.meta.dir, "..")
const DATASET = path.join(ROOT, "evals", "dataset.jsonl")
const PROMPTS_DIR = path.join(ROOT, "src", "prompts")
const RUNS_DIR = path.join(ROOT, "evals", "runs")
const REPORT_DIR = path.join(ROOT, "evals", "reports")

type Case = {
  id: string
  focus: string
  sourceCases: string[]
  history: string
  userMessage: string
  expectedQuality: string
  mustAvoid: string[]
  minScore: number
}

type CaseResult = {
  caseID: string
  pass: boolean
  score: number
  minScore: number
  routerDecision: "ACTIVATE" | "SKIP"
  workersFired: string[]
  workerOutputs: Record<string, string>
  judgeReason: string
  judgeMissing: string[]
  pipelineMs: number
  judgeMs: number
  totalMs: number
  thinking: string
  error?: string
}

type Report = {
  startedAt: number
  finishedAt: number
  totalCases: number
  passed: number
  failed: number
  passRate: number
  meanScore: number
  medianScore: number
  results: CaseResult[]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await mkdir(RUNS_DIR, { recursive: true })
  await mkdir(REPORT_DIR, { recursive: true })

  const cases = await loadCases(DATASET, args)
  console.error(`Loaded ${cases.length} cases from ${path.relative(ROOT, DATASET)}`)

  const provider = new OpenAICompatProvider()
  console.error(`Provider: ${provider.name}`)

  const startedAt = Date.now()
  const results: CaseResult[] = []
  for (const [index, testCase] of cases.entries()) {
    const result = await runCase(testCase, provider, args.noJudge)
    results.push(result)
    const status = result.pass ? "PASS" : "FAIL"
    console.error(
      `[${index + 1}/${cases.length}] ${status} ${result.caseID} score=${result.score} workers=[${result.workersFired.join(",")}]`,
    )
  }
  const finishedAt = Date.now()

  const report = buildReport(results, startedAt, finishedAt)
  printSummary(report)

  if (args.output) {
    const outPath = path.resolve(args.output)
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
    console.error(`Report written to ${outPath}`)
  }

  process.exit(report.passRate >= 0.8 ? 0 : 1)
}

type Args = { case?: string; limit?: number; noJudge: boolean; output?: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { noJudge: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === "--case") args.case = argv[++i]
    else if (flag === "--limit") args.limit = Number(argv[++i])
    else if (flag === "--no-judge") args.noJudge = true
    else if (flag === "--output") args.output = argv[++i]
    else if (flag === "--help" || flag === "-h") {
      console.log("Usage: bun run evals/runner.ts [--case ID] [--limit N] [--no-judge] [--output file.json]")
      process.exit(0)
    }
  }
  return args
}

async function loadCases(dataset: string, args: Args): Promise<Case[]> {
  const text = await readFile(dataset, "utf8")
  const all = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Case)
  const filtered = args.case ? all.filter((c) => c.id === args.case) : all
  return args.limit ? filtered.slice(0, args.limit) : filtered
}

async function runCase(testCase: Case, provider: LLMProvider, skipJudge: boolean): Promise<CaseResult> {
  const startedAt = Date.now()
  const input = buildInput(testCase)

  let pipelineResult: Awaited<ReturnType<typeof runThinkingPipeline>>
  try {
    pipelineResult = await runThinkingPipeline(input, provider, {
      promptsDir: PROMPTS_DIR,
      runsDir: RUNS_DIR,
    })
  } catch (error) {
    return {
      caseID: testCase.id,
      pass: false,
      score: 0,
      minScore: testCase.minScore,
      routerDecision: "SKIP",
      workersFired: [],
      workerOutputs: {},
      judgeReason: "pipeline error",
      judgeMissing: [],
      pipelineMs: 0,
      judgeMs: 0,
      totalMs: Date.now() - startedAt,
      thinking: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }

  // The pipeline produces a heads-up. The CLI is for thinking, not for
  // answering. The judge scores the heads-up directly — that is the
  // CLI's output, and the consumer is responsible for any further
  // post-processing (synthesis, UI, etc.).
  const pipelineMs = pipelineResult.meta.totalDurationMs
  let score = pipelineResult.headsUp ? (pipelineResult.headsUp.length > 50 ? 80 : 30) : 0
  let judgeReason = skipJudge ? "judge skipped" : "(no judge)"
  let judgeMissing: string[] = []

  if (!skipJudge && pipelineResult.headsUp) {
    const judgeResult = await judgeThinking(provider, {
      caseID: testCase.id,
      thinking: pipelineResult.headsUp,
      expectedQuality: testCase.expectedQuality,
      mustAvoid: testCase.mustAvoid,
      userMessage: testCase.userMessage,
      history: testCase.history,
      minScore: testCase.minScore,
    })
    score = judgeResult.score
    judgeReason = judgeResult.rationale
    judgeMissing = judgeResult.missing
  }

  const workersFired = Object.keys(pipelineResult.workers)
  const workerOutputs = Object.fromEntries(
    Object.entries(pipelineResult.workers).map(([k, w]) => [k, w.output]),
  )

  return {
    caseID: testCase.id,
    pass: score >= testCase.minScore,
    score,
    minScore: testCase.minScore,
    routerDecision: pipelineResult.meta.routerDecision,
    workersFired,
    workerOutputs,
    judgeReason,
    judgeMissing,
    pipelineMs,
    judgeMs: 0,
    totalMs: Date.now() - startedAt,
    thinking: pipelineResult.headsUp,
  }
}

function buildInput(testCase: Case): ThinkingInput {
  // The dataset's `history` is a pre-formatted string like "[Assistant]: foo\n[User]: bar".
  // We split on role markers and build a proper Message[].
  const messages = parseHistory(testCase.history)
  messages.push({
    info: { id: `u_${testCase.id}`, role: "user", time: { created: messages.length + 1 } },
    parts: [{ type: "text", text: testCase.userMessage }],
  })
  messages.push({
    info: { id: `a_${testCase.id}`, role: "assistant", time: { created: messages.length + 2 } },
    parts: [{ type: "text", text: "(pending response — eval runner will run thinking instead)" }],
  })
  return { history: messages, sessionID: `eval-${testCase.id}` }
}

function parseHistory(formatted: string): ThinkingInput["history"] {
  const lines = formatted.split("\n")
  const messages: ThinkingInput["history"] = []
  let current: { role: "user" | "assistant"; text: string[] } | undefined
  let counter = 0
  for (const line of lines) {
    const userMatch = line.match(/^\[User\]:\s*(.*)$/)
    const assistantMatch = line.match(/^\[Assistant\]:\s*(.*)$/)
    if (userMatch) {
      if (current) {
        messages.push({
          info: { id: `m_${counter++}`, role: current.role, time: { created: counter } },
          parts: [{ type: "text", text: current.text.join("\n") }],
        })
      }
      current = { role: "user", text: [userMatch[1]] }
    } else if (assistantMatch) {
      if (current) {
        messages.push({
          info: { id: `m_${counter++}`, role: current.role, time: { created: counter } },
          parts: [{ type: "text", text: current.text.join("\n") }],
        })
      }
      current = { role: "assistant", text: [assistantMatch[1]] }
    } else if (current) {
      current.text.push(line)
    }
  }
  if (current) {
    messages.push({
      info: { id: `m_${counter++}`, role: current.role, time: { created: counter } },
      parts: [{ type: "text", text: current.text.join("\n") }],
    })
  }
  return messages
}

function buildReport(results: CaseResult[], startedAt: number, finishedAt: number): Report {
  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  const scores = results.map((r) => r.score).sort((a, b) => a - b)
  const mean = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0
  return {
    startedAt,
    finishedAt,
    totalCases: results.length,
    passed,
    failed,
    passRate: results.length ? passed / results.length : 0,
    meanScore: Math.round(mean),
    medianScore: median,
    results,
  }
}

function printSummary(report: Report) {
  console.error("")
  console.error("=== Eval Summary ===")
  console.error(`Cases:     ${report.totalCases}`)
  console.error(`Passed:    ${report.passed} (${(report.passRate * 100).toFixed(1)}%)`)
  console.error(`Failed:    ${report.failed}`)
  console.error(`Mean:      ${report.meanScore}`)
  console.error(`Median:    ${report.medianScore}`)
  console.error(`Duration:  ${((report.finishedAt - report.startedAt) / 1000).toFixed(1)}s`)
  console.error("")
  for (const result of report.results) {
    const status = result.pass ? "✓" : "✗"
    console.error(
      `${status} ${result.caseID} score=${result.score} min=${result.minScore} workers=[${result.workersFired.join(",")}]`,
    )
    if (!result.pass) console.error(`   reason: ${result.judgeReason}`)
  }
}

main().catch((error) => {
  console.error("eval failed:", error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
