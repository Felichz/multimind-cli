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

export type WorkerResult = {
  key: string
  name: string
  output: string
  durationMs: number
  usage: { inputTokens: number; outputTokens: number }
  error?: string
}

export type C0Decision = "safe_to_end" | "continue" | "blocked" | "missing"

export type ThinkingOutput = {
  /** The synthesised thinking to deliver to the user/main agent. May be empty if the router skipped. */
  thinking: string

  /** Workers that fired, in the order they ran. */
  workers: WorkerResult[]

  /** W0 router decision: "ACTIVATE" or "SKIP". */
  routerDecision: "ACTIVATE" | "SKIP"

  /** C0 decision (only if a C0 prompt is present). */
  c0Decision?: C0Decision

  /** Free-form notes from the synthesis (e.g. "blocked on empirical debt"). */
  notes: string[]

  /** Total wall-clock time. */
  totalDurationMs: number

  /** Path to the full run record (debug/latest-run.json equivalent) for inspection. */
  runRecordPath?: string
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
  model: "opencode/deepseek-v4-flash-free",
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
