/**
 * Config store — reads and writes the user's multimind config file.
 *
 * Default location: $XDG_CONFIG_HOME/multimind/config.json (falls back to
 * ~/.config/multimind/config.json, then ~/.multimind/config.json).
 *
 * The CLI's `config` subcommand is the canonical way to populate this
 * file. Users who prefer environment variables can still set
 * LLM_BASE_URL / LLM_API_KEY / LLM_MODEL in their shell; the provider
 * checks env vars first and falls back to the file.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export type ConfigShape = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

const DEFAULT_CONFIG: ConfigShape = {
  baseUrl: "https://opencode.ai/zen/go/v1",
  apiKey: "",
  model: "minimax-m3",
  timeoutMs: 120_000,
}

const XDG = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config")
const CANDIDATE_PATHS = [
  path.join(XDG, "multimind", "config.json"),
  path.join(os.homedir(), ".multimind", "config.json"),
]

export function configFilePath(): string {
  return CANDIDATE_PATHS[0]
}

export async function loadConfig(): Promise<{ config: ConfigShape; path: string | null }> {
  for (const candidate of CANDIDATE_PATHS) {
    if (existsSync(candidate)) {
      try {
        const text = await readFile(candidate, "utf8")
        const parsed = JSON.parse(text) as Partial<ConfigShape>
        return {
          config: { ...DEFAULT_CONFIG, ...parsed },
          path: candidate,
        }
      } catch {
        // Treat unreadable / malformed config as missing; the defaults win.
      }
    }
  }
  return { config: DEFAULT_CONFIG, path: null }
}

export async function saveConfig(patch: Partial<ConfigShape>): Promise<string> {
  const current = await loadConfig()
  const next = { ...current.config, ...patch }
  const filePath = current.path ?? CANDIDATE_PATHS[0]
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`)
  return filePath
}
