/**
 * Tests for the consolidator's public exports.
 *
 * The consolidator is the part of the pipeline that turns N
 * worker outputs into a single heads-up string. Its public API
 * is five functions:
 *
 *   - consolidateForMainAgent(insights)
 *   - consolidateWithDistilledWorkerKernels({ insights, kernels })
 *   - consolidateSynthesizerForMainAgent({ synthesis, insights })
 *   - buildSynthesizerPrompt({ instruction, insights, recentConversation })
 *   - parseDistilledWorkerKernels(text)
 *
 * These tests pin the public contract. They do not cover the
 * internal 30+ helper functions, which would be brittle and would
 * couple the tests to the implementation rather than the behavior.
 */

import { describe, expect, test } from "bun:test"
import {
  type ConsolidatorInsight,
  type DistilledWorkerKernel,
  buildSynthesizerPrompt,
  consolidateForMainAgent,
  consolidateSynthesizerForMainAgent,
  consolidateWithDistilledWorkerKernels,
  parseDistilledWorkerKernels,
} from "../src/consolidator"

function insight(key: string, name: string, output: string): ConsolidatorInsight {
  return { key, name, output }
}

describe("consolidateForMainAgent", () => {
  test("starts with the [Subconscious Heads-Up] marker", () => {
    const out = consolidateForMainAgent([insight("W2", "Gap Detector", "found a gap")])
    expect(out.startsWith("[Subconscious Heads-Up]")).toBe(true)
  })

  test("includes each worker's name and a summary line", () => {
    const out = consolidateForMainAgent([
      insight("W2", "Gap Detector", "line 1\nline 2\nline 3"),
      insight("W4", "Risk Scanner", "risk X"),
    ])
    expect(out).toContain("Gap Detector")
    expect(out).toContain("Risk Scanner")
    // Each insight gets a numbered bullet referencing its first line.
    expect(out).toContain("line 1")
    expect(out).toContain("risk X")
  })

  test("includes the evidence discipline block", () => {
    const out = consolidateForMainAgent([insight("W2", "Gap", "x")])
    // The block contains the "evidence discipline" or "non-negotiable"
    // language; both are present in the consolidator's constant
    // evidenceDisciplineSection(). Either phrase catches the block.
    expect(out.toLowerCase()).toMatch(/evidence|non-negotiable/)
  })

  test("handles a single-insight input without crashing", () => {
    const out = consolidateForMainAgent([insight("W2", "Gap", "only finding")])
    expect(out).toContain("only finding")
  })

  test("handles an empty insights list", () => {
    const out = consolidateForMainAgent([])
    expect(out).toBeString()
    expect(out.length).toBeGreaterThan(0)
  })
})

describe("consolidateWithDistilledWorkerKernels", () => {
  const kernels: DistilledWorkerKernel[] = [
    { key: "W2", title: "Gap detector principle", body: "Find what is missing." },
    { key: "W4", title: "Risk scanner principle", body: "Name what could fail." },
  ]

  test("starts with the [Subconscious Heads-Up] marker", () => {
    const out = consolidateWithDistilledWorkerKernels({
      insights: [insight("W2", "Gap", "x")],
      kernels,
    })
    expect(out.startsWith("[Subconscious Heads-Up]")).toBe(true)
  })

  test("references the kernel titles for each fired worker", () => {
    const out = consolidateWithDistilledWorkerKernels({
      insights: [insight("W2", "Gap", "x"), insight("W4", "Risk", "y")],
      kernels,
    })
    expect(out).toContain("Gap detector principle")
    expect(out).toContain("Risk scanner principle")
  })
})

describe("consolidateSynthesizerForMainAgent", () => {
  test("uses the C0 synthesis when present", () => {
    const out = consolidateSynthesizerForMainAgent({
      synthesis: "[Subconscious Completion Contract]\nDONE",
      insights: [insight("W14", "Delivery", "x")],
    })
    expect(out).toContain("Subconscious Completion Contract")
    expect(out).toContain("DONE")
  })

  test("falls back to consolidateForMainAgent when synthesis is empty", () => {
    const out = consolidateSynthesizerForMainAgent({
      synthesis: "",
      insights: [insight("W2", "Gap", "the only finding")],
    })
    expect(out).toContain("[Subconscious Heads-Up]")
    expect(out).toContain("the only finding")
  })

  test("falls back when synthesis is whitespace only", () => {
    const out = consolidateSynthesizerForMainAgent({
      synthesis: "   \n  \n",
      insights: [insight("W2", "Gap", "whitespace fallback")],
    })
    expect(out).toContain("whitespace fallback")
  })
})

describe("buildSynthesizerPrompt", () => {
  test("includes the instruction, insights, and recent conversation", () => {
    const prompt = buildSynthesizerPrompt({
      instruction: "INSTRUCTION_BLOCK",
      insights: [insight("W2", "Gap", "INSIGHT_BLOCK")],
      recentConversation: "RECENT_BLOCK",
    })
    expect(prompt).toContain("INSTRUCTION_BLOCK")
    expect(prompt).toContain("INSIGHT_BLOCK")
    expect(prompt).toContain("RECENT_BLOCK")
  })

  test("returns a non-empty string even with empty inputs", () => {
    const prompt = buildSynthesizerPrompt({
      instruction: "",
      insights: [],
      recentConversation: "",
    })
    expect(prompt).toBeString()
    expect(prompt.length).toBeGreaterThan(0)
  })
})

describe("parseDistilledWorkerKernels", () => {
  test("extracts each W{n} - Title heading and the body until the next", () => {
    // The format is fixed: `## W{n} - Title` (W followed by digits,
    // then space-dash-space, then the title). The parser is strict
    // about this so a malformed file fails loudly rather than
    // silently dropping kernels.
    const text = `Some preamble that should be ignored.

## W1 - First Kernel

Body of the first kernel.
Multi-line body.

## W2 - Second Kernel

Body of the second kernel.
`
    const kernels = parseDistilledWorkerKernels(text)
    expect(kernels).toHaveLength(2)
    expect(kernels[0]?.key).toBe("W1")
    expect(kernels[0]?.title).toBe("First Kernel")
    expect(kernels[0]?.body).toContain("Body of the first kernel.")
    expect(kernels[0]?.body).toContain("Multi-line body.")
    expect(kernels[1]?.key).toBe("W2")
    expect(kernels[1]?.title).toBe("Second Kernel")
    expect(kernels[1]?.body).toContain("Body of the second kernel.")
  })

  test("returns an empty array for input with no ## W{n} - headings", () => {
    const kernels = parseDistilledWorkerKernels("just some text without headings")
    expect(kernels).toEqual([])
  })

  test("returns an empty array for empty input", () => {
    expect(parseDistilledWorkerKernels("")).toEqual([])
  })

  test("parses the real worker-kernels.md file (W1 through W14 at least)", () => {
    // This is a smoke test that the shipped worker-kernels.md parses
    // to a non-trivial number of kernels. If someone reformats the
    // file, the test catches it.
    const fs = require("node:fs") as typeof import("node:fs")
    const path = require("node:path") as typeof import("node:path")
    const text = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "prompts", "worker-kernels.md"),
      "utf8",
    )
    const kernels = parseDistilledWorkerKernels(text)
    expect(kernels.length).toBeGreaterThanOrEqual(14)
    for (const k of kernels) {
      expect(k.key).toMatch(/^W\d+$/)
      expect(k.title.length).toBeGreaterThan(0)
      expect(k.body.length).toBeGreaterThan(0)
    }
  })
})
