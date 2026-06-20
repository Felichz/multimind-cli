# AGENTS.md

This document is for any agent, contributor, or curious reader who needs to understand the boundary of what `multimind-cli` does — and, just as importantly, what it deliberately does not do.

If you are building on top of the CLI, read this before you start. Most of the design friction in this codebase comes from misunderstanding the boundary, and most of the cleanup work was undoing features that crossed it.

---

## The one-line summary

**The CLI is a thinking engine. It is not an answering engine.**

It takes a conversation as input and returns a "Subconscious Heads-Up" — a structured piece of internal context. The CLI's job ends there. Turning that heads-up into a user-facing message is the consumer's responsibility.

---

## The contract

```
Input:   { history: Message[], workers?, model?, config? }
Output:  { headsUp, workers, meta }
```

That is the whole public contract. The output is split on purpose: the consolidated thinking is in `headsUp`, the per-worker outputs are in `workers` (keyed by worker key), and pipeline-level metadata is in `meta`. The split mirrors the boundary — the consumer picks which part to use, the CLI does not decide for them.

---

## The boundary

The CLI does four things:

1. **Routing.** W0 decides whether background thinking is useful here, and if so which workers to run.
2. **Parallel lens execution.** The selected workers (W1–W17) run in parallel. Each is a small, focused LLM call.
3. **C0 synthesis.** A private synthesis step asks the workers to agree on a completion contract. C0 emits exactly one marker: `safe_to_end`, `continue`, or `blocked`.
4. **Consolidation.** The consolidator turns worker outputs into a single, scannable markdown block — the heads-up.

The CLI does NOT do any of these:

- **Synthesize a user-facing response.** That is the consumer's job. The CLI used to expose a `synthesizeFinalResponse()` function. It was removed. The reason is below.
- **Schedule itself.** There is no every-N-turns trigger, no armed mode, no auto-fire. The caller decides when to call `think`. The CLI is stateless.
- **Render UI.** TUI, web, markdown preview, whatever — none of it lives here. The CLI writes JSON to stdout.
- **Manage conversation state.** No session memory, no per-user history, no "previous response" cache. Each call is a fresh think.
- **Decide UI presentation.** Tone, length, formatting, emoji, disclaimers — all consumer concerns.

The reason this boundary is enforced by tests, not just convention: see `tests/contract.test.ts` — there is an explicit test that the library does not export `synthesizeFinalResponse`. If you add it back, that test fails and you have to defend the change.

---

## Why synthesis is the consumer's job

There were three different reasons, layered:

**1. The CLI is provider-agnostic. Synthesis is host-specific.**

The CLI talks to LLMs through an `LLMProvider` interface. The default implementation is a 100-line `fetch` wrapper. Any consumer that uses the CLI gets to pick its own provider, its own model, its own latency budget. Synthesis, by contrast, depends on the host's environment: which model the host is using, what the host's prompt template looks like, what other context the host has, what the user expects to see.

If the CLI synthesized, the consumer would either:
- Ignore the synthesis and waste a model call, or
- Use the synthesis and lose the ability to choose how their model turns the heads-up into a response.

Either way, the synthesis step in the CLI is at best redundant and at worst harmful.

**2. The CLI is for thinking. Synthesis is for presentation.**

The heads-up is structured: it has worker sections, a delivery block, evidence gates, risk objects. It is intentionally long. It is not a user-facing artifact.

Synthesis is the act of taking that long structured thinking and turning it into a short, polite, decision-led message. That is a different cognitive task. It is the kind of thing a host LLM does naturally when it sees the heads-up in its own context.

**3. The judge tests the right thing only when synthesis is not in the loop.**

When the CLI returns a synthesized response, the LLM-as-judge scores that response. When the CLI returns the heads-up, the judge scores the thinking. The thinking is what the CLI controls. The synthesis is what the consumer's model controls. The CLI's quality signal is the thinking's quality signal.

This is why `synthesizeFinalResponse` was removed, and why `multimind answer` was removed as a subcommand, and why the eval runner now scores heads-up directly with a judge that has a "thinking quality" lens (not a "user-facing response quality" lens).

---

## What the consumer does

The CLI does not care who or what the consumer is. Some examples:

**OpenCode plugin.** The plugin captures the conversation, calls `multimind think`, injects `result.headsUp` as a synthetic message in the opencode session with `metadata.source === "multimind"`, and lets the opencode agent's next LLM turn produce the user-facing response. The CLI sees this as a regular stdin call. It does not know about opencode.

**A Codex skill or Claude Code skill.** Same pattern: capture context, call `multimind think`, hand `result.headsUp` to the host LLM.

**A non-LLM consumer.** A script, a CI step, a tool that wants to score a conversation. The CLI still returns the heads-up. The script can read `result.headsUp`, scan `result.meta.c0Decision` for `[multimind:blocked]` markers, write the heads-up to a file, etc. The script does not need a downstream LLM to use the CLI.

**A smoke test.** `multimind eval` is the consumer of itself. The eval runner calls the pipeline, then asks a judge LLM to score `result.headsUp`. The judge is not the user. The judge is the CLI's quality signal.

**A user-facing debug surface.** A consumer that wants to show the user "we identified these risks" reads `result.workers.W4` (risk scanner), `result.workers.W17` (security check), `result.workers.W2` (gap detector). The CLI does not flatten this into a UI; the consumer builds the UI it needs from the parts the CLI returns.

---

## The output shape, in detail

