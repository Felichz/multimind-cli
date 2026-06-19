/**
 * Evolution engine — handles W10 [WRITE_EXTENSION] requests, asks W12 to
 * generate synthetic tests, queues empirical self-improvement candidates.
 *
 * Decoupled from the OpenCode Plugin API: takes an LLMProvider directly.
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
  return insights.some((insight) => WRITE_EXTENSION.test(insight.output) || SYNTHETIC_TEST.test(insight.output))
}

export function extractExtensionRequests(insights: WorkerInsight[]): ExtensionRequest[] {
  const requests: ExtensionRequest[] = []
  for (const insight of insights) {
    WRITE_EXTENSION.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WRITE_EXTENSION.exec(insight.output))) {
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
  promptsDir: string,
  provider: LLMProvider,
  model: ModelSelection,
  runsDir: string,
): Promise<{ extensionRequests: ExtensionRequest[]; notes: string[] }> {
  const requests = extractExtensionRequests(insights)
  const notes: string[] = []

  for (const request of requests) {
    const w12Prompt = await loadPrompt(promptsDir, "W12_AUTO_TESTER.md")
    if (!w12Prompt) {
      notes.push(`Evolution request for ${request.target} skipped: W12_AUTO_TESTER.md missing`)
      continue
    }

    const testResponse = await provider.complete({
      system: w12Prompt,
      messages: [
        { role: "user", content: `Generate a synthetic test for target: ${request.target}\n\nReason: ${request.reason}` },
      ],
      model,
    })
    notes.push(`Synthetic test generated for ${request.target}: ${testResponse.content.slice(0, 200)}...`)
  }

  return { extensionRequests: requests, notes }
}

async function loadPrompt(promptsDir: string, name: string): Promise<string | undefined> {
  const file = Bun.file(path.join(promptsDir, name))
  if (!(await file.exists())) return undefined
  return (await file.text()).trim() || undefined
}
