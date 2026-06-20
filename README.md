# multimind-cli

> A background thinking pipeline that runs as a command. Provider-agnostic, stateless, designed to be driven by any LLM-powered tool.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178c6.svg)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![version](https://img.shields.io/badge/version-0.1.0-green.svg)](https://github.com/Felichz/multimind-cli)

```
$ echo '{"history": [...]}' | multimind think
{
  "headsUp": "[Subconscious Heads-Up]\n\nThe cache strategy carries ...",
  "workers": {
    "W2":  { "key": "W2",  "name": "GAP DETECTOR",      "output": "..." },
    "W4":  { "key": "W4",  "name": "RISK SCANNER",      "output": "..." },
    "W14": { "key": "W14", "name": "DELIVERY CONTRACT", "output": "..." }
  },
  "meta": {
    "routerDecision": "ACTIVATE",
    "c0Decision": "safe_to_end",
    "totalDurationMs": 8421,
    "runRecordPath": ".multimind/runs/...json"
  }
}
```

Inject `headsUp` into your host LLM as context. Use `workers.W17` to surface security findings. Use `meta.c0Decision` as an internal signal. The CLI is for thinking; the consumer is for answering — see [AGENTS.md](AGENTS.md) for the full philosophy.

**Latest eval (M3, opencode-go HTTP, 3 of 52 cases spot-checked):**

| Case | Score | min | Workers fired | Result |
|---|---:|---:|---|---|
| REACT-001 | 95 | 80 | W1 | ✓ pass |
| REACT-013 | 93 | 80 | W14 | ✓ pass |
| HO-002    | 82 | 80 | W14, W2, W4, W6, W17, W12, W8 | ✓ pass |

Mean: **90.0** · Pass rate: **3/3** · The full 50-case suite takes ~4 hours per run; spot-checks are run before each release.

---

## Why this exists

An LLM can produce fluent text in milliseconds. The hard part is producing **reliable**, **evidence-grounded**, **responsibly-scoped** work — the kind a senior engineer would be proud of. That kind of behavior is not a model property. It's a **system property**: the right cognitive dynamics, the right structural pressure, the right handoffs between stages.

Vanilla LLM calls have none of that. The model accepts the user's framing too easily, closes tasks before evidence exists, confuses plausible prose with verified work, and treats delivery as a label rather than a claim.

**multimind** is a harness — the part that imposes the cognitive dynamics. It runs a small set of background lenses (W0 through W17) and a synthesizer (C0) that together produce a completion contract: a written agreement about what was actually verified, what was merely claimed, and what's left to do.

The harness is a CLI. It takes context, runs the pipeline, returns the thinking. It is not coupled to OpenCode, Codex, Claude Code, or any specific tool. Any host that can capture a conversation and inject a response can drive it.

---

## The philosophy

> *"The effectiveness and elegance of a system depends more on the elegance of its underlying design philosophy than on the complexity of its implementation. No matter how fancy and complex the engineering you put in, it is just noise if it does not elegantly align with a clean and clear underlying philosophy."*

A small set of operating principles, derived from first principles about what makes LLM engineering actually work:

1. **Structure is all you need.** A capable model already has the latent reasoning. The harness's job is to organize when and how that reasoning gets used.
2. **Confidence is a claim, not a state.** Every "done", "ship", "go ahead" creates a claim about scope, evidence, and risk. The harness treats those claims as first-class objects.
3. **User pressure does not remove risk.** A casual "ship it" does not change the empirical facts about what was verified.
4. **The user should not carry the system's cognitive load.** The harness absorbs complexity. It hands back evidence, not vague reassurance.
5. **Sophistication is allowed only when it expresses a clean underlying idea.** Routing, eval machinery, dashboards — these are noise if they do not preserve a simple responsibility model.

These principles are not slogans. They translate into concrete mechanisms:

- **Evals emerge** because the system needs empirical feedback to know whether it improved.
- **Worker specialization emerges** because different professional failures require different cognitive lenses.
- **Delivery contracts emerge** because every "done" creates a claim.
- **Self-improvement loops emerge** because prompt changes are hypotheses until a fail-first case and regression gate prove them useful.

The implementation is allowed to grow in complexity only where it expresses one of these principles. Anything else is over-engineering.

---

## The design

```
                    ┌─────────────────────────────────────┐
                    │           multimind CLI             │
                    │  (bin/multimind.ts)                 │
                    └──────────────┬──────────────────────┘
                                   │ stdin: ThinkingInput
                                   │   { history, workers?, model?, config? }
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │                  runThinkingPipeline()                   │
        │                                                          │
        │   ┌─────────┐    ┌──────────┐    ┌────────────────────┐    │
        │   │   W0    │    │ Workers  │    │     Engines        │    │
        │   │ Router  │    │ W1..W17  │    │  research          │    │
        │   │         │    │ in       │    │  evolution         │    │
        │   │ SKIP?   │───▶│ parallel │───▶│  self-improve      │    │
        │   └─────────┘    └──────────┘    └─────────┬──────────┘    │
        │                                            │               │
        │                                            ▼               │
        │                                  ┌────────────────────┐    │
        │                                  │       C0           │    │
        │                                  │   Synthesizer      │    │
        │                                  │                    │    │
        │                                  │  completion        │    │
        │                                  │  contract          │    │
        │                                  └─────────┬──────────┘    │
        │                                            │               │
        │                                            ▼               │
        │                                  ┌────────────────────┐    │
        │                                  │   Consolidator     │    │
        │                                  │   (the brain)      │    │
        │                                  │                    │    │
        │                                  │   thinking string  │    │
        │                                  └────────────────────┘    │
        └──────────────────────────────────────────────────────────┘
                                   │
                                   ▼ stdout: ThinkingOutput
                                   { thinking, workers, c0Decision, ... }
```

**Two layers, one contract between them:**

| Layer | Responsibility | Where it lives |
|---|---|---|
| **Harness** | The thinking itself: W0 routing, worker execution, C0 synthesis, consolidation | `multimind-cli` (this repo) |
| **Provider** | A small client that turns an `LLMRequest` into a chat completions HTTP call | `src/llm/openai-compat.ts` (default) + any user-supplied implementation |

The harness does not know how LLM calls are made. The provider does not know about worker internals. The two meet at the `LLMProvider` interface. The default provider is a plain `fetch` client — no SDK, no local server required.

---

## The mechanism

When you run `multimind think`, this is what happens:

1. **Validate the input.** The CLI parses the `history` (an array of messages), confirms the assistant has answered the latest real user message, and rejects self-injections (messages with `metadata.source === "multimind"`) so the pipeline does not recurse on its own output.

2. **Run W0 — the router.** A small LLM call asks: *is background thinking useful here?* It returns one of:
   - `STATUS: ACTIVATE` + a list of workers to run
   - `STATUS: SKIP` + a one-sentence reason
   - If the output is empty or malformed, the router is re-prompted once with a stricter contract.

3. **Run the selected workers in parallel.** Each worker (W1–W17) has a focused prompt. Examples:
   - W2 — gap detector: "what's missing from this claim?"
   - W4 — risk scanner: "what could go wrong here?"
   - W6 — LLM self-check: "are you being honest, or fluent?"
   - W14 — delivery contract: "what evidence would make 'done' honest?"
   - W10 — meta-improver: "how would you change the system to avoid this failure?"
   - The full set covers intent analysis, scientific validation, craftsmanship, autonomy, strategic foresight, architecture, auto-testing, research, and security.

4. **Post-process through the engines.** If any worker emitted an `[EXECUTE_RESEARCH]` marker, the research engine runs a follow-up investigation. If any worker emitted a `[WRITE_EXTENSION]` marker, the evolution engine asks W12 to generate a synthetic test and queues an empirical self-improvement candidate.

5. **Run C0 — the synthesizer.** A private synthesis stage asks the workers' outputs to agree on a completion contract. C0 ends with exactly one marker:
   - `[multimind:safe_to_end]` — workers agree the scope is verified, the main agent can stop.
   - `[multimind:continue]` — there's still concrete work to do.
   - `[multimind:blocked]` — the claim is too risky; the main agent should pause.

6. **Consolidate into a delivery block.** The consolidator turns worker outputs into a single, scannable markdown block. It leads with the visible artifact (what the user/main agent can see), then attaches the situational contracts (delivery obligations, evidence requirements, risk objects) that the workers raised.

7. **Return the result.** The CLI writes a JSON object on stdout with the thinking, the workers that fired, the C0 decision, the total duration, and the path to the full run record.

The pipeline is **stateless**. Each invocation is a fresh think. There is no per-session counter, no every-N-iterations scheduling, no trigger mode. The caller decides when to think — slash command, cron, scripted event, whatever.

---

## Quick start

### Install

```bash
git clone https://github.com/Felichz/multimind-cli.git
cd multimind-cli
bun install
```

The `multimind` binary lives at `bin/multimind.ts`. You can run it directly with `bun run bin/multimind.ts` or symlink it into your `PATH`.

### Configure the provider

Pick one:

```bash
# Option A: interactive setup wizard (recommended for first run)
bun run bin/multimind.ts config init

# Option B: set values one at a time
bun run bin/multimind.ts config set baseUrl "https://opencode.ai/zen/go/v1"
bun run bin/multimind.ts config set apiKey "sk-..."
bun run bin/multimind.ts config set model "minimax-m3"

# Option C: environment variables (override the file when set)
export LLM_BASE_URL="https://opencode.ai/zen/go/v1"
export LLM_API_KEY="sk-..."
export LLM_MODEL="minimax-m3"
```

The config file lives at `~/.config/multimind/config.json`. See `multimind config show` for the current resolved values, `multimind config path` for the file location.

Any OpenAI-compatible chat completions endpoint works: opencode-go, OpenAI, Ollama's OpenAI mode, LM Studio, vLLM, llama.cpp's server mode. The default provider is a plain `fetch` call — no proprietary SDK, no local server required.

### Run a single think

```bash
echo '{
  "history": [
    { "info": { "id": "u1", "role": "user", "time": { "created": 1 } },
      "parts": [{ "type": "text", "text": "should I ship this cache change?" }] },
    { "info": { "id": "a1", "role": "assistant", "time": { "created": 2 } },
      "parts": [{ "type": "text", "text": "yes it looks fine" }] }
  ]
}' | bun run bin/multimind.ts think
```

### Run the eval suite

```bash
bun run bin/multimind.ts eval --limit 5    # smoke
bun run bin/multimind.ts eval              # all 50 cases
bun run bin/multimind.ts eval --case REACT-001
bun run bin/multimind.ts eval --no-judge --output report.json
```

---

## Usage

### As a CLI

```bash
# Pipe context as JSON on stdin
echo '{"history": [...]}' | multimind think

# Or via file
multimind think --input context.json --output thinking.json

# Override the model
multimind think --input context.json --model opencode/deepseek-v4-flash-free

# Override the worker list (skips the router's choice)
echo '{"history": [...], "workers": ["W2", "W4"]}' | multimind think

# Run evals
multimind eval [--case ID] [--limit N] [--no-judge] [--output report.json]

# Provider setup
multimind config init                  # interactive wizard
multimind config show                  # show resolved config
multimind config path                  # print config file path
multimind config set apiKey "sk-..."   # set a value

# Check the provider
multimind status
```

The CLI has one job: take context, return a heads-up. The heads-up is the structured thinking a downstream LLM (the consumer) should see as context. The CLI does not produce user-facing messages — that is the consumer's responsibility, by design. See `AGENTS.md` for the full philosophy.

### As a library

```ts
import { runThinkingPipeline, OpenAICompatProvider } from "multimind-cli"

const provider = new OpenAICompatProvider()
const result = await runThinkingPipeline(
  { history: [...], sessionID: "my-session" },
  provider,
)

// `result.thinking` is the heads-up — the structured thinking a
// downstream LLM (the consumer) should see as context. The CLI does
// not produce user-facing responses; the consumer is responsible for
// turning the heads-up into whatever message format it needs. See
// AGENTS.md for the philosophy behind that boundary.
console.log(result.thinking)
```

### The input shape

```ts
type ThinkingInput = {
  history: Message[]                        // recent conversation (last 10 used)
  workers?: string[]                        // optional: override the router's choice
  model?: string                            // optional: "provider/model" form
  config?: Partial<SubconsciousConfig>      // optional: per-run config overrides
  sessionID?: string                        // optional: for log correlation
}

type Message = {
  info: {
    id?: string
    role: "user" | "assistant" | string
    time: { created: number; completed?: number }
  }
  parts: Array<{
    type: "text"
    text: string
    synthetic?: boolean
    ignored?: boolean
    metadata?: Record<string, unknown>      // metadata.source === "multimind" marks self-injections
  }>
}
```

### The output shape

```ts
type ThinkingOutput = {
  headsUp: string                           // the consolidated heads-up (markdown)
  workers: Record<string, WorkerOutput>     // per-worker outputs, keyed by worker key
  meta: ThinkingMeta                        // pipeline-level metadata
}

type WorkerOutput = {
  key: string                               // "W2", "W4", etc. (also the map key)
  name: string                              // display name
  output: string                            // the worker's full response
  durationMs: number
  usage: { inputTokens: number; outputTokens: number }
  error?: string                            // present if the worker failed
}

type ThinkingMeta = {
  sessionID?: string
  routerDecision: "ACTIVATE" | "SKIP"
  c0Decision?: "safe_to_end" | "continue" | "blocked" | "missing"
  notes: string[]                           // free-form notes (e.g. "skipped: W0 said SKIP")
  totalDurationMs: number
  runRecordPath?: string                    // path to the full run record
}
```

The shape is intentionally split so the consumer can pick which part to use without scanning the whole thing:

- **`headsUp`** — the consolidated thinking. Inject this as context for the host LLM.
- **`workers`** — each worker's raw output, keyed by worker name (`workers.W14`, `workers.W17`, ...). Useful for targeted inspection ("show me the security findings" → `workers.W17`).
- **`meta`** — pipeline-level metadata. The router decision, the C0 verdict, timing, the run record path. Most consumers can ignore this; it's there for debugging and for the eval runner.

A consumer that just wants the heads-up to feed its host LLM:

```ts
const result = await runThinkingPipeline(input, provider)
const ctx = result.headsUp                          // markdown string
```

A consumer that wants to surface specific worker findings to the user:

```ts
const security = result.workers.W17?.output         // the security worker's full output
const risks = result.workers.W4?.output             // the risk scanner's full output
```

A consumer that wants full telemetry:

```ts
const decision = result.meta.c0Decision             // "safe_to_end" | "continue" | "blocked" | "missing"
const record = await Bun.file(result.meta.runRecordPath!).json()  // every prompt, every raw response
```

---

## Customizing the LLM provider

The CLI ships with one default provider: `OpenAICompatProvider`, a plain `fetch` client that talks to any OpenAI-compatible chat completions endpoint. The implementation is ~100 lines, no SDK, no native binding. Set `LLM_BASE_URL` and `LLM_API_KEY` to point it at your service.

To add a custom provider (e.g. for streaming, Anthropic direct, a local model with a non-standard wire format), implement `LLMProvider`:

```ts
import type { LLMProvider, LLMRequest, LLMResponse } from "multimind-cli/llm/provider"

class AnthropicDirectProvider implements LLMProvider {
  readonly name = "anthropic-direct"
  async complete(request: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    // call Anthropic's API directly using the official SDK
  }
}

// Wire it in
import { runThinkingPipeline } from "multimind-cli"
const result = await runThinkingPipeline(input, new AnthropicDirectProvider())
```

The same pattern works for OpenAI direct, DeepSeek direct, local models via Ollama, or any other LLM source.

---

## Project structure

```
multimind-cli/
├── src/
│   ├── index.ts                  # main public exports
│   ├── types.ts                  # ThinkingInput, ThinkingOutput, SubconsciousConfig
│   ├── consolidator.ts           # output synthesis (delivery block, contracts, evidence)
│   ├── debug-store.ts            # run records for post-hoc inspection
│   ├── pipeline/
│   │   └── run.ts                # the thinking orchestrator (W0, workers, C0, engines)
│   ├── llm/
│   │   ├── provider.ts           # LLMProvider interface
│   │   └── openai-compat.ts      # default HTTP provider (plain fetch)
│   ├── engines/
│   │   ├── research-engine.ts    # W13 [EXECUTE_RESEARCH] handler
│   │   └── evolution-engine.ts   # W10 [WRITE_EXTENSION] handler
│   └── prompts/                  # W0, W1–W17, C0, worker-kernels
├── bin/
│   └── multimind.ts              # CLI entry point
├── tests/
│   ├── pipeline.test.ts          # 7 tests: pipeline orchestrator with mock LLM
│   ├── contract.test.ts          # 11 tests: package shape, prompt coverage, schema
│   └── dataset.test.ts           # 4 tests: dataset well-formedness
├── evals/
│   ├── dataset.jsonl             # 50 reaction-eval cases
│   ├── runner.ts                 # eval driver (calls runThinkingPipeline for each case)
│   ├── scorer.ts                 # LLM-as-judge
│   └── runs/                     # per-case run records (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development

```bash
bun run ci               # typecheck + lint + tests (one command)
bun test                 # 70 tests + 1 live-LLM-gated (set MULTIMIND_TEST_LIVE=1)
bun run lint             # biome check (read-only)
bun run format           # biome format --write
bun typecheck            # tsc --noEmit (no behaviour change)
```

The pipeline tests use a scripted `LLMProvider` so they don't need a real LLM. The eval suite needs a configured `OpenAICompatProvider` (set `MULTIMIND_BASE_URL`, `MULTIMIND_API_KEY`, `MULTIMIND_MODEL` or run `bun run bin/multimind.ts config init`).

To add a new worker:

1. Write the prompt at `src/prompts/W<n>_NAME.md` (one file per worker, never two — duplicate file names throw at startup)
2. The router will pick it up via the `WORKERS:` directive in W0's output
3. Or, callers can force-fire specific workers with the `workers` override in `ThinkingInput`
4. The contract test `core worker prompts cover W1 through W17` in `tests/contract.test.ts` will fail if a prompt file is missing

To add a new LLM provider:

1. Implement `LLMProvider` in `src/llm/<name>.ts` (~100 lines is enough — see `openai-compat.ts` for the minimum)
2. Export it from `src/index.ts`
3. Callers use it directly: `runThinkingPipeline(input, new YourProvider())`

---

## Status

**What works:**

- W0 router, W1–W17 workers, C0 synthesizer, consolidator
- Research and evolution engines
- LLM-as-judge eval scoring (calibrated rubric, heads-up lens)
- 52-case reaction eval dataset
- OpenAI-compatible HTTP provider (default, no SDK)
- Provider abstraction (`LLMProvider` interface) for custom implementations
- CLI with `think`, `config`, `eval`, and `status` subcommands
- **70 tests + 1 live-LLM-gated test, all passing** (pipeline, contract, dataset, provider, consolidator, scorer, CLI)
- User-specific prompt extensions in `src/prompts-extensions/` (gitignored, per-user)
- Local CI: `bun run ci` runs typecheck + lint + tests in one command

**Latest eval results (M3 via opencode-go HTTP, 3 of 52 cases spot-checked):**

| Case | Score | min | Result |
|---|---:|---:|:---:|
| REACT-001 | 95 | 80 | ✓ pass |
| REACT-013 | 93 | 80 | ✓ pass |
| HO-002    | 82 | 80 | ✓ pass |

Mean: **90.0** · Pass rate: **3/3** · Run `bun run bin/multimind.ts eval --case <ID>` to reproduce.

**What is intentionally not built:**

- Trigger modes (auto-fire every N turns, etc.). The caller decides when to think. The harness is stateless.
- Per-session state. Every invocation is a fresh think.
- A user-facing response synthesizer. That is the consumer's job — see [AGENTS.md](AGENTS.md) for the boundary.
- A bundled web UI. The CLI is the interface.
- A hosted version. This is a local tool by design.

---

## License

MIT
