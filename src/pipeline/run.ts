/**
 * Pipeline orchestrator — the core "thinking" function.
 *
 * Parity target: the original `runPipeline` from
 * `multimind_dev/.opencode/plugins/subconscious-server.ts`. The
 * orchestrator here does the same things in the same order:
 *
 *   1. Load the W0 router prompt (core + user refinements)
 *   2. Call the LLM with the router prompt + recent history
 *   3. Retry with a stricter contract if the output is malformed
 *   4. If W0 says SKIP, return early
 *   5. If W0 says ACTIVATE, parse the WORKERS list and the CONTEXT block
 *   6. Run the selected workers in parallel — each gets its prompt
 *      (core + refinements), the W0 context, and the recent history
 *   7. Run the research engine if any worker emitted [EXECUTE_RESEARCH]
 *   8. Run the evolution engine if any worker emitted [WRITE_EXTENSION]
 *   9. Run C0 (if enabled) using `buildSynthesizerPrompt` from the
 *      consolidator — the same prompt the original uses
 *  10. Produce the final delivery text:
 *        - if C0 ran: `consolidateSynthesizerForMainAgent`
 *        - elif distilled kernels enabled: `consolidateWithDistilledWorkerKernels`
 *        - else: `consolidateForMainAgent`
 *  11. Return the thinking output
 *
 * Each step writes a debug event so a human can inspect what happened.
 * The pipeline is stateless: every invocation is a fresh think.
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  type ConsolidatorInsight,
  buildSynthesizerPrompt,
  consolidateForMainAgent,
  consolidateSynthesizerForMainAgent,
  consolidateWithDistilledWorkerKernels,
  parseDistilledWorkerKernels,
} from "../consolidator"
import {
  type DebugRun,
  addDebugEvent,
  createDebugRun,
  failDebugWorker,
  finishDebugWorker,
  setDebugStatus,
  startDebugWorker,
  writeDebugRun,
  writeInjectionDebug,
  writeWorkerOutputDebug,
} from "../debug-store"
import { hasEvolutionTriggers, processEvolutionTriggers } from "../engines/evolution-engine"
import { hasResearchTriggers, processResearchTriggers } from "../engines/research-engine"
import type { LLMProvider } from "../llm/provider"
import {
  type C0Decision,
  DEFAULT_CONFIG,
  type Message,
  type SubconsciousConfig,
  type ThinkingInput,
  type ThinkingOutput,
  type WorkerOutput,
} from "../types"

const PROMPTS_DIR = path.join(import.meta.dir, "..", "prompts")
const PROMPTS_EXTENSIONS_DIR = path.join(import.meta.dir, "..", "prompts-extensions")
const DEFAULT_TIMEOUT_MS = 120_000

export type PipelineOptions = {
  promptsDir?: string
  promptsExtensionsDir?: string
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
  const promptsExtDir = options.promptsExtensionsDir ?? PROMPTS_EXTENSIONS_DIR
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

  // 1. W0 router (core + user refinements)
  const w0 = await loadPromptWithExtensions(promptsDir, promptsExtDir, "W0_ROUTER.md")
  if (!w0) {
    setDebugStatus(run, "error", "W0_ROUTER.md missing")
    await writeDebugRun(runsDir, run)
    return {
      ...emptyOutput("w0_missing", startedAt),
      meta: { ...emptyOutput("w0_missing", startedAt).meta, runRecordPath: runRecordPath(runsDir, run) },
    }
  }

  const recentHistory = formatHistory(messages)
  addDebugEvent(run, "routing", "Starting W0 router", { model: `${model.providerID}/${model.modelID}` })
  await writeDebugRun(runsDir, run)

  const rawW0 = await callProvider(
    provider,
    `${w0}\n\nRecent conversation history:\n${recentHistory}\n\nDecide whether background thinking is useful. If yes, output STATUS: ACTIVATE and WORKERS.`,
    "",
    model,
    timeoutMs,
    options.signal,
  )
  let w0Output = rawW0
  if (!/STATUS:\s*(ACTIVATE|SKIP)/i.test(rawW0)) {
    w0Output = await callProvider(
      provider,
      `${w0}\n\nRecent conversation history:\n${recentHistory}\n\nYour previous router output was empty or malformed. Return only the router contract:\n\nSTATUS: ACTIVATE\nWORKERS: W1, W3\nCONTEXT: <two or three sentences>\n\nor:\n\nSTATUS: SKIP\nREASON: <one sentence>`,
      "",
      model,
      timeoutMs,
      options.signal,
    )
    addDebugEvent(run, "routing", "Retried W0 router after invalid output", {
      routerPreview: rawW0.slice(0, 500),
    })
  }
  setDebugStatus(run, "running", "W0 router complete")
  await writeDebugRun(runsDir, run)

  if (/STATUS:\s*SKIP/i.test(w0Output)) {
    setDebugStatus(run, "skipped", "Router skipped", { reason: extractReason(w0Output) })
    await writeDebugRun(runsDir, run)
    return {
      ...emptyOutput("skipped", startedAt),
      meta: { ...emptyOutput("skipped", startedAt).meta, runRecordPath: runRecordPath(runsDir, run) },
    }
  }
  if (!/STATUS:\s*ACTIVATE/i.test(w0Output)) {
    setDebugStatus(run, "error", "Router returned invalid output", { routerPreview: w0Output.slice(0, 500) })
    await writeDebugRun(runsDir, run)
    return {
      ...emptyOutput("router_invalid", startedAt),
      meta: { ...emptyOutput("router_invalid", startedAt).meta, runRecordPath: runRecordPath(runsDir, run) },
    }
  }

  // 2. Discover and run selected workers
  const workerFiles = await discoverWorkers(promptsDir, promptsExtDir)
  const selectedKeys = pickWorkers(w0Output, workerFiles, input.workers)
  if (selectedKeys.length === 0) {
    setDebugStatus(run, "skipped", "Router activated but selected no known workers", {
      routerPreview: w0Output.slice(0, 500),
    })
    await writeDebugRun(runsDir, run)
    return {
      ...emptyOutput("no_workers", startedAt),
      meta: { ...emptyOutput("no_workers", startedAt).meta, runRecordPath: runRecordPath(runsDir, run) },
    }
  }

  const w0Context = extractContext(w0Output)
  addDebugEvent(run, "workers", "Starting selected workers", { workers: selectedKeys })
  await writeDebugRun(runsDir, run)

  const workerResults = await Promise.all(
    selectedKeys.map((key) =>
      runWorker(
        provider,
        key,
        workerFiles[key],
        recentHistory,
        w0Context,
        model,
        run,
        runsDir,
        promptsDir,
        promptsExtDir,
        timeoutMs,
        options.signal,
      ),
    ),
  )
  const visibleResults = workerResults.filter((r) => r.output.trim() && !r.error)

  if (visibleResults.length === 0) {
    setDebugStatus(run, "skipped", "Workers produced no output")
    await writeDebugRun(runsDir, run)
    return {
      ...emptyOutput("no_worker_output", startedAt),
      meta: {
        ...emptyOutput("no_worker_output", startedAt).meta,
        runRecordPath: runRecordPath(runsDir, run),
      },
    }
  }

  const insights: ConsolidatorInsight[] = visibleResults.map((worker) => ({
    key: worker.key,
    name: worker.name,
    output: worker.output,
  }))

  // 3. Engines (research, evolution)
  if (config.research !== false && hasResearchTriggers(insights)) {
    const researchNotes = await processResearchTriggers(insights, promptsDir, promptsExtDir, provider, model)
    addDebugEvent(run, "researching", "Processed research triggers", { count: researchNotes.length })
    await writeDebugRun(runsDir, run)
  }
  if (config.evolution !== false && hasEvolutionTriggers(insights)) {
    const { notes } = await processEvolutionTriggers(
      insights,
      promptsDir,
      promptsExtDir,
      provider,
      model,
      runsDir,
    )
    addDebugEvent(run, "evolving", "Processed evolution triggers", { notes: notes.length })
    await writeDebugRun(runsDir, run)
  }

  // 4. C0 synthesizer
  let c0Output = ""
  let c0Decision: C0Decision = "missing"
  let c0Prompt: string | undefined
  if (config.synthesizer !== false) {
    c0Prompt = await loadPromptWithExtensions(promptsDir, promptsExtDir, "C0_SYNTHESIZER.md")
  }
  if (c0Prompt) {
    try {
      c0Output = await callProvider(
        provider,
        buildSynthesizerPrompt({ instruction: c0Prompt, insights, recentConversation: recentHistory }),
        "",
        model,
        timeoutMs,
        options.signal,
      )
      c0Decision = parseC0Decision(c0Output)
      addDebugEvent(run, "synthesizing", "C0 synthesizer complete", { decision: c0Decision })
    } catch (error) {
      addDebugEvent(run, "synthesizing.error", "C0 synthesizer failed; using deterministic fallback", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
    await writeDebugRun(runsDir, run)
  }

  // 5. Choose consolidator (matches the original's branching)
  const distilledKernels =
    config.distilledKernels === true
      ? parseDistilledWorkerKernels(
          (await loadFile(path.join(promptsDir, "worker-kernels.md"))) +
            (await loadFile(path.join(promptsExtDir, "worker-kernels.md")).then((t) =>
              t ? `\n--- SYSTEM EXTENSIONS & USER REFINEMENTS ---\n${t}` : "",
            )),
        )
      : []
  const consolidated = c0Output
    ? consolidateSynthesizerForMainAgent({ synthesis: c0Output, insights })
    : distilledKernels.length
      ? consolidateWithDistilledWorkerKernels({ insights, kernels: distilledKernels })
      : consolidateForMainAgent(insights)

  setDebugStatus(run, "done", "Heads-up synthesized", { workers: visibleResults.length, c0: c0Decision })
  await writeDebugRun(runsDir, run)
  await writeInjectionDebug(runsDir, run, consolidated)

  return {
    headsUp: consolidated,
    workers: workersToMap(workerResults),
    meta: {
      sessionID: input.sessionID,
      routerDecision: "ACTIVATE",
      c0Decision,
      notes: [],
      totalDurationMs: Date.now() - startedAt,
      runRecordPath: runRecordPath(runsDir, run),
    },
  }
}

// ---------- helpers ----------

function emptyOutput(reason: string, startedAt: number, sessionID?: string): ThinkingOutput {
  return {
    headsUp: "",
    workers: {},
    meta: {
      sessionID,
      routerDecision: "SKIP",
      notes: [reason],
      totalDurationMs: Date.now() - startedAt,
    },
  }
}

function workersToMap(results: WorkerOutput[]): Record<string, WorkerOutput> {
  const map: Record<string, WorkerOutput> = {}
  for (const r of results) {
    map[r.key] = r
  }
  return map
}

function latestMessage(
  messages: Message[],
  role: "user" | "assistant",
  includeSynthetic = true,
): Message | undefined {
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

/**
 * Load a prompt combining the core file with any user refinements from
 * the extensions directory. The original loadPrompt() did exactly this;
 * the separator "--- SYSTEM EXTENSIONS & USER REFINEMENTS ---" comes
 * from the source.
 */
