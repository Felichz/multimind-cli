/**
 * Core types for the thinking pipeline.
 *
 * These replace the OpenCode-plugin-coupled types that used to live in
 * `subconscious-server.ts`. The pipeline is now provider-agnostic: any
 * integration captures context, hands it to the CLI as `ThinkingInput`,
 * and gets back `ThinkingOutput`.
 */

export type TextPart = {
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  metadata?: Record<string, unknown>
}

export type Message = {
  info: {
    id?: string
    role: "user" | "assistant" | string
    time: { created: number; completed?: number }
  }
  parts: TextPart[]
}

export type ThinkingInput = {
  /** The recent conversation history (from any source: opencode session, codex chat, claude code, etc.). */
  history: Message[]

  /** Optional override of the worker list. If omitted, the W0 router decides. */
  workers?: string[]

  /** Optional override of the model in provider/model form. If omitted, uses the default from config. */
  model?: string

  /** Config overrides for this run. */
  config?: Partial<SubconsciousConfig>

  /** Optional session id for logging and run-record correlation. */
  sessionID?: string
}

export type WorkerOutput = {
  /** The worker key (also the map key in `ThinkingOutput.workers`). */
  key: string
  name: string
  output: string
  durationMs: number
  usage: { inputTokens: number; outputTokens: number }
  error?: string
}

export type C0Decision = "safe_to_end" | "continue" | "blocked" | "missing"

export type ThinkingMeta = {
  /** The session id passed in the input, echoed for log correlation. */
  sessionID?: string
  /** W0 router decision: "ACTIVATE" or "SKIP". */
  routerDecision: "ACTIVATE" | "SKIP"
  /** C0 decision (only if a C0 prompt is present). */
  c0Decision?: C0Decision
  /** Free-form notes from the synthesis (e.g. "blocked on empirical debt"). */
  notes: string[]
  /** Total wall-clock time of the pipeline. */
  totalDurationMs: number
  /** Path to the full run record for inspection. Contains every prompt, every raw response, timing, and the final heads-up. */
  runRecordPath?: string
}

/**
 * The CLI's output. The shape is deliberately separated so the
 * consumer can pick which part to use:
 *
 *   - `headsUp`           — the consolidated thinking. Inject this as
 *                           context for the host LLM.
 *   - `workers`           — each worker's raw output, keyed by worker
 *                           key (W14, W2, W4, ...). Useful for
 *                           targeted inspection ("show me the
 *                           security findings" → `workers.W17`).
 *   - `meta`              — pipeline-level metadata. The router
 *                           decision, the C0 verdict, timing, the
 *                           run record path. The consumer usually
 *                           does not need this, but it's there.
 *
 * The split mirrors the boundary in AGENTS.md: the CLI returns
 * thinking, the consumer decides what to do with it.
 */
export type ThinkingOutput = {
  /** The consolidated "Subconscious Heads-Up" — markdown, ready to be injected as LLM context. Empty if the router skipped. */
  headsUp: string

  /** Per-worker outputs, keyed by worker key (e.g. "W14", "W2"). Workers that did not fire are absent from the map. */
  workers: Record<string, WorkerOutput>

  /** Pipeline-level metadata. */
  meta: ThinkingMeta
}

export type SubconsciousConfig = {
  enabled?: boolean
  model?: string
  delivery?: "prompt" | "silent"
  injectionMode?: "synthetic" | "user"
  autoContinue?: boolean
  maxAutoContinues?: number
  evolution?: boolean
  research?: boolean
  debug?: boolean
  synthesizer?: boolean
  distilledKernels?: boolean
  empiricalSelfImprovement?: boolean
  empiricalSelfImprovementBackend?: "opencode" | "codex-cli"
}

export const DEFAULT_CONFIG: SubconsciousConfig = {
  enabled: true,
  model: "opencode-go/minimax-m3",
  delivery: "silent",
  injectionMode: "synthetic",
  autoContinue: true,
  maxAutoContinues: 10,
  evolution: true,
  research: true,
  debug: true,
  synthesizer: true,
  distilledKernels: true,
  empiricalSelfImprovement: false,
}
