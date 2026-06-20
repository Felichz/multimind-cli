/**
 * Core types for the thinking pipeline.
 *
 * These are the public contract of the CLI. Everything in this
 * file is part of the API surface; changes here are breaking
 * changes for consumers.
 *
 * Mental model: a consumer captures a conversation as
 * `ThinkingInput`, calls `runThinkingPipeline`, and gets back a
 * `ThinkingOutput`. The output is split into the consolidated
 * heads-up (`headsUp`), per-worker raw outputs (`workers`), and
 * pipeline-level metadata (`meta`). See AGENTS.md for why the
 * split is part of the contract.
 *
 * @packageDocumentation
 */

/**
 * A single text part of a message. The CLI only handles text
 * parts; image, audio, or tool parts are ignored.
 */
export type TextPart = {
  type: "text"
  text: string
  /** Set by some integrations to mark a part as a synthetic
   *  heads-up injection. The pipeline rejects the latest user
   *  message if it has this flag, to avoid recursing on its own
   *  output. */
  synthetic?: boolean
  ignored?: boolean
  metadata?: Record<string, unknown>
}

/**
 * A single message in the conversation history. The shape is
 * deliberately minimal: `info.role`, `info.time.created`, and
 * `parts` (text-only). It is the intersection of what opencode,
 * Codex, and Claude Code expose for a message.
 */
export type Message = {
  info: {
    id?: string
    role: "user" | "assistant" | string
    time: { created: number; completed?: number }
  }
  parts: TextPart[]
}

/**
 * The CLI's input. A consumer captures the recent conversation
 * and hands it to the pipeline.
 */
export type ThinkingInput = {
  /** The recent conversation history (last ~10 messages are used;
   *  the rest is ignored for context-window reasons). The shape
   *  is provider-agnostic — opencode, Codex, Claude Code, or a
   *  hand-built array all work. */
  history: Message[]

  /** Optional override of the worker list. If omitted, W0 (the
   *  router) decides which workers to activate. Useful for
   *  evals and for forcing a specific lens. */
  workers?: string[]

  /** Optional model override in `provider/model` form (e.g.
   *  `opencode-go/minimax-m3`). If omitted, the config's default
   *  is used. */
  model?: string

  /** Per-run config overrides. Merged with the config file /
   *  env defaults. */
  config?: Partial<SubconsciousConfig>

  /** Optional session id. Echoed in `meta.sessionID` and in
   *  the run record, for log correlation across multiple
   *  pipeline invocations in the same host session. */
  sessionID?: string
}

/**
 * One worker's raw output. Workers run in parallel after W0
 * activates. Each is a small focused LLM call.
 */
export type WorkerOutput = {
  /** The worker key (also the map key in `ThinkingOutput.workers`). */
  key: string
  /** Human-readable display name (e.g. "DELIVERY CONTRACT"). */
  name: string
  /** The worker's full text response. */
  output: string
  durationMs: number
  usage: { inputTokens: number; outputTokens: number }
  /** Present if the worker failed (e.g. timeout, malformed
   *  output, missing prompt file). */
  error?: string
}

/**
 * C0's verdict on the worker outputs:
 *   - `safe_to_end`  — workers agree the scope is verified, the
 *                      main agent can stop.
 *   - `continue`     — there is concrete work to do.
 *   - `blocked`      — the claim is too risky; the main agent
 *                      should pause.
 *   - `missing`      — C0 did not produce a verdict marker
 *                      (default; happens when C0 fails or is
 *                      disabled).
 */
export type C0Decision = "safe_to_end" | "continue" | "blocked" | "missing"

/**
 * Pipeline-level metadata. Most consumers can ignore this; the
 * eval runner uses it, and it is useful for telemetry.
 */
