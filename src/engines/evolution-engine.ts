/**
 * Evolution engine — handles W10 [WRITE_EXTENSION] requests, asks W12
 * to generate synthetic tests, queues empirical self-improvement
 * candidates.
 *
 * Parity with the opencode monorepo's evolution-engine. Uses the
 * LLMProvider directly.
 */

import path from "node:path"
import type { LLMProvider } from "../llm/provider"

type ModelSelection = { providerID: string; modelID: string }
type WorkerInsight = { key: string; name: string; output: string }

const WRITE_EXTENSION = /\[WRITE_EXTENSION\]\s*(\{[\s\S]*?\})\s*\[\/WRITE_EXTENSION\]/gis
const SYNTHETIC_TEST = /\[SYNTHETIC_TEST\]\s*(\{[\s\S]*?\})\s*\[\/SYNTHETIC_TEST\]/gis

export type ExtensionRequest = {
  target: string
  reason: string
  source: WorkerInsight
}

export function hasEvolutionTriggers(insights: WorkerInsight[]): boolean {
  // See the comment in research-engine: shared `g`-flagged regexes
  // have stateful `lastIndex`. `.test()` would advance it and break
  // a later `matchAll`. Clone the regex per check.
  return insights.some((insight) => {
    const writeProbe = new RegExp(WRITE_EXTENSION.source, WRITE_EXTENSION.flags.replace("g", ""))
    const synthProbe = new RegExp(SYNTHETIC_TEST.source, SYNTHETIC_TEST.flags.replace("g", ""))
    return writeProbe.test(insight.output) || synthProbe.test(insight.output)
  })
}

export function extractExtensionRequests(insights: WorkerInsight[]): ExtensionRequest[] {
  const requests: ExtensionRequest[] = []
  for (const insight of insights) {
    const matches = insight.output.matchAll(WRITE_EXTENSION)
    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[1]) as { target?: string; reason?: string }
        if (typeof parsed.target === "string" && typeof parsed.reason === "string") {
          requests.push({ target: parsed.target, reason: parsed.reason, source: insight })
        }
      } catch {
        // skip malformed
      }
    }
  }
  return requests
}

export async function processEvolutionTriggers(
  insights: WorkerInsight[],
  coreDir: string,
  extDir: string,
  provider: LLMProvider,
  model: ModelSelection,
  _runsDir: string,
): Promise<{ extensionRequests: ExtensionRequest[]; notes: string[] }> {
  const requests = extractExtensionRequests(insights)
  const notes: string[] = []

  for (const request of requests) {
    const w12Prompt = await loadPrompt(coreDir, extDir, "W12_AUTO_TESTER.md")
    if (!w12Prompt) {
      notes.push(`Evolution request for ${request.target} skipped: W12_AUTO_TESTER.md missing`)
      continue
    }

    const testResponse = await provider.complete({
      system: w12Prompt,
      messages: [
        {
          role: "user",
          content: `Generate a synthetic test for target: ${request.target}\n\nReason: ${request.reason}`,
        },
      ],
      model,
    })
    notes.push(`Synthetic test generated for ${request.target}: ${testResponse.content.slice(0, 200)}...`)
  }

  return { extensionRequests: requests, notes }
}

async function loadPrompt(coreDir: string, extDir: string, filename: string): Promise<string | undefined> {
  const core = Bun.file(path.join(coreDir, filename))
  if (!(await core.exists())) return undefined
  const ext = Bun.file(path.join(extDir, filename))
  const extText = (await ext.exists()) ? await ext.text() : ""
  return (
    [
      (await core.text()).trim(),
      extText.trim() ? `\n\n--- SYSTEM EXTENSIONS & USER REFINEMENTS ---\n${extText.trim()}` : "",
    ]
      .join("")
      .trim() || undefined
  )
}
