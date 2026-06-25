/**
 * Router-only eval harness.
 *
 * Isolates the W0 router call from the rest of the pipeline. For each
 * case in the dataset, it loads the current W0 prompt, makes the same
 * one or two LLM calls that the pipeline does, and reports whether the
 * router produced a usable decision (SKIP, ACTIVATE+WORKERS,
 * ACTIVATE+no-workers, or invalid).
 *
 * This is faster and cheaper than a full pipeline sweep: ~1 LLM call
 * per case (2 if the first one returns no STATUS line). Use it to
 * iterate on the W0 prompt without spending hours on the full sweep.
 *
 * Usage:
 *   bun run evals/router-only.ts
 *   bun run evals/router-only.ts --cases REACT-001,REACT-013
 *   bun run evals/router-only.ts --problematic
 *   bun run evals/router-only.ts --repeat 3
 *   bun run evals/router-only.ts --output evals/runs/router-v1.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { OpenAICompatProvider } from "../src/llm/openai-compat"
import type { LLMProvider } from "../src/llm/provider"

const ROOT = path.join(import.meta.dir, "..")
const DATASET = path.join(ROOT, "evals", "dataset.jsonl")
const PROMPTS_DIR = path.join(ROOT, "src", "prompts")
const PROMPTS_EXT_DIR = path.join(ROOT, "src", "prompts-extensions")

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

type RouterExit = "skip" | "activate_with_workers" | "activate_no_workers" | "router_invalid"

type TrialResult = {
  caseID: string
  trial: number
  exit: RouterExit
  status: "ACTIVATE" | "SKIP" | "INVALID"
  workers: string[]
  reason: string
  attempts: number
  latencyMs: number
  rawPreview: string
  rawFull: string
  rawLength: number
}

type Aggregate = {
  total: number
  skip: number
  activate_with_workers: number
  activate_no_workers: number
  router_invalid: number
  pass_rate: number
  mean_latency_ms: number
}

const V15_DROPS = [
  "REACT-006", "REACT-007", "REACT-013", "REACT-017", "REACT-018",
  "REACT-019", "REACT-022", "REACT-041", "REACT-048",
]

function parseArgs(argv: string[]) {
  const out: { cases?: string[]; repeat: number; output?: string; promptPath?: string } = { repeat: 1 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--cases") out.cases = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    else if (a === "--problematic") out.cases = V15_DROPS
    else if (a === "--repeat") out.repeat = Math.max(1, Number(argv[++i] ?? "1"))
    else if (a === "--output") out.output = argv[++i]
    else if (a === "--prompt") out.promptPath = argv[++i]
  }
  return out
}

function extractStatus(output: string): "ACTIVATE" | "SKIP" | null {
  const m = output.match(/STATUS:\s*(ACTIVATE|SKIP)/i)
  return m ? (m[1].toUpperCase() as "ACTIVATE" | "SKIP") : null
}

function extractWorkers(output: string): string[] {
  const search = output.match(/^WORKERS:\s*(.+)$/m)?.[1] ?? output.match(/WORKERS:\s*(.+)/)?.[1] ?? output
  const ordered = Array.from(new Set((search.match(/\bW\d+\b/g) ?? []).map((k) => k.toUpperCase())))
  return ordered
}

function extractReason(output: string): string {
  return output.match(/REASON:\s*(.+)/i)?.[1]?.trim() ?? ""
}

function parseModel(raw: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = raw.split("/")
  return { providerID, modelID: rest.join("/") }
}

async function loadFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return ""
  return (await file.text()).trim()
}

async function loadW0Prompt(): Promise<string> {
  const core = await loadFile(path.join(PROMPTS_DIR, "W0_ROUTER.md"))
  const ext = await loadFile(path.join(PROMPTS_EXT_DIR, "W0_ROUTER.md"))
  return [core, ext ? `\n\n--- SYSTEM EXTENSIONS & USER REFINEMENTS ---\n${ext}` : ""].join("").trim()
}

async function callProvider(
  provider: LLMProvider,
  user: string,
  model: ReturnType<typeof parseModel>,
  timeoutMs: number,
): Promise<{ content: string; ms: number }> {
  const started = Date.now()
  const response = await provider.complete(
    { system: "", messages: [{ role: "user", content: user }], model, maxTokens: 8000 },
    AbortSignal.timeout(timeoutMs),
  )
  return { content: response.content, ms: Date.now() - started }
}

async function loadCases(ids?: string[]): Promise<Case[]> {
  const raw = await readFile(DATASET, "utf8")
  const all = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Case)
  if (!ids?.length) return all
  const set = new Set(ids)
  return all.filter((c) => set.has(c.id))
}

function summarize(trials: TrialResult[]): Aggregate {
  const total = trials.length
  const skip = trials.filter((t) => t.exit === "skip").length
  const aw = trials.filter((t) => t.exit === "activate_with_workers").length
  const anw = trials.filter((t) => t.exit === "activate_no_workers").length
  const inv = trials.filter((t) => t.exit === "router_invalid").length
  const meanLat = total ? trials.reduce((s, t) => s + t.latencyMs, 0) / total : 0
  return {
    total,
    skip,
    activate_with_workers: aw,
    activate_no_workers: anw,
    router_invalid: inv,
    pass_rate: total ? (aw / total) : 0,
    mean_latency_ms: Math.round(meanLat),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cases = await loadCases(args.cases)
  if (!cases.length) {
    console.error("No cases matched.")
    process.exit(1)
  }

  const provider = new OpenAICompatProvider()
  let w0: string
  if (args.promptPath) {
    w0 = await readFile(path.resolve(ROOT, args.promptPath), "utf8")
  } else {
    w0 = await loadW0Prompt()
  }
  if (!w0) {
    console.error("Could not load W0 prompt.")
    process.exit(1)
  }
  const model = parseModel("opencode-go/minimax-m3")

  console.error(`Loaded ${cases.length} cases. W0 prompt: ${w0.length} chars. Model: ${model.providerID}/${model.modelID}. Trials per case: ${args.repeat}.`)

  const trials: TrialResult[] = []
  for (const c of cases) {
    for (let t = 1; t <= args.repeat; t++) {
      const history = c.history ? c.history + "\n" + c.userMessage : c.userMessage
      const initialUser = `${w0}\n\nRecent conversation history:\n${history}\n\nDecide whether background thinking is useful. If yes, output STATUS: ACTIVATE and WORKERS.`
      const retrySuffix = `\n\nYour previous router output was empty or malformed. Return only the router contract:\n\nSTATUS: ACTIVATE\nWORKERS: W1, W3\nCONTEXT: <two or three sentences>\n\nor:\n\nSTATUS: SKIP\nREASON: <one sentence>`

      let attempts = 0
      let content = ""
      let totalMs = 0
      try {
        attempts = 1
        const r1 = await callProvider(provider, initialUser, model, 600_000)
        content = r1.content
        totalMs += r1.ms
        if (!extractStatus(content)) {
          attempts = 2
          const r2 = await callProvider(provider, initialUser + retrySuffix, model, 600_000)
          content = r2.content
          totalMs += r2.ms
        }
      } catch (e) {
        content = `[error] ${(e as Error).message}`
      }

      const status = extractStatus(content)
      const workers = status === "ACTIVATE" ? extractWorkers(content) : []
      const reason = extractReason(content)
      let exit: RouterExit
      if (status === "SKIP") exit = "skip"
      else if (status === "ACTIVATE" && workers.length > 0) exit = "activate_with_workers"
      else if (status === "ACTIVATE") exit = "activate_no_workers"
      else exit = "router_invalid"

      trials.push({
        caseID: c.id,
        trial: t,
        exit,
        status: status ?? "INVALID",
        workers,
        reason,
        attempts,
        latencyMs: totalMs,
        rawPreview: content.slice(0, 400),
        rawFull: content,
        rawLength: content.length,
      })
      process.stderr.write(`  ${c.id} trial ${t}/${args.repeat}: ${exit} (${workers.length || 0} workers, ${totalMs}ms, ${attempts} attempt(s))\n`)
    }
  }

  const agg = summarize(trials)
  const out = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    promptLength: w0.length,
    cases: cases.map((c) => c.id),
    trialsPerCase: args.repeat,
    aggregate: agg,
    byCase: Object.fromEntries(
      Array.from(new Set(trials.map((t) => t.caseID))).map((id) => [
        id,
        trials.filter((t) => t.caseID === id),
      ]),
    ),
  }

  if (args.output) {
    await mkdir(path.dirname(args.output), { recursive: true })
    await writeFile(args.output, JSON.stringify(out, null, 2))
    console.error(`Wrote ${args.output}`)
  } else {
    console.log(JSON.stringify(out, null, 2))
  }

  process.stderr.write(`\nAggregate: ${JSON.stringify(agg)}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