async function loadPromptWithExtensions(
  coreDir: string,
  extDir: string,
  filename: string,
): Promise<string | undefined> {
  const core = await loadFile(path.join(coreDir, filename))
  const ext = await loadFile(path.join(extDir, filename))
  const content = [core, ext ? `\n\n--- SYSTEM EXTENSIONS & USER REFINEMENTS ---\n${ext}` : ""].join("")
  return content.trim() ? content : undefined
}

async function loadFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return ""
  return (await file.text()).trim()
}

function parseModel(raw: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = raw.split("/")
  return { providerID, modelID: rest.join("/") }
}

async function discoverWorkers(coreDir: string, extDir: string): Promise<Record<string, string>> {
  const coreFiles = await Promise.all([
    Array.fromAsync(new Bun.Glob("W*.md").scan({ cwd: coreDir })).catch(() => [] as string[]),
    Array.fromAsync(new Bun.Glob("W*.md").scan({ cwd: extDir })).catch(() => [] as string[]),
  ])
  // Both directories can contribute files; merge them. If the same worker
  // key appears in both, the prompts-extensions file wins (it is the
  // user's override) and we log nothing — that is the intended mechanism.
  // Within a single directory, duplicates are a bug, not an override.
  const seenInDir = new Map<string, string>() // "dir:key" -> filename
  for (const dir of [coreDir, extDir]) {
    const files = coreFiles[dir === coreDir ? 0 : 1] ?? []
    for (const file of files) {
      if (!file.match(/^W\d+_/) || file.match(/^W0_/)) continue
      const match = file.match(/^(W\d+)_/)
      if (!match) continue
      const key = `${dir}:${match[1]}`
      if (seenInDir.has(key)) {
        throw new Error(
          `Duplicate worker file for ${match[1]} in ${dir}: "${seenInDir.get(key)}" and "${file}". Remove one, or merge their content.`,
        )
      }
      seenInDir.set(key, file)
    }
  }
  // Now build the canonical map. If both dirs have the same key, extDir
  // wins (we process it last and overwrite).
  const out: Record<string, string> = {}
  for (const [key, file] of seenInDir) {
    const match = key.match(/:(W\d+)$/)
    if (match) out[match[1]] = file
  }
  return out
}

