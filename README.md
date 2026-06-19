# multimind-cli

> A background thinking pipeline that runs as a command. Provider-agnostic, stateless, designed to be driven by any LLM-powered tool.

```
$ echo '{"history": [...]}' | multimind think
{
  "thinking": "## Subconscious Heads-Up\n\nThe cache strategy is ...",
  "workers": ["W2", "W4", "W14"],
  "routerDecision": "ACTIVATE",
  "c0Decision": "safe_to_end",
  "totalDurationMs": 8421
}
```

---

## Why this exists

An LLM can produce fluent text in milliseconds. The hard part is producing **reliable**, **evidence-grounded**, **responsibly-scoped** work — the kind a senior engineer would be proud of. That kind of behavior is not a model property. It's a **system property**: the right cognitive dynamics, the right structural pressure, the right handoffs between stages.

Vanilla LLM calls have none of that. The model accepts the user's framing too easily, closes tasks before evidence exists, confuses plausible prose with verified work, and treats delivery as a label rather than a claim.

**multimind** is a harness — the part that imposes the cognitive dynamics. It runs a small set of background lenses (W0 through W17) and a synthesizer (C0) that together produce a completion contract: a written agreement about what was actually verified, what was merely claimed, and what's left to do.

The harness is a CLI. It takes context, runs the pipeline, returns the thinking. It is not coupled to OpenCode, Codex, Claude Code, or any specific tool. Any host that can capture a conversation and inject a response can drive it.

---

## The philosophy

> *"La efectividad y elegancia de un sistema depende mas de la elegancia de su filosofia de diseño subyacente que de la complejidad de su implementacion, no importa que tan fancy y compleja sea la ingenieria que estas metiendo, solo es ruido si no se alinea de manera elegante con una filosofia subyacente que sea limpia y clara."*

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

**Three responsibilities, three layers:**

| Layer | Responsibility | Where it lives |
|---|---|---|
| **Harness** | The thinking itself: W0 routing, worker execution, C0 synthesis, consolidation | `multimind-cli` (this repo) |
| **Provider** | How the harness calls an LLM (opencode serve, Anthropic direct, etc.) | `src/llm/*` |
| **Integration** | Captures context from a host tool, invokes the CLI, injects the output | The host's plugin code, ~50–100 lines per integration |

The harness does not know about integrations. Integrations do not know about worker internals. They meet at a JSON contract on stdin/stdout.

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

### Requirements

- Bun 1.3+
- An LLM provider. Default: `opencode serve` running on `OPENCODE_BASE_URL` (default `http://127.0.0.1:4096`).

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

# Check the provider
multimind status
```

### As a library

```ts
import { runThinkingPipeline, OpenCodeServeProvider } from "multimind-cli"

const provider = new OpenCodeServeProvider({ baseUrl: "http://127.0.0.1:4096" })
const result = await runThinkingPipeline(
  { history: [...], sessionID: "my-session" },
  provider,
)

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
  thinking: string                          // the synthesised delivery (markdown)
  workers: WorkerResult[]                   // what fired, in order
  routerDecision: "ACTIVATE" | "SKIP"
  c0Decision?: "safe_to_end" | "continue" | "blocked" | "missing"
  notes: string[]                           // free-form notes (e.g. "skipped: W0 said SKIP")
  totalDurationMs: number
  runRecordPath?: string                    // path to the full run record
}

type WorkerResult = {
  key: string                               // "W2", "W4", etc.
  name: string                              // display name
  output: string                            // the worker's full response
  durationMs: number
  usage: { inputTokens: number; outputTokens: number }
  error?: string                            // present if the worker failed
}
```

---

## How integrations work

The harness is intentionally decoupled from any specific host. The contract is just JSON in, JSON out. Each integration is a thin shim that does three things:

1. **Capture context** from the host (opencode session, codex chat, claude code transcript, custom state, etc.)
2. **Invoke the CLI** with that context
3. **Inject the output** back into the host as a system message, a status line, a separate panel, or whatever the host supports

Each integration is ~50–100 lines of glue.

| Integration | Where it lives | What it does |
|---|---|---|
| OpenCode plugin | the opencode monorepo (sibling to this repo) | Listens for `session.idle`, captures messages, calls the CLI, injects the thinking as a synthetic part |
| Codex skill | `examples/codex-skill/` (TBD) | Captures chat state, calls the CLI, formats the thinking as a Codex skill response |
| Claude Code skill | `examples/claude-skill/` (TBD) | Same shape, different capture/inject |

The shim pattern is small enough that adding a new integration is a half-day task, not a project.

---

## Customizing the LLM provider

The CLI ships with one provider: `OpenCodeServeProvider`, which talks to a running `opencode serve` via the OpenCode SDK. To add another provider, implement `LLMProvider`:

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
│   │   └── opencode-serve.ts     # OpenCode SDK implementation
│   ├── engines/
│   │   ├── research-engine.ts    # W13 [EXECUTE_RESEARCH] handler
│   │   └── evolution-engine.ts   # W10 [WRITE_EXTENSION] handler
│   └── prompts/                  # W0, W1–W17, C0, worker-kernels
├── bin/
│   └── multimind.ts              # CLI entry point
├── tests/
│   ├── pipeline.test.ts          # 7 tests: pipeline orchestrator with mock LLM
│   ├── contract.test.ts          # 10 tests: package shape, prompt coverage, schema
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
bun test                 # all 21 tests
bun typecheck            # tsc --noEmit
bun run bin/multimind.ts eval --limit 1   # smoke against a real LLM
```

The pipeline tests use a scripted `LLMProvider` so they don't need a real LLM. The eval suite needs an LLM provider (default: `opencode serve` running on `:4096`).

To add a new worker:

1. Write the prompt at `src/prompts/W<n>_NAME.md`
2. The router will pick it up via the `WORKERS:` directive in W0's output
3. Or, callers can force-fire specific workers with the `workers` override in `ThinkingInput`

To add a new LLM provider:

1. Implement `LLMProvider` in `src/llm/<name>.ts`
2. Export it from `src/index.ts`
3. Callers can use it directly: `runThinkingPipeline(input, new YourProvider())`

To add a new integration:

1. Write a small shim in your host's plugin directory
2. The shim captures context, invokes the CLI, injects the output
3. The integration does not need to know about workers, providers, or any internal detail

---

## Status

**What works:**

- W0 router, W1–W17 workers, C0 synthesizer, consolidator
- Research and evolution engines
- LLM-as-judge eval scoring
- 50-case reaction eval dataset
- OpenCode Serve provider
- Provider abstraction (LLMProvider interface)
- CLI with `think` and `eval` subcommands
- 21 unit + contract tests, all passing
- Self-improvement loop (extends engine; empirical validation lives in the opencode monorepo's eval driver for now)

**What is next:**

- Direct providers (Anthropic, OpenAI, DeepSeek) so the CLI does not need `opencode serve` running
- A second integration (Codex or Claude Code skill) as a worked example
- Streaming output mode (currently the CLI waits for the full pipeline to finish)
- Eval reports in the README so each release shows the current pass rate

**What is intentionally not built:**

- Trigger modes (auto-fire every N turns, etc.). The caller decides when to think. The harness is stateless.
- Per-session state. Every invocation is a fresh think.
- A bundled web UI. The CLI is the interface.
- A hosted version. This is a local tool by design.

---

## License

MIT
