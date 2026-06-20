/**
 * Eval runner smoke tests — verify the dataset parses and the runner
 * can be invoked. The full eval (with real LLM calls) is run via
 * `bun run evals/runner.ts` against an opencode serve instance.
 */

import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"

const DATASET = path.join(import.meta.dir, "..", "evals", "dataset.jsonl")

describe("eval dataset", () => {
  test("exists and is non-empty", async () => {
    const text = await readFile(DATASET, "utf8")
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
  })

  test("every case has the required fields", async () => {
    const text = await readFile(DATASET, "utf8")
    const cases = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    for (const testCase of cases) {
      expect(testCase.id, "id").toBeTruthy()
      expect(testCase.history, "history").toBeTruthy()
      expect(testCase.userMessage, "userMessage").toBeTruthy()
      expect(testCase.expectedQuality, "expectedQuality").toBeTruthy()
      expect(Array.isArray(testCase.mustAvoid), "mustAvoid").toBe(true)
      expect(typeof testCase.minScore, "minScore").toBe("number")
    }
  })

  test("IDs are unique", async () => {
    const text = await readFile(DATASET, "utf8")
    const ids = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l).id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("history strings have at least one [User] or [Assistant] marker", async () => {
    const text = await readFile(DATASET, "utf8")
    const cases = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    for (const testCase of cases) {
      const hasMarker = /\[User\]:|\[Assistant\]:/.test(testCase.history)
      expect(hasMarker, `case ${testCase.id} has no history marker`).toBe(true)
    }
  })
})
