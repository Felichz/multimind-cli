/**
 * Pipeline orchestrator — the core "thinking" function.
 *
 * What the harness does:
 *   1. Read config and validate input
 *   2. Build the W0 router prompt and call the LLM
 *   3. Parse STATUS: ACTIVATE/SKIP and WORKERS
 *   4. If ACTIVATE, run the selected workers in parallel
 *   5. Post-process via the research and evolution engines
 *   6. If C0 is available, run the synthesizer
 *   7. Consolidate the worker outputs into a delivery block
 *   8. Return the thinking output
 *
 * The pipeline is stateless: each invocation is a fresh think. The caller
 * decides when to think (slash command, cron, scripted trigger, etc.).
 */

import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { LLMProvider } from "../llm/provider"
import {
  consolidateForMainAgent,
  consolidateSynthesizerForMainAgent,
  consolidateWithDistilledWorkerKernels,
  parseDistilledWorkerKernels,
  type ConsolidatorInsight,
} from "../consolidator"
import { hasResearchTriggers, processResearchTriggers } from "../engines/research-engine"
import { hasEvolutionTriggers, processEvolutionTriggers } from "../engines/evolution-engine"
import {
  addDebugEvent,
  createDebugRun,
  finishDebugWorker,
  setDebugStatus,
  startDebugWorker,
  writeDebugRun,
  writeWorkerOutputDebug,
  type DebugRun,
} from "../debug-store"
import {
  DEFAULT_CONFIG,
  type C0Decision,
  type Message,
  type SubconsciousConfig,
  type ThinkingInput,
  type ThinkingOutput,
  type WorkerResult,
} from "../types"

const PROMPTS_DIR = path.join(import.meta.dir, "..", "prompts")
const DEFAULT_TIMEOUT_MS = 120_000

