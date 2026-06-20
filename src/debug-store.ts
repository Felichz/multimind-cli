import { mkdir } from "node:fs/promises"
import path from "node:path"

export type DebugRunStatus = "running" | "done" | "skipped" | "ignored" | "error"

export type DebugEvent = {
  time: number
  phase: string
  message: string
  data?: Record<string, unknown>
}

export type DebugWorker = {
  id: string
  key: string
  name: string
  title: string
  sessionID?: string
  status: "running" | "done" | "error"
  startedAt: number
  completedAt?: number
  durationMs?: number
  outputLength?: number
  outputPreview?: string
  outputPath?: string
  tools?: string[]
  error?: string
}

export type DebugRun = {
  id: string
  sessionID: string
  trigger: "idle"
  status: DebugRunStatus
  startedAt: number
  updatedAt: number
  model?: string
  assistantMessageID?: string
  userMessageID?: string
  messageCount?: number
  skipReason?: string
  error?: string
  injected?: {
    delivery: "prompt" | "silent"
    mode: "synthetic" | "user"
    perspectives: number
    textLength: number
    textPreview?: string
    textPath?: string
  }
  c0?: {
    decision: "safe_to_end" | "continue" | "blocked" | "missing"
    outputPreview: string
  }
  autoContinue?: {
    count: number
    limit: number
    decision: "continue" | "blocked" | "missing"
    textPreview: string
  }
  workers: DebugWorker[]
  events: DebugEvent[]
}

export function createDebugRun(input: {
  sessionID: string
  assistantMessageID?: string
  userMessageID?: string
  messageCount?: number
}): DebugRun {
  const now = Date.now()
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    sessionID: input.sessionID,
    trigger: "idle" as const,
    status: "running" as const,
    startedAt: now,
    updatedAt: now,
    assistantMessageID: input.assistantMessageID,
    userMessageID: input.userMessageID,
    messageCount: input.messageCount,
    workers: [],
    events: [],
  }
}

export function addDebugEvent(
  run: DebugRun | undefined,
  phase: string,
  message: string,
  data?: Record<string, unknown>,
) {
  if (!run) return
  run.events.push({
    time: Date.now(),
    phase,
    message,
    ...(data ? { data } : {}),
  })
  run.updatedAt = Date.now()
}

export function setDebugStatus(
  run: DebugRun | undefined,
  status: DebugRunStatus,
  message: string,
  data?: Record<string, unknown>,
) {
  if (!run) return
  run.status = status
  if (status === "skipped" || status === "ignored") run.skipReason = message
  if (status === "error") run.error = message
  addDebugEvent(run, status, message, data)
}

export function startDebugWorker(
  run: DebugRun,
  input: { key: string; name: string; title: string; sessionID?: string; tools?: string[] },
) {
  const worker = {
    id: `${input.key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    key: input.key,
    name: input.name,
    title: input.title,
    sessionID: input.sessionID,
    status: "running" as const,
    startedAt: Date.now(),
    ...(input.tools?.length ? { tools: input.tools } : {}),
  }
  run.workers.push(worker)
  addDebugEvent(run, "worker.start", `${input.key} ${input.name}`, {
    title: input.title,
    sessionID: input.sessionID,
  })
  return worker.id
}

export function finishDebugWorker(run: DebugRun, workerID: string, output: string) {
  const worker = run.workers.find((item) => item.id === workerID)
  if (!worker) return
  worker.status = "done"
  worker.completedAt = Date.now()
  worker.durationMs = worker.completedAt - worker.startedAt
  worker.outputLength = output.length
  worker.outputPreview = preview(output)
  addDebugEvent(run, "worker.done", `${worker.key} completed`, {
    durationMs: worker.durationMs,
    outputLength: output.length,
  })
}

export async function writeWorkerOutputDebug(
  runsDir: string,
  run: DebugRun,
  workerID: string,
  output: string,
) {
  const worker = run.workers.find((item) => item.id === workerID)
  if (!worker) return
  await mkdir(runsDir, { recursive: true })
  const runFile = `${run.id}-${worker.id.toLowerCase()}-output.md`
  await Bun.write(path.join(runsDir, runFile), output.endsWith("\n") ? output : `${output}\n`)
  worker.outputPath = path.join(runsDir, runFile)
  run.updatedAt = Date.now()
}

export function failDebugWorker(run: DebugRun, workerID: string, error: unknown) {
  const worker = run.workers.find((item) => item.id === workerID)
  if (!worker) return
  worker.status = "error"
  worker.completedAt = Date.now()
  worker.durationMs = worker.completedAt - worker.startedAt
  worker.error = error instanceof Error ? error.message : String(error)
  addDebugEvent(run, "worker.error", `${worker.key} failed`, { error: worker.error })
}

export async function writeDebugRun(runsDir: string, run: DebugRun) {
  await mkdir(runsDir, { recursive: true })
  run.updatedAt = Date.now()
  const text = `${JSON.stringify(run, null, 2)}\n`
  await Bun.write(path.join(runsDir, "latest.json"), text)
  await Bun.write(path.join(runsDir, `${run.id}.json`), text)
}

export async function writeInjectionDebug(runsDir: string, run: DebugRun, text: string) {
  await mkdir(runsDir, { recursive: true })
  const content = text.endsWith("\n") ? text : `${text}\n`
  const runFile = `${run.id}-injection.md`
  await Bun.write(path.join(runsDir, runFile), content)
  return path.join(runsDir, runFile)
}

export function preview(output: string) {
  return output.trim().replace(/\s+/g, " ").slice(0, 280)
}