The output is split on purpose. Each top-level field answers a different question:

| Field | Question it answers | When to use it |
|---|---|---|
| `headsUp` | "What is the consolidated thinking the host LLM should see as context?" | Always — this is the main artifact. |
| `workers[key]` | "What did a specific lens say?" | Targeted inspection. `workers.W17` is the security findings. `workers.W4` is the risk scanner. The consumer picks. |
| `meta.routerDecision` | "Did the pipeline activate at all?" | Logging, telemetry, deciding whether to use `headsUp` at all (it is empty if the router said SKIP). |
| `meta.c0Decision` | "What did the workers' private synthesis conclude?" | `safe_to_end` / `continue` / `blocked` / `missing`. The consumer's host LLM can use this as an internal signal. |
| `meta.runRecordPath` | "Where is the full trace?" | Post-hoc debugging. Contains every prompt and every raw response, including the ones not shown in `headsUp`. |
| `meta.totalDurationMs` | "How long did this take?" | Telemetry, latency budgets. |

A consumer that just wants the heads-up to feed its host LLM:

```ts
const result = await runThinkingPipeline(input, provider)
const ctx = result.headsUp
```

A consumer that wants to surface specific worker findings:

```ts
const security = result.workers.W17?.output
const risks = result.workers.W4?.output
```

A consumer that wants full telemetry:

```ts
const decision = result.meta.c0Decision
const record = await Bun.file(result.meta.runRecordPath!).json()
```

The split exists because the consumer has a job the CLI does not: deciding which parts of the thinking to use, in which order, for which audience. Flattening the output into a single `thinking: string` would force every consumer to either parse the heads-up or accept it whole. Neither is good. The structured shape lets the consumer do whatever it wants.

---

## What you should not add to this repo

If you are tempted to add any of the following, stop. It is the consumer's job, not the CLI's:

- A `multimind answer` subcommand
- A `synthesizeFinalResponse` function in the public API
- A `formatForUser` helper
- A "tone" or "voice" config
- A streaming output mode that emits the synthesized response
- A user-facing message template
- A "default response when workers say SKIP" handler

If the CLI needs to know about it to do its job, it belongs here. If the CLI is just passing it through, it does not.

---

## The thinking-vs-answering line in practice

A useful exercise: for any feature you are considering, ask "does this help the CLI produce better thinking, or does it help something downstream produce a better response?"

| Concern | Belongs in CLI? |
|---|---|
| A new worker lens (W18) | Yes — better thinking |
| A router improvement (W0) | Yes — better thinking |
| A new provider implementation | Yes — needed for the thinking to be possible |
| A new consolidation format | Yes — better thinking |
| A new judge rubric | Yes — better measurement of thinking quality |
| A user-facing message format | No — consumer concern |
| A way to inject the heads-up into a specific host's session | No — consumer concern |
| A way to make the model return shorter responses | No — model concern |
| A way to pre-craft the response tone | No — consumer concern |
| A "default response when SKIP" | No — consumer concern |

---

## What this looks like in the code

A few examples of where the boundary is enforced:

**`src/pipeline/run.ts`:** `runThinkingPipeline` returns `ThinkingOutput` with `headsUp: string`, `workers: Record<string, WorkerOutput>`, and `meta: ThinkingMeta`. There is no `synthesizeFinalResponse` export.

**`bin/multimind.ts`:** The only subcommand that produces a result is `think`. There is no `answer`. The `config`, `status`, and `eval` subcommands are operational.

**`src/index.ts`:** Public exports are `runThinkingPipeline`, `OpenAICompatProvider`, the `LLMProvider` types, the consolidator, the engines, the type definitions. No `synthesizeFinalResponse`.

**`tests/contract.test.ts`:** `test("the library does NOT export synthesizeFinalResponse (the consumer's job)", ...)`. If you add it back, this test fails.

**`evals/scorer.ts`:** The judge prompt's first paragraph says the input is "private, structured context that a downstream LLM (the consumer) will read." The scoring bands are calibrated for thinking quality, not user-facing response quality.

**`evals/runner.ts`:** After the pipeline runs, the runner does not call any synthesis step. The judge scores the heads-up. The runner writes the heads-up to the report. That is it.

---

## How to think about adding a new feature

Before writing code, ask:

1. **Is this the CLI's job?** Run through the table above. If the answer is "no, this is the consumer's job," do not add it. Document the consumer pattern in this file instead.
2. **Does the consumer need this in the public API?** If a consumer needs something the CLI does not currently expose, that is a feature request — talk to the user, do not silently add it.
3. **Does this improve the thinking, or does it make the thinking easier to ignore?** Length, formatting, and structure help. Politeness, tone, and apologetic framing hurt.
4. **Will the judge still score this correctly?** The judge's job is to score thinking quality. If a feature makes the heads-up score worse on the judge but better on a downstream quality signal, that is a smell. The CLI's signal is the judge's signal.

If you are not sure, default to leaving the feature out. The CLI is small on purpose. Every line of code in here is a line of code someone has to maintain, and a line of code the user has to trust.

---

## License of the boundary

The boundary is enforced by tests, by the public exports list, by the CLI's subcommand surface, and by this document. None of these are unbreakable. Anyone can change them. If you change them, the change should be in a pull request that explicitly addresses the question: "why is the consumer no longer the right place for this?"

If the answer is "the consumer cannot do it," that is a different conversation. But start from the assumption that the consumer is always the right place, and earn the right to put it in the CLI.
