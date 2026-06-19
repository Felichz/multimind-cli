/**
 * Research engine — handles W13 [EXECUTE_RESEARCH] requests.
 *
 * Decoupled from the OpenCode Plugin API: takes an LLMProvider directly.
 * The pipeline passes the same provider it uses for workers, so the research
 * engine inherits whatever auth, models, and retry behaviour the provider
 * already has.
 */

import path from "node:path"
import type { LLMProvider } from "../llm/provider"

type ModelSelection = { providerID: string; modelID: string }

type WorkerInsight = { key: string; name: string; output: string }

const EXECUTE_RESEARCH = /\[EXECUTE_RESEARCH\]\s*(\{[\s\S]*?\})\s*\[\/EXECUTE_RESEARCH\]/gis

export type ResearchRequest = {
  queries: string[]
  source: WorkerInsight
  fullMatch: string
}

export function hasResearchTriggers(insights: WorkerInsight[]): boolean {
  return insights.some((insight) => EXECUTE_RESEARCH.test(insight.output))
}

export function extractResearchRequests(insights: WorkerInsight[]): ResearchRequest[] {
  const requests: ResearchRequest[] = []
  for (const insight of insights) {
    EXECUTE_RESEARCH.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = EXECUTE_RESEARCH.exec(insight.output))) {
      try {
        const parsed = JSON.parse(match[1]) as { queries?: string[] }
        if (Array.isArray(parsed.queries) && parsed.queries.length) {
          requests.push({ queries: parsed.queries, source: insight, fullMatch: match[0] })
        }
      } catch {
        // Malformed research request — skip silently. The pipeline logs it elsewhere.
      }
    }
  }
  return requests
}

export async function processResearchTriggers(
  insights: WorkerInsight[],
  promptsDir: string,
  provider: LLMProvider,
  model: ModelSelection,
): Promise<string[]> {
  const requests = extractResearchRequests(insights)
  const results: string[] = []

  for (const request of requests) {
    const researchPrompt = await loadPrompt(promptsDir, "W13_RESEARCHER.md")
    if (!researchPrompt) {
      results.push(`Research request skipped: W13_RESEARCHER.md not found`)
      continue
    }

    for (const query of request.queries) {
      const response = await provider.complete({
        system: researchPrompt,
        messages: [
          { role: "user", content: `Research query: ${query}\n\nSource worker: ${request.source.key} (${request.source.name})` },
        ],
        model,
      })
      results.push(`Research for "${query}":\n${response.content}`)
    }
  }

  return results
}

async function loadPrompt(promptsDir: string, name: string): Promise<string | undefined> {
  const file = Bun.file(path.join(promptsDir, name))
  if (!(await file.exists())) return undefined
  return (await file.text()).trim() || undefined
}
