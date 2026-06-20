#!/usr/bin/env bun
/**
 * multimind CLI — the thinking pipeline as a command.
 *
 * Usage:
 *   multimind think < input.json > output.json
 *   echo '{"history": [...]}' | multimind think
 *   multimind think --input ctx.json --output thinking.json
 *   multimind config [show | set <key> <value> | path | init]
 *   multimind status
 *   multimind eval [--case ID] [--limit N] [--no-judge] [--output file]
 *
 * The CLI is stateless and provider-agnostic. It reads context, runs the
 * thinking pipeline, writes the result. No trigger modes, no per-session
 * counters, no proprietary SDK.
 */

import path from "node:path"
import { runThinkingPipeline, synthesizeFinalResponse, OpenAICompatProvider } from "../src/index"
import { configFilePath, loadConfig, saveConfig } from "../src/config-store"
import type { ThinkingInput, ThinkingOutput } from "../src/types"

const USAGE = `multimind — background thinking pipeline

Usage:
  multimind think [--input file] [--output file] [--model provider/model]
  multimind answer [--input file] [--output file] [--model provider/model]
  multimind config [show | set <key> <value> | path | init]
  multimind status
  multimind eval [--case ID] [--limit N] [--no-judge] [--output file]

"think" returns the raw thinking (the heads-up). The intended use is
to feed it as context to a host LLM (e.g. an opencode agent) which
then produces the user-facing response as part of its next turn.

"answer" returns a tight user-facing response. It runs the pipeline
plus a downstream LLM step that turns the heads-up into a message
suitable for direct delivery. Use this when no host LLM is in the
loop.

Input: JSON object on stdin or --input, with shape:
  {
    "history": [{ "info": { "role": "user|assistant", "time": { "created": N } }, "parts": [{ "type": "text", "text": "..." }] }],
    "workers"?: ["W2", "W4"],
    "model"?: "provider/model",
    "config"?: { ... }
  }

Output: JSON object with { thinking, workers, routerDecision, c0Decision?, notes, totalDurationMs }

Config subcommands:
  multimind config          # show current resolved config (env + file)
  multimind config set <k> <v>  # set baseUrl / apiKey / model / timeoutMs
  multimind config path     # print the config file path
  multimind config init     # interactive setup wizard
`

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE)
    return
  }

  if (command === "status") {
    const provider = new OpenAICompatProvider()
    console.log(JSON.stringify({ provider: provider.name }, null, 2))
    return
  }

  if (command === "config") {
    await runConfig(args.slice(1))
    return
  }

  if (command === "eval") {
    const { spawn } = await import("node:child_process")
    const runnerArgs = ["run", path.join(import.meta.dir, "..", "evals", "runner.ts"), ...args.slice(1)]
    const child = spawn("bun", runnerArgs, { stdio: "inherit" })
    child.on("exit", (code) => process.exit(code ?? 1))
    return
  }

  if (command !== "think" && command !== "answer") {
    console.error(`Unknown command: ${command}\n\n${USAGE}`)
    process.exit(1)
  }

  const input = await readInput(args)
  const model = input.model ?? process.env.MULTIMIND_MODEL

  const provider = new OpenAICompatProvider()
  const pipelineResult = await runThinkingPipeline({ ...input, model }, provider)

  if (command === "answer") {
    // The "answer" command runs the full flow: pipeline (heads-up) +
    // a downstream LLM step that turns the heads-up into a tight
    // user-facing message. In an opencode-style integration the host's
    // LLM does this step naturally as part of its next turn; the
    // "answer" command is the standalone equivalent.
    const recentHistory = (input.history ?? [])
      .filter((m) => m.info.role === "user" || m.info.role === "assistant")
      .map((m) => {
        const text = m.parts.filter((p) => p.type === "text").map((p) => p.text).join("")
        return `[${m.info.role === "user" ? "User" : "Assistant"}]: ${text}`
      })
      .join("\n\n")
    const synthesized = await synthesizeFinalResponse(
      provider,
      pipelineResult.thinking,
      recentHistory,
      model ? { providerID: model.split("/")[0]!, modelID: model.split("/").slice(1).join("/") } : undefined,
    )
    await writeOutput(args, { ...pipelineResult, thinking: synthesized })
    return
  }

  await writeOutput(args, pipelineResult)
}

async function runConfig(args: string[]): Promise<void> {
  const sub = args[0]

  if (!sub || sub === "show") {
    const { config, path: filePath } = await loadConfig()
    console.log(JSON.stringify({ config, source: filePath ?? "(defaults)" }, null, 2))
    return
  }

  if (sub === "path") {
    console.log(configFilePath())
    return
  }

  if (sub === "set") {
    const key = args[1]
    const value = args[2]
    if (!key || value === undefined) {
      console.error("Usage: multimind config set <key> <value>")
      console.error("Keys: baseUrl, apiKey, model, timeoutMs")
      process.exit(1)
    }
    if (!["baseUrl", "apiKey", "model", "timeoutMs"].includes(key)) {
      console.error(`Unknown key: ${key}. Valid keys: baseUrl, apiKey, model, timeoutMs`)
      process.exit(1)
    }
    const patch = key === "timeoutMs" ? { timeoutMs: Number(value) } : { [key]: value }
    const filePath = await saveConfig(patch)
    console.log(`Wrote ${key} to ${filePath}`)
    return
  }

  if (sub === "init") {
    await runConfigInit()
    return
  }

  console.error(`Unknown config subcommand: ${sub}\n\n${USAGE}`)
  process.exit(1)
}

async function runConfigInit(): Promise<void> {
  const prompts: Array<[string, string]> = [
    ["baseUrl", "Base URL of OpenAI-compatible endpoint"],
    ["apiKey", "API key (leave empty if not needed)"],
    ["model", "Default model (e.g. minimax-m3, gpt-4, llama3)"],
  ]
  const patch: Record<string, string | number> = {}
  for (const [key, label] of prompts) {
    const answer = await prompt(label + ": ")
    if (answer) patch[key] = answer
  }
  const filePath = await saveConfig(patch)
  console.log(`\nConfig written to ${filePath}`)
  console.log("Run `multimind think` to verify the provider is reachable.")
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const readline = require("node:readline") as typeof import("node:readline")
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })
    rl.once("line", (line) => {
      rl.close()
      resolve(line.trim())
    })
  })
}

async function readInput(args: string[]): Promise<ThinkingInput> {
  const inputFlag = indexOf(args, "--input")
  if (inputFlag >= 0) {
    const file = args[inputFlag + 1]
    const text = await Bun.file(file).text()
    return JSON.parse(text) as ThinkingInput
  }
  const stdinText = await Bun.stdin.text()
  if (!stdinText.trim()) {
    console.error("No input. Provide --input file or pipe JSON on stdin.")
    process.exit(1)
  }
  return JSON.parse(stdinText) as ThinkingInput
}

async function writeOutput(args: string[], result: ThinkingOutput): Promise<void> {
  const outputFlag = indexOf(args, "--output")
  const json = JSON.stringify(result, null, 2)
  if (outputFlag >= 0) {
    await Bun.write(args[outputFlag + 1], json)
  } else {
    console.log(json)
  }
}

function indexOf(args: string[], flag: string): number {
  return args.indexOf(flag)
}

main().catch((error) => {
  console.error("multimind failed:", error instanceof Error ? error.message : String(error))
  if (process.env.MULTIMIND_DEBUG) console.error(error)
  process.exit(1)
})
