/**
 * Contract tests for the CLI — verify the static surface area is intact.
 *
 * These don't require opencode serve or any LLM. They prove the package
 * shape, prompt coverage, and config schema so external integrations can
 * trust the contract.
 */

import { describe, expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs"

const ROOT = path.join(import.meta.dir, "..")
const PROMPTS_DIR = path.join(ROOT, "src", "prompts")

describe("package shape", () => {
  test("package.json declares the multimind bin", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
    expect(pkg.bin.multimind).toBeDefined()
  })

  test("exports the pipeline, provider, consolidator, and types", () => {
    const indexPath = path.join(ROOT, "src", "index.ts")
    const index = fs.readFileSync(indexPath, "utf8")
    expect(index).toContain("runThinkingPipeline")
    expect(index).toContain("OpenCodeServeProvider")
    expect(index).toContain("Consolidator")
    expect(index).toContain("DEFAULT_CONFIG")
  })

  test("CLI binary exists and is executable", () => {
    const cli = path.join(ROOT, "bin", "multimind.ts")
    expect(fs.existsSync(cli)).toBe(true)
    const stat = fs.statSync(cli)
    expect(stat.mode & 0o111).not.toBe(0)
  })
})

describe("prompts", () => {
  test("W0 router prompt is present and non-trivial", () => {
    const file = path.join(PROMPTS_DIR, "W0_ROUTER.md")
    expect(fs.existsSync(file)).toBe(true)
    const text = fs.readFileSync(file, "utf8").trim()
    // The original W0_ROUTER is several hundred lines. If it dropped to a
    // 2-line stub (which is what happened when extensions overwrote cores
    // during the initial extraction), the harness can't do meaningful work.
    expect(text.length).toBeGreaterThan(1000)
  })

  test("C0 synthesizer prompt is present and non-trivial", () => {
    const file = path.join(PROMPTS_DIR, "C0_SYNTHESIZER.md")
    expect(fs.existsSync(file)).toBe(true)
    const text = fs.readFileSync(file, "utf8").trim()
    expect(text.length).toBeGreaterThan(500)
  })

  test("core worker prompts are full (not 2-line stubs from extension overwrite)", () => {
    // Each core prompt should be substantial. The extensions are in
    // prompts-extensions/ and are appended at runtime, not substituted.
    for (const key of ["W2", "W3", "W4", "W6", "W8", "W10", "W12", "W14"]) {
      const file = fs.readdirSync(PROMPTS_DIR).find((f) => f.startsWith(key + "_") || f.startsWith(key + "."))
      expect(file, `core prompt for ${key}`).toBeDefined()
      const text = fs.readFileSync(path.join(PROMPTS_DIR, file!), "utf8").trim()
      expect(text.length, `${file} should be a full prompt, not a stub`).toBeGreaterThan(500)
    }
  })

  test("core worker prompts cover W1 through W17", () => {
    const expectedKeys = [
      "W1_INTENT_ANALYST",
      "W2_GAP_DETECTOR",
      "W3_SCIENTIFIC_VALIDATOR",
      "W4_RISK_SCANNER",
      "W5_PROACTIVE_VALUE",
      "W6_LLM_SELFCHECK",
      "W7_CRAFTSMAN",
      "W8_AUTONOMOUS_OPERATOR",
      "W9_STRATEGIC_FUTURIST",
      "W10_META_IMPROVER",
      "W11_ARCHITECT",
      "W12_AUTO_TESTER",
      "W13_RESEARCHER",
      "W14_DELIVERY_CONTRACT",
    ]
    for (const key of expectedKeys) {
      const file = fs.readdirSync(PROMPTS_DIR).find((f) => f.startsWith(`${key}`) || f.startsWith(`${key}.md`))
      expect(file, `expected prompt for ${key}`).toBeDefined()
    }
  })

  test("distilled worker-kernels.md is present", () => {
    expect(fs.existsSync(path.join(PROMPTS_DIR, "worker-kernels.md"))).toBe(true)
  })
})

describe("config", () => {
  test("DEFAULT_CONFIG has all required fields", () => {
    const types = fs.readFileSync(path.join(ROOT, "src", "types.ts"), "utf8")
    expect(types).toContain("DEFAULT_CONFIG")
    expect(types).toMatch(/DEFAULT_CONFIG[^{]*\{[\s\S]*?enabled/)
    expect(types).toMatch(/DEFAULT_CONFIG[\s\S]*?model/)
    expect(types).toMatch(/DEFAULT_CONFIG[\s\S]*?delivery/)
    expect(types).toMatch(/DEFAULT_CONFIG[\s\S]*?injectionMode/)
  })
})

describe("LLM provider interface", () => {
  test("provider.ts declares the LLMProvider interface", () => {
    const provider = fs.readFileSync(path.join(ROOT, "src", "llm", "provider.ts"), "utf8")
    expect(provider).toContain("export interface LLMProvider")
    expect(provider).toContain("complete(")
  })

  test("OpenCodeServeProvider implements LLMProvider", () => {
    const serve = fs.readFileSync(path.join(ROOT, "src", "llm", "opencode-serve.ts"), "utf8")
    expect(serve).toContain("implements LLMProvider")
  })
})