function pickWorkers(w0Output: string, workerFiles: Record<string, string>, override?: string[]): string[] {
  if (override?.length) {
    return override.filter((key) => workerFiles[key])
  }
  const searchArea = w0Output.match(/WORKERS:\s*(.+)/i)?.[1] ?? w0Output
  const ordered = Array.from(new Set((searchArea.match(/\bW\d+\b/gi) ?? []).map((k) => k.toUpperCase())))
  if (ordered.length) return ordered.filter((key) => workerFiles[key])
  return Object.keys(workerFiles).filter((key) => new RegExp(`\\b${key}(?:\\b|_)`, "i").test(searchArea))
}

/** Pull the CONTEXT: and PROJECT_CONTEXT: blocks out of W0's output. */
function extractContext(w0Output: string): string {
  return [
    w0Output.match(/CONTEXT:\s*(.*?)(?=\n[A-Z_]+:|$)/is)?.[1]?.trim(),
    w0Output.match(/PROJECT_CONTEXT:\s*(.*?)(?=\n[A-Z_]+:|$)/is)?.[1]?.trim(),
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n\n")
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
  coreDir: string,
  extDir: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<WorkerOutput> {
  const startedAt = Date.now()
  if (!filename) {
    return {
      key,
      name: key,
      output: "",
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: "prompt_missing",
    }
  }
  const instruction = await loadPromptWithExtensions(coreDir, extDir, filename)
  if (!instruction) {
    return {
      key,
      name: filename,
      output: "",
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: "prompt_missing",
    }
  }

  const displayName = filename
    .replace(/^W\d+_/, "")
    .replace(".md", "")
    .replaceAll("_", " ")
  const title = `multimind-${key.toLowerCase()}`
  const debugID = startDebugWorker(run, { key, name: displayName, title, tools: ["read", "grep", "glob"] })
  await writeDebugRun(runsDir, run)

  // W13 (research) gets web tools; everyone else gets just file tools
  const _tools =
    key === "W13"
      ? { read: true, grep: true, glob: true, webfetch: true, websearch: true }
      : { read: true, grep: true, glob: true }

  try {
    const output = await callProvider(
      provider,
      `${instruction}\n\nOrientation context from W0:\n${w0Context || "(none)"}\n\nRecent conversation history:\n${historyContext}\n\nAnalyze the situation and produce your output strictly in your Output Format.`,
      "",
      model,
      timeoutMs,
      signal,
    )
    finishDebugWorker(run, debugID, output)
    await writeWorkerOutputDebug(runsDir, run, debugID, output)
    await writeDebugRun(runsDir, run)
    return {
      key,
      name: displayName,
      output,
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failDebugWorker(run, debugID, message)
    await writeDebugRun(runsDir, run)
    return {
      key,
      name: displayName,
      output: "",
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: message,
    }
  }
}

function runRecordPath(runsDir: string, run: DebugRun): string {
  return path.join(runsDir, `${run.startedAt}-${run.id}.json`)
}