export type PipelineOptions = {
  promptsDir?: string
  runsDir?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export async function runThinkingPipeline(
  input: ThinkingInput,
  provider: LLMProvider,
  options: PipelineOptions = {},
): Promise<ThinkingOutput> {
  const startedAt = Date.now()
  const config = { ...DEFAULT_CONFIG, ...input.config }
  const promptsDir = options.promptsDir ?? PROMPTS_DIR
  const runsDir = options.runsDir ?? path.join(process.cwd(), ".multimind", "runs")
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (config.enabled === false) {
    return { ...emptyOutput("disabled", startedAt) }
  }

  await mkdir(runsDir, { recursive: true })

  const messages = input.history
  const lastAssistant = latestMessage(messages, "assistant")
  const lastUser = latestMessage(messages, "user")
  const lastRealUser = latestMessage(messages, "user", false)

  if (!lastAssistant || !lastUser || !lastRealUser) {
    return { ...emptyOutput("no_complete_exchange", startedAt) }
  }
  if (isInjectedContext(lastUser)) {
    return { ...emptyOutput("injection_recent", startedAt) }
  }
  if (lastAssistant.info.time.created < lastRealUser.info.time.created) {
    return { ...emptyOutput("assistant_pending", startedAt) }
  }

  const run = createDebugRun({
    sessionID: input.sessionID ?? "cli",
    assistantMessageID: lastAssistant.info.id,
    userMessageID: lastRealUser.info.id,
    messageCount: messages.length,
  })

  const model = parseModel(input.model ?? config.model ?? "opencode-go/minimax-m3")

  // 1. W0 router
  const w0Prompt = await loadPrompt(promptsDir, "W0_ROUTER.md")
  if (!w0Prompt) {
    setDebugStatus(run, "error", "W0_ROUTER.md missing")
    await writeDebugRun(runsDir, run)
    return { ...emptyOutput("w0_missing", startedAt), runRecordPath: runRecordPath(runsDir, run) }
  }

  const recentHistory = formatHistory(messages)
  addDebugEvent(run, "routing", "Starting W0 router", { model: `${model.providerID}/${model.modelID}` })
  await writeDebugRun(runsDir, run)

  const rawW0 = await callProvider(provider, w0Prompt, recentHistory, model, timeoutMs, options.signal)
  const w0Output = /STATUS:\s*(ACTIVATE|SKIP)/i.test(rawW0)
    ? rawW0
    : await callProvider(
        provider,
        `${w0Prompt}\n\nYour previous router output was empty or malformed. Return only:\n\nSTATUS: ACTIVATE\nWORKERS: W1, W3\nCONTEXT: <two or three sentences>\n\nor:\n\nSTATUS: SKIP\nREASON: <one sentence>`,
        recentHistory,
        model,
        timeoutMs,
        options.signal,
      )
  setDebugStatus(run, "running", "W0 router complete")
  await writeDebugRun(runsDir, run)

  if (!/STATUS:\s*ACTIVATE/i.test(w0Output)) {
    setDebugStatus(run, "skipped", "W0 declined to activate", { reason: extractReason(w0Output) })
    await writeDebugRun(runsDir, run)
    return { ...emptyOutput("skipped", startedAt), runRecordPath: runRecordPath(runsDir, run) }
  }

  // 2. Discover and run selected workers
  const workerFiles = await discoverWorkers(promptsDir)
  const selectedKeys = pickWorkers(w0Output, workerFiles, input.workers)
  if (selectedKeys.length === 0) {
    setDebugStatus(run, "skipped", "No workers selected")
    await writeDebugRun(runsDir, run)
    return { ...emptyOutput("no_workers", startedAt), runRecordPath: runRecordPath(runsDir, run) }
  }

  addDebugEvent(run, "workers", `Running ${selectedKeys.length} workers`, { workers: selectedKeys })
  await writeDebugRun(runsDir, run)

  const workerResults = await Promise.all(
    selectedKeys.map((key) =>
      runWorker(provider, key, workerFiles[key], recentHistory, w0Output, model, run, runsDir, promptsDir, timeoutMs, options.signal),
    ),
  )

  // 3. Engines (research, evolution)
  const insights: ConsolidatorInsight[] = workerResults.map((worker) => ({ key: worker.key, name: worker.name, output: worker.output }))
  if (config.research !== false && hasResearchTriggers(insights)) {
    const researchNotes = await processResearchTriggers(insights, promptsDir, provider, model)
    addDebugEvent(run, "research", "Processed research triggers", { count: researchNotes.length })
    await writeDebugRun(runsDir, run)
  }
  if (config.evolution !== false && hasEvolutionTriggers(insights)) {
    const { notes } = await processEvolutionTriggers(insights, promptsDir, provider, model, runsDir)
    addDebugEvent(run, "evolving", "Processed evolution triggers", { notes: notes.length })
    await writeDebugRun(runsDir, run)
  }

  // 4. C0 synthesizer
  let c0Output = ""
  let c0Decision: C0Decision = "missing"
  if (config.synthesizer !== false) {
    const c0Prompt = await loadPrompt(promptsDir, "C0_SYNTHESIZER.md")
    if (c0Prompt) {
      c0Output = await callProvider(
        provider,
        c0Prompt,
        buildC0Context(workerResults, recentHistory),
        model,
        timeoutMs,
        options.signal,
      )
      c0Decision = parseC0Decision(c0Output)
      addDebugEvent(run, "synthesizing", "C0 synthesizer complete", { decision: c0Decision })
      await writeDebugRun(runsDir, run)
    }
  }

  // 5. Consolidate
  const consolidated = (() => {
    if (c0Output) return consolidateSynthesizerForMainAgent({ synthesis: c0Output, insights })
    if (config.distilledKernels !== false) {
      const kernels = parseDistilledWorkerKernels(loadFileSync(path.join(promptsDir, "worker-kernels.md")))
      return consolidateWithDistilledWorkerKernels({ insights, kernels })
    }
    return consolidateForMainAgent(insights)
  })()

  setDebugStatus(run, "done", "Pipeline complete", { workers: workerResults.length, c0: c0Decision })
  await writeDebugRun(runsDir, run)

  return {
    thinking: consolidated,
    workers: workerResults,
    routerDecision: "ACTIVATE",
    c0Decision,
    notes: [],
    totalDurationMs: Date.now() - startedAt,
    runRecordPath: runRecordPath(runsDir, run),
  }
}

// ---------- helpers ----------

function emptyOutput(reason: string, startedAt: number): ThinkingOutput {
  return {
    thinking: "",
    workers: [],
    routerDecision: "SKIP",
    notes: [reason],
    totalDurationMs: Date.now() - startedAt,
  }
}

function latestMessage(messages: Message[], role: "user" | "assistant", includeSynthetic = true): Message | undefined {
  return messages
    .filter((message) => message.info.role === role)
    .filter((message) => includeSynthetic || !isInjectedContext(message))
    .at(-1)
}

function isInjectedContext(message: Message): boolean {
  return message.parts.some((part) => part.type === "text" && part.metadata?.source === "multimind")
}

function formatHistory(messages: Message[]): string {
  return messages
    .filter((message) => !isInjectedContext(message))
    .slice(-10)
    .map((message) => {
      const role = message.info.role === "user" ? "User" : "Assistant"
      const text = message.parts
        .filter((part) => part.type === "text")
        .filter((part) => !part.synthetic && !part.ignored)
        .map((part) => part.text)
        .join("")
      return `[${role}]: ${text}`
    })
    .join("\n\n")
}

async function loadPrompt(promptsDir: string, name: string): Promise<string | undefined> {
  const file = Bun.file(path.join(promptsDir, name))
  if (!(await file.exists())) return undefined
  return (await file.text()).trim() || undefined
}

function loadFileSync(path: string): string {
  try {
    return require("node:fs").readFileSync(path, "utf8")
  } catch {
    return ""
  }
}

function parseModel(raw: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = raw.split("/")
  return { providerID, modelID: rest.join("/") }
}

async function discoverWorkers(promptsDir: string): Promise<Record<string, string>> {
  const glob = new Bun.Glob("W*.md")
  const files: string[] = []
  for await (const file of glob.scan({ cwd: promptsDir })) files.push(file)
  const out: Record<string, string> = {}
  for (const file of files) {
    const match = file.match(/^(W\d+)_/)
    if (!match || match[1] === "W0") continue
    out[match[1]] = file
  }
  return out
}

function pickWorkers(w0Output: string, workerFiles: Record<string, string>, override?: string[]): string[] {
  if (override && override.length) {
    return override.filter((key) => workerFiles[key])
  }
  const searchArea = w0Output.match(/WORKERS:\s*(.+)/i)?.[1] ?? w0Output
  const ordered = Array.from(new Set((searchArea.match(/\bW\d+\b/gi) ?? []).map((k) => k.toUpperCase())))
  if (ordered.length) return ordered.filter((key) => workerFiles[key])
  return Object.keys(workerFiles).filter((key) => new RegExp(`\\b${key}(?:\\b|_)`, "i").test(searchArea))
}

function extractReason(output: string): string {
  return output.match(/REASON:\s*(.+)/i)?.[1]?.trim() ?? "no reason given"
}

function parseC0Decision(output: string): C0Decision {
  const final = output.trimEnd().split("\n").at(-1)?.trim().toLowerCase() ?? ""
  if (final === "[multimind:safe_to_end]" || final === "multimind:safe_to_end") return "safe_to_end"
  if (final === "[multimind:continue]" || final === "multimind:continue") return "continue"
  if (final === "[multimind:blocked]" || final === "multimind:blocked") return "blocked"
  return "missing"
}

function buildC0Context(workerResults: WorkerResult[], history: string): string {
  const workerBlock = workerResults.map((worker) => `=== ${worker.key} (${worker.name}) ===\n${worker.output}`).join("\n\n")
  return `Recent history:\n${history}\n\nWorker outputs:\n${workerBlock}`
}

async function callProvider(
  provider: LLMProvider,
  system: string,
  user: string,
  model: { providerID: string; modelID: string },
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  const response = await provider.complete(
    { system, messages: [{ role: "user", content: user }], model },
    signal ?? AbortSignal.timeout(timeoutMs),
  )
  return response.content
}

async function runWorker(
  provider: LLMProvider,
  key: string,
  filename: string | undefined,
  historyContext: string,
  w0Context: string,
  model: { providerID: string; modelID: string },
  run: DebugRun,
  runsDir: string,
  promptsDir: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<WorkerResult> {
  const startedAt = Date.now()
  if (!filename) {
    return { key, name: key, output: "", durationMs: 0, usage: { inputTokens: 0, outputTokens: 0 }, error: "prompt_missing" }
  }
  const promptText = await loadPrompt(promptsDir, filename)
  if (!promptText) {
    return { key, name: filename, output: "", durationMs: 0, usage: { inputTokens: 0, outputTokens: 0 }, error: "prompt_missing" }
  }

  const displayName = filename.replace(/^W\d+_/, "").replace(".md", "").replaceAll("_", " ")
  const title = `multimind-${key.toLowerCase()}`
  const debugID = startDebugWorker(run, { key, name: displayName, title, tools: ["read", "grep", "glob"] })
  await writeDebugRun(runsDir, run)

  try {
    const output = await callProvider(
      provider,
      promptText,
      `${historyContext}\n\nRouter context: ${w0Context}`,
      model,
      timeoutMs,
      signal,
    )
    finishDebugWorker(run, debugID, output)
    await writeWorkerOutputDebug(runsDir, run, debugID, output)
    await writeDebugRun(runsDir, run)
    return { key, name: displayName, output, durationMs: Date.now() - startedAt, usage: { inputTokens: 0, outputTokens: 0 } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    finishDebugWorker(run, debugID, "")
    await writeDebugRun(runsDir, run)
    return { key, name: displayName, output: "", durationMs: Date.now() - startedAt, usage: { inputTokens: 0, outputTokens: 0 }, error: message }
  }
}

function runRecordPath(runsDir: string, run: DebugRun): string {
  return path.join(runsDir, `${run.startedAt}-${run.id}.json`)
}
