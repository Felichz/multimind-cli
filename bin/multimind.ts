#!/usr/bin/env bun
/**
 * multimind CLI — the thinking pipeline as a command.
 *
 * Usage:
 *   multimind think < input.json > output.json
 *   echo '{"history": [...]}' | multimind think
 *   multimind think --input ctx.json --output thinking.json
 *   multimind status
 *   multimind eval [--case ID] [--limit N] [--no-judge] [--output file]
 *
 * The CLI is stateless and provider-agnostic. It reads context, runs the
 * thinking pipeline, writes the result. No trigger modes, no per-session
 * counters, no OpenCode-specific code.
 */

import path from "node:path"
import { runThinkingPipeline, OpenCodeServeProvider } from "../src/index"
import type { ThinkingInput, ThinkingOutput } from "../src/types"

const USAGE = `multimind — background thinking pipeline

Usage:
  multimind think [--input file] [--output file] [--model provider/model]
  multimind status

Input: JSON object on stdin or --input, with shape:
  {
    "history": [{ "info": { "role": "user|assistant", "time": { "created": N } }, "parts": [{ "type": "text", "text": "..." }] }],
    "workers"?: ["W2", "W4"],
    "model"?: "provider/model",
    "config"?: { ... }
  }

Output: JSON object with { thinking, workers, routerDecision, c0Decision?, notes, totalDurationMs }
`

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE)
    return
  }

  if (command === "status") {
    const provider = new OpenCodeServeProvider()
    console.log(JSON.stringify({ provider: provider.name }, null, 2))
    return
  }

  if (command === "eval") {
    const { spawn } = await import("node:child_process")
    const runnerArgs = ["run", path.join(import.meta.dir, "..", "evals", "runner.ts"), ...args.slice(1)]
    const child = spawn("bun", runnerArgs, { stdio: "inherit" })
    child.on("exit", (code) => process.exit(code ?? 1))
    return
  }

  if (command !== "think") {
    console.error(`Unknown command: ${command}\n\n${USAGE}`)
    process.exit(1)
  }

  const input = await readInput(args)
  const model = input.model ?? process.env.MULTIMIND_MODEL

  const provider = new OpenCodeServeProvider()
  const result = await runThinkingPipeline({ ...input, model }, provider)

  await writeOutput(args, result)
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
