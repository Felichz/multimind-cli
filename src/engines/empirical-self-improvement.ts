import { mkdir, rm } from "node:fs/promises"
import path from "node:path"

export type EmpiricalWorkerTest = {
  id: string
  context: string
  expectedWorker: string
  expectedThoughtSummary: string
  minScore?: number
}

export type EmpiricalCandidate = {
  id: string
  status: "queued" | "applied" | "verified" | "failed"
  createdAt: string
  updatedAt: string
  source: {
    key: string
    name: string
  }
  targetFile: string
  extensionText: string
  syntheticTest: EmpiricalWorkerTest
  paths: {
    dir: string
    candidate: string
    extension: string
    syntheticTest: string
  }
  commands: {
    verify: string
    baselineCase: string
    quickProfile: string
  }
  verification?: {
    status: "pending" | "verified" | "failed"
    reason?: string
    runFile?: string
    updatedAt: string
  }
}

type QueueInput = {
  root: string
  targetFile: string
  extensionText: string
  source: {
    key: string
    name: string
  }
  syntheticTest: unknown
}

export function selfImprovementDir(root: string) {
  return path.join(root, ".opencode", "subconscious", "self-improvement")
}

export async function queueEmpiricalCandidate(input: QueueInput) {
  const syntheticTest = requireWorkerTest(input.syntheticTest)
  const id = candidateID(input.targetFile, input.extensionText)
  const dir = path.join(selfImprovementDir(input.root), "candidates", id)
  const candidate: EmpiricalCandidate = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: input.source,
    targetFile: cleanMarkdownFilename(input.targetFile),
    extensionText: input.extensionText.trim(),
    syntheticTest,
    paths: {
      dir: relative(input.root, dir),
      candidate: relative(input.root, path.join(dir, "candidate.json")),
      extension: relative(input.root, path.join(dir, "extension.md")),
      syntheticTest: relative(input.root, path.join(dir, "synthetic-test.json")),
    },
    commands: {
      verify: `cd packages/opencode && bun run self-improve:subconscious -- --candidate ${id}`,
      baselineCase: `cd packages/opencode && bun run eval:subconscious -- --suite workers --case-file ${relative(path.join(input.root, "packages", "opencode"), path.join(dir, "synthetic-test.json"))}`,
      quickProfile: "cd packages/opencode && bun run eval:subconscious -- --profile quick",
    },
    verification: {
      status: "pending",
      updatedAt: new Date().toISOString(),
    },
  }

  await mkdir(dir, { recursive: true })
  await Promise.all([
    Bun.write(path.join(dir, "extension.md"), `${candidate.extensionText}\n`),
    Bun.write(path.join(dir, "synthetic-test.json"), `${JSON.stringify(syntheticTest, null, 2)}\n`),
    writeCandidate(input.root, candidate),
    Bun.write(path.join(selfImprovementDir(input.root), "latest.json"), `${JSON.stringify(candidate, null, 2)}\n`),
  ])
  return candidate
}

export async function readEmpiricalCandidate(root: string, selector = "latest") {
  if (selector === "latest") {
    return requireCandidate(await Bun.file(path.join(selfImprovementDir(root), "latest.json")).json())
  }

  const file = selector.endsWith(".json")
    ? path.resolve(root, selector)
    : path.join(selfImprovementDir(root), "candidates", selector, "candidate.json")
  return requireCandidate(await Bun.file(file).json())
}

export async function writeCandidate(root: string, candidate: EmpiricalCandidate) {
  const file = path.resolve(root, candidate.paths.candidate)
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, `${JSON.stringify(candidate, null, 2)}\n`)
}

