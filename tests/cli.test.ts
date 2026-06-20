/**
 * CLI integration tests.
 *
 * These tests invoke the actual `bin/multimind.ts` entry as a
 * subprocess (using `bun run`) and check the exit code, stdout,
 * and stderr. They prove the CLI works end-to-end, not just that
 * the library functions compile.
 *
 * The tests that require a configured LLM provider are skipped
 * unless `MULTIMIND_TEST_LIVE` is set. The tests that don't (the
 * operational subcommands like `config` and `--help`) run
 * unconditionally.
 */

import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import path from "node:path"

const ROOT = path.join(import.meta.dir, "..")
const BIN = path.join(ROOT, "bin", "multimind.ts")
const TEST_INPUT = path.join(import.meta.dir, "fixtures", "cli-input.json")

type CliResult = { stdout: string; stderr: string; code: number }

function run(args: string[], stdin?: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", BIN, ...args], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("exit", (code) => resolve({ stdout, stderr, code: code ?? 0 }))
    if (stdin !== undefined) {
      child.stdin.end(stdin)
    } else {
      child.stdin.end()
    }
  })
}

describe("CLI: help and unknown commands", () => {
  test("--help prints the USAGE block and exits 0", async () => {
    const result = await run(["--help"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("multimind")
    expect(result.stdout).toContain("Usage:")
    expect(result.stdout).toContain("think")
    expect(result.stdout).toContain("config")
    expect(result.stdout).toContain("status")
    expect(result.stdout).toContain("eval")
  })

  test("no args prints the USAGE block and exits 0", async () => {
    const result = await run([])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("Usage:")
  })

  test("an unknown command prints an error and exits 1", async () => {
    const result = await run(["banana"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Unknown command")
    expect(result.stderr).toContain("banana")
  })

  test("USAGE references the new output shape (headsUp/workers/meta), not the old", async () => {
    const result = await run(["--help"])
    // The old shape was { thinking, workers, routerDecision, ... }.
    // The new shape is { headsUp, workers, meta }. A help output that
    // still described the old shape would be a regression to flag.
    expect(result.stdout).not.toMatch(/\bthinking:\s+string\b/)
  })
})

describe("CLI: status (operational, no LLM required)", () => {
  test("reports the active provider name", async () => {
    const result = await run(["status"])
    expect(result.code).toBe(0)
    const out = JSON.parse(result.stdout) as { provider: string }
    expect(out.provider).toBe("openai-compat")
  })
})

describe("CLI: config (operational, no LLM required)", () => {
  test("config show prints resolved config as JSON", async () => {
    const result = await run(["config", "show"])
    expect(result.code).toBe(0)
    const out = JSON.parse(result.stdout) as {
      config: { baseUrl: string; apiKey: string; model: string; timeoutMs: number }
      source: string
    }
    expect(typeof out.config.baseUrl).toBe("string")
    expect(typeof out.config.model).toBe("string")
    expect(typeof out.config.timeoutMs).toBe("number")
  })

  test("config path prints the config file path", async () => {
    const result = await run(["config", "path"])
    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toMatch(/config\.json$/)
  })

  test("config set with an unknown key exits 1 with a clear error", async () => {
    const result = await run(["config", "set", "noSuchKey", "x"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Unknown key")
    expect(result.stderr).toContain("noSuchKey")
  })

  test("config set with a missing value exits 1 with a usage hint", async () => {
    const result = await run(["config", "set", "baseUrl"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Usage")
  })
})

describe("CLI: think (requires LLM, skipped without MULTIMIND_TEST_LIVE)", () => {
  const live = process.env.MULTIMIND_TEST_LIVE === "1"

  test.skipIf(!live)(
    "think --input reads from file, writes headsUp, exits 0",
    async () => {
      const result = await run(["think", "--input", TEST_INPUT, "--output", "/tmp/multimind-test-out.json"])
      expect(result.code).toBe(0)
      const out = JSON.parse(await Bun.file("/tmp/multimind-test-out.json").text()) as {
        headsUp: string
        workers: Record<string, { output: string }>
        meta: { routerDecision: string; totalDurationMs: number }
      }
      expect(typeof out.headsUp).toBe("string")
      expect(out.workers).toBeObject()
      expect(["ACTIVATE", "SKIP"]).toContain(out.meta.routerDecision)
    },
    { timeout: 600_000 },
  )
})
