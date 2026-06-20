/**
 * Contract tests for the CLI — verify the package shape and key files exist.
 *
 * These tests are deliberately light. The real behavioral guarantees
 * (the LLMProvider interface is implemented, runThinkingPipeline works,
 * types compile) are enforced by the TypeScript compiler and the
 * 7 behavioral tests in pipeline.test.ts. This file just catches
 * "the package is in a broken state" issues that are easier to detect
 * with a smoke test than with a full typecheck.
 */

import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.join(import.meta.dir, "..")
const PROMPTS_DIR = path.join(ROOT, "src", "prompts")
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))

describe("package shape", () => {
  test("package.json declares the multimind bin", () => {
    expect(PACKAGE.bin?.multimind).toBeDefined()
  })

  test("package.json exports the public entry points", () => {
    expect(PACKAGE.exports?.["."]).toBeDefined()
    expect(PACKAGE.exports?.["./pipeline"]).toBeDefined()
    expect(PACKAGE.exports?.["./consolidator"]).toBeDefined()
    expect(PACKAGE.exports?.["./engines"]).toBeDefined()
  })

  test("package.json has no proprietary SDK dependency", () => {
    // The CLI talks to LLMs via plain fetch. A proprietary SDK in the
    // dependency list would mean the package is no longer a pure
    // input → output CLI. Caught here so a future contributor cannot
    // re-add the SDK without a test failure.
    const deps = { ...PACKAGE.dependencies, ...PACKAGE.devDependencies }
    expect(deps).not.toHaveProperty("@opencode-ai/sdk")
  })
})

describe("public API", () => {
  test("the library entry point imports cleanly", async () => {
    const mod = await import("../src/index")
    expect(typeof mod.runThinkingPipeline).toBe("function")
    expect(typeof mod.OpenAICompatProvider).toBe("function")
    expect(typeof mod.DEFAULT_CONFIG).toBe("object")
    expect(mod.Consolidator).toBeDefined()
    expect(mod.Research).toBeDefined()
    expect(mod.Evolution).toBeDefined()
  })

  test("the library does NOT export synthesizeFinalResponse (the consumer's job)", async () => {
    // The CLI returns a heads-up. Turning it into a user-facing
    // response is the consumer's responsibility — a downstream LLM,
    // an opencode agent, a Codex skill. Keeping synthesis out of the
    // CLI preserves a clean boundary: the CLI is for thinking, the
    // consumer is for answering.
    const mod = await import("../src/index")
    // @ts-expect-error: the test is asserting this property does NOT exist
    expect(mod.synthesizeFinalResponse).toBeUndefined()
  })

  test("the library does NOT export WorkerResult (renamed to WorkerOutput)", async () => {
    // The shape changed: workers is now a map (Record<string, WorkerOutput>)
    // instead of an array (WorkerResult[]). The rename + restructure
    // happened because the consumer needs to address each worker by key
    // (workers.W17) without scanning an array. If a future contributor
    // re-adds WorkerResult, this test catches the regression.
    const mod = await import("../src/index")
    // @ts-expect-error: the test is asserting this property does NOT exist
    expect(mod.WorkerResult).toBeUndefined()
  })

  test("OpenAICompatProvider is constructible and satisfies LLMProvider", async () => {
    const { OpenAICompatProvider } = await import("../src/llm/openai-compat")
    const provider = new OpenAICompatProvider({ baseUrl: "http://localhost:9999/v1" })
    // Duck typing: LLMProvider is an interface, not a class, so we check
    // the shape directly. The TypeScript compiler enforces the actual
    // structural compatibility.
    expect(typeof provider.complete).toBe("function")
    expect(typeof provider.name).toBe("string")
    expect(provider.name).toBe("openai-compat")
  })
})

describe("prompts", () => {
  test("W0 router prompt is present", () => {
    expect(fs.existsSync(path.join(PROMPTS_DIR, "W0_ROUTER.md"))).toBe(true)
  })

  test("C0 synthesizer prompt is present", () => {
    expect(fs.existsSync(path.join(PROMPTS_DIR, "C0_SYNTHESIZER.md"))).toBe(true)
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
      "W15_ARCHITECTURE_RISK",
      "W16_ROLLOUT_PLAN",
      "W17_SECURITY_CHECK",
    ]
    for (const key of expectedKeys) {
      const file = fs
        .readdirSync(PROMPTS_DIR)
        .find((f) => f.startsWith(`${key}`) || f.startsWith(`${key}.md`))
      expect(file, `expected prompt for ${key}`).toBeDefined()
    }
  })

  test("no duplicate worker files (each W{n} has exactly one prompt)", () => {
    const mdFiles = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md"))
    const byKey = new Map<string, string[]>()
    for (const f of mdFiles) {
      const match = f.match(/^(W\d+)_/)
      if (match) {
        const arr = byKey.get(match[1]) ?? []
        arr.push(f)
        byKey.set(match[1], arr)
      }
    }
    for (const [key, files] of byKey) {
      expect(files, `duplicate prompt files for ${key}: ${files.join(", ")}`).toHaveLength(1)
    }
  })

  test("distilled worker-kernels.md is present", () => {
    expect(fs.existsSync(path.join(PROMPTS_DIR, "worker-kernels.md"))).toBe(true)
  })
})

describe("config", () => {
  test("DEFAULT_CONFIG has all required fields", async () => {
    const { DEFAULT_CONFIG } = await import("../src/types")
    expect(DEFAULT_CONFIG.enabled).toBe(true)
    expect(typeof DEFAULT_CONFIG.model).toBe("string")
    expect(DEFAULT_CONFIG.delivery).toMatch(/^(prompt|silent)$/)
    expect(DEFAULT_CONFIG.injectionMode).toMatch(/^(synthetic|user)$/)
    expect(typeof DEFAULT_CONFIG.autoContinue).toBe("boolean")
    expect(typeof DEFAULT_CONFIG.maxAutoContinues).toBe("number")
  })
})