export type ThinkingMeta = {
  /** The session id passed in the input, echoed for log
   *  correlation. */
  sessionID?: string
  /** W0 router decision. */
  routerDecision: "ACTIVATE" | "SKIP"
  /** C0 decision (only if C0 ran successfully). */
  c0Decision?: C0Decision
  /** Free-form notes from the synthesis (e.g. "skipped: W0
   *  said SKIP", "blocked on empirical debt"). */
  notes: string[]
  /** Total wall-clock time of the pipeline. */
  totalDurationMs: number
  /** Path to the full run record for inspection. Contains every
   *  prompt, every raw response, timing, and the final
   *  heads-up. Useful for debugging and for the eval
   *  regression suite. */
  runRecordPath?: string
}

/**
 * The CLI's output. The shape is deliberately separated so the
 * consumer can pick which part to use:
 *
 *   - `headsUp` — the consolidated thinking. Inject this as
 *     context for the host LLM.
 *   - `workers` — each worker's raw output, keyed by worker key
 *     (`W14`, `W2`, `W4`, ...). Useful for targeted inspection
 *     ("show me the security findings" → `workers.W17`).
 *   - `meta` — pipeline-level metadata. The router decision,
 *     the C0 verdict, timing, the run record path. The
 *     consumer usually does not need this, but it is there.
 *
 * The split mirrors the boundary in AGENTS.md: the CLI returns
 * thinking, the consumer decides what to do with it.
 *
 * @example
 *   const result = await runThinkingPipeline(input, provider)
 *   // The canonical use — feed the heads-up to the host LLM:
 *   const ctx = result.headsUp
 *   // Targeted inspection — surface specific worker findings:
 *   const security = result.workers.W17?.output
 *   const risks = result.workers.W4?.output
 *   // Full telemetry:
 *   const decision = result.meta.c0Decision
 *   const record = await Bun.file(result.meta.runRecordPath!).json()
 */
export type ThinkingOutput = {
  /** The consolidated "Subconscious Heads-Up" — markdown, ready
   *  to be injected as LLM context. Empty if the router
   *  skipped. */
  headsUp: string

  /** Per-worker outputs, keyed by worker key (e.g. "W14",
   *  "W2"). Workers that did not fire are absent from the map. */
  workers: Record<string, WorkerOutput>

  /** Pipeline-level metadata. */
  meta: ThinkingMeta
}

/**
 * Per-run configuration overrides. Most consumers do not need
 * to touch this; the defaults in `DEFAULT_CONFIG` are tuned for
 * the typical use case.
 */
export type SubconsciousConfig = {
  /** Master switch. `false` returns an empty output with the
   *  note `"disabled"`. */
  enabled?: boolean
  /** Model in `provider/model` form. */
  model?: string
  /** `prompt` shows the heads-up as a user message; `silent`
   *  injects it as a synthetic context message. */
  delivery?: "prompt" | "silent"
  /** How the heads-up is injected. `synthetic` adds it to the
   *  conversation as a system-style part; `user` pretends it
   *  was the user's last message. */
  injectionMode?: "synthetic" | "user"
  /** Allow the main agent to re-run the pipeline automatically. */
  autoContinue?: boolean
  /** Cap on auto-continue iterations. */
  maxAutoContinues?: number
  /** Enable the evolution engine (W12 synthetic test design). */
  evolution?: boolean
  /** Enable the research engine (W13 follow-up research). */
  research?: boolean
  /** Write per-run records to disk. */
  debug?: boolean
  /** Run C0 synthesizer. */
  synthesizer?: boolean
  /** Use the distilled worker-kernels.md as additional
   *  synthesis context. */
  distilledKernels?: boolean
  /** Reserved for future use. The empirical self-improvement
   *  engine was not wired up in the CLI extraction. */
  empiricalSelfImprovement?: boolean
  /** Reserved. */
  empiricalSelfImprovementBackend?: "opencode" | "codex-cli"
}

/**
 * The default config. Used when no per-run config is supplied
 * and no config file / env var overrides the field.
 */
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