export async function markCandidate(
  root: string,
  candidate: EmpiricalCandidate,
  verification: NonNullable<EmpiricalCandidate["verification"]>,
) {
  const next = {
    ...candidate,
    status:
      verification.status === "verified" ? "verified" : verification.status === "failed" ? "failed" : candidate.status,
    updatedAt: new Date().toISOString(),
    verification,
  } satisfies EmpiricalCandidate
  await writeCandidate(root, next)
  await Bun.write(path.join(selfImprovementDir(root), "latest.json"), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export async function applyEmpiricalCandidate(root: string, candidate: EmpiricalCandidate) {
  const file = path.join(root, ".opencode", "subconscious", "extensions", "prompts", candidate.targetFile)
  const previous = await Bun.file(file).text().catch(() => "")
  const next = previous.includes(candidate.extensionText)
    ? previous
    : [previous.trim(), candidate.extensionText].filter(Boolean).join("\n") + "\n"
  await mkdir(path.dirname(file), { recursive: true })
  await Bun.write(file, next)
  return { file, previous }
}

export async function restoreEmpiricalCandidateTarget(backup: { file: string; previous: string }) {
  if (backup.previous) {
    await Bun.write(backup.file, backup.previous)
    return
  }
  await rm(backup.file, { force: true }).catch(() => undefined)
}

function requireWorkerTest(value: unknown): EmpiricalWorkerTest {
  const item = record(value)
  if (!string(item.id) || !string(item.context) || !string(item.expectedWorker) || !string(item.expectedThoughtSummary)) {
    throw new Error("Synthetic self-improvement test must be a worker eval case")
  }
  return {
    id: item.id,
    context: item.context,
    expectedWorker: item.expectedWorker,
    expectedThoughtSummary: item.expectedThoughtSummary,
    minScore: typeof item.minScore === "number" ? item.minScore : undefined,
  }
}

function requireCandidate(value: unknown): EmpiricalCandidate {
  const item = record(value)
  const paths = record(item.paths)
  const commands = record(item.commands)
  const source = record(item.source)
  if (
    !string(item.id) ||
    !string(item.status) ||
    !string(item.createdAt) ||
    !string(item.updatedAt) ||
    !string(item.targetFile) ||
    !string(item.extensionText) ||
    !string(paths.candidate) ||
    !string(paths.extension) ||
    !string(paths.syntheticTest) ||
    !string(paths.dir) ||
    !string(commands.verify) ||
    !string(commands.baselineCase) ||
    !string(commands.quickProfile) ||
    !string(source.key) ||
    !string(source.name)
  ) {
    throw new Error("Invalid empirical self-improvement candidate")
  }
  return {
    id: item.id,
    status: item.status === "verified" ? "verified" : item.status === "failed" ? "failed" : item.status === "applied" ? "applied" : "queued",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    source: {
      key: source.key,
      name: source.name,
    },
    targetFile: item.targetFile,
    extensionText: item.extensionText,
    syntheticTest: requireWorkerTest(item.syntheticTest),
    paths: {
      dir: paths.dir,
      candidate: paths.candidate,
      extension: paths.extension,
      syntheticTest: paths.syntheticTest,
    },
    commands: {
      verify: commands.verify,
      baselineCase: commands.baselineCase,
      quickProfile: commands.quickProfile,
    },
    verification: decodeVerification(item.verification),
  }
}

function decodeVerification(value: unknown): EmpiricalCandidate["verification"] {
  const item = record(value)
  const status = item.status === "verified" ? "verified" : item.status === "failed" ? "failed" : item.status === "pending" ? "pending" : undefined
  if (!status || !string(item.updatedAt)) return
  return {
    status,
    updatedAt: item.updatedAt,
    reason: string(item.reason) ? item.reason : undefined,
    runFile: string(item.runFile) ? item.runFile : undefined,
  }
}

function candidateID(targetFile: string, extensionText: string) {
  const hash = new Bun.CryptoHasher("sha256")
  hash.update(targetFile)
  hash.update(extensionText)
  return `${new Date().toISOString().replace(/[:.]/g, "-")}--${slug(targetFile)}--${hash.digest("hex").slice(0, 8)}`
}

function cleanMarkdownFilename(input: string) {
  return path.basename(input.trim()).replace(/\.md$/i, "") + ".md"
}

function slug(input: string) {
  return cleanMarkdownFilename(input).replace(/\.md$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()
}

function relative(root: string, file: string) {
  return path.relative(root, file)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
