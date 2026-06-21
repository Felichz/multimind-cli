# Eval report — 52-case surface sweep

**Model:** `opencode-go/minimax-m3` (via opencode-go HTTP)
**Dataset:** `evals/dataset.jsonl` (52 cases, full)
**Date:** 2026-06-20
**Wall time:** ~3.5 hours
**Score range:** 0–100 (minScore per case from dataset)

## Summary

| Metric | Value |
|---|---:|
| Cases run | 52 / 52 |
| Pass | 43 (82.7%) |
| Fail | 9 (17.3%) |
| Mean | 81.2 |
| Median | 91 |
| Min | 0 |
| Max | 98 |

## Per-case results

### Pass (43)

| Case | Score | min | Workers fired |
|---|---:|---:|---|
| REACT-001 | 96 | 80 | W14, W6, W2, W4, W10, W3, W12, W11, W15 |
| REACT-002 | 91 | 80 | W2, W6, W7, W8, W11, W12, W14 |
| REACT-003 | 90 | 80 | W10, W3, W12 |
| REACT-004 | 88 | 80 | W3 |
| REACT-005 | 97 | 80 | W14, W10, W12, W3, W6, W2, W4 |
| REACT-006 | 91 | 80 | W11 |
| REACT-008 | 91 | 80 | W2, W4, W6, W8, W12, W14 |
| REACT-009 | 90 | 80 | W2, W4, W6, W7, W10, W12, W14, W3 |
| REACT-010 | 94 | 80 | W3, W12, W14, W6, W10, W7 |
| REACT-011 | 94 | 80 | W10 |
| REACT-012 | 90 | 80 | W1, W2, W6, W8, W11, W14 |
| REACT-014 | 90 | 80 | W2, W3, W4, W6, W8, W12, W14 |
| REACT-015 | 90 | 80 | W1, W3, W7, W14 |
| REACT-016 | 84 | 80 | W11, W15, W2, W4, W6, W14 |
| REACT-017 | 88 | 80 | W1, W3, W6, W10, W11, W12 |
| REACT-018 | 96 | 80 | W3, W6, W10, W12, W14 |
| REACT-019 | 90 | 80 | W10 |
| REACT-020 | 94 | 85 | W14, W2, W4, W6, W7, W11, W16, W17 |
| REACT-021 | 91 | 85 | W14, W2, W4, W6, W17, W12, W8 |
| REACT-022 | 90 | 85 | W14, W2, W4, W6, W12, W13, W17, W15, W7, W8 |
| REACT-023 | 92 | 85 | W8, W12, W6, W4 |
| REACT-024 | 97 | 85 | W1 |
| REACT-025 | 92 | 85 | W14, W8, W6, W3, W4 |
| REACT-026 | 88 | 85 | W2, W4, W6, W8, W14, W17 |
| REACT-027 | 96 | 85 | W14, W2, W4, W6, W3, W12, W7, W8 |
| REACT-028 | 94 | 85 | W2, W3, W6, W10, W11, W12, W14 |
| REACT-030 | 90 | 85 | W11, W15, W6, W9 |
| REACT-032 | 93 | 85 | W2, W3, W6, W10, W12 |
| REACT-033 | 96 | 85 | W10, W3, W12, W6, W7 |
| REACT-034 | 93 | 85 | W8, W14, W6, W12 |
| REACT-035 | 94 | 85 | W14, W3, W6, W12, W10 |
| REACT-036 | 90 | 85 | W14, W2, W4, W6 |
| REACT-038 | 89 | 85 | W11 |
| REACT-039 | 88 | 85 | W1, W2, W3, W4, W6, W12, W14 |
| REACT-040 | 92 | 85 | W2 |
| REACT-041 | 91 | 85 | W3, W10 |
| REACT-042 | 93 | 85 | W14, W2, W4, W6, W7, W11, W12, W13 |
| REACT-043 | 97 | 85 | W14, W13, W17, W4, W2, W6, W3, W12 |
| REACT-044 | 87 | 85 | W14, W2, W4, W6, W3, W12 |
| REACT-046 | 92 | 85 | W17 |
| REACT-048 | 98 | 80 | W10 |
| HO-001 | 94 | 85 | W14, W2, W4, W6, W13, W17, W7, W8 |
| HO-002 | 91 | 80 | W2, W4, W6, W14, W17, W12 |

### Fail (9)

| Case | Score | min | Workers | Type | Brief |
|---|---:|---:|---|---|---|
| REACT-007 | 0 | 80 | — | Pipeline SKIP | W0 router said SKIP |
| REACT-013 | 0 | 80 | W14, W3, W12, W6, W2, W17, W8 | Judge non-JSON | LLM judge returned malformed output |
| REACT-029 | 0 | 85 | W14 | Judge non-JSON | LLM judge returned malformed output |
| REACT-031 | 0 | 85 | — | Pipeline SKIP | W0 router said SKIP |
| REACT-037 | 68 | 85 | W3 | Thinking (1 worker) | "remained at conceptual level, failed to instantiate concrete operational artifacts" |
| REACT-045 | 0 | 85 | — | Pipeline SKIP | W0 router said SKIP |
| REACT-047 | 58 | 80 | W1 | Thinking (1 worker) | "materially missed the system-learning/operational-loop dimension" |
| HO-003 | 76 | 80 | W2 | Thinking (1 worker) | "did not address the in-flight session risk" |
| REACT-049 | 68 | 85 | W6 | Thinking (1 worker) | "routed to abstract eval design instead of [WRITE_SYNTHETIC_TEST] artifact" |

## Failure analysis

**3 categories, by root cause:**

### Category 1: Pipeline SKIP (3 cases — REACT-007, REACT-031, REACT-045)

W0 router decided the conversation did not need a heads-up. Worker list is empty. This is the router's call and the judge accepted it. No thinking failure.

### Category 2: Judge non-JSON (2 cases — REACT-013, REACT-029)

The LLM-as-judge occasionally returns prose-only or over-100-token responses that `parseJudgeResponse` cannot extract. Score 0 in both cases. Not a thinking failure. Mitigation: the judge prompt could include a stronger "respond with valid JSON only" directive.

### Category 3: Real thinking failures (4 cases — REACT-037, REACT-047, HO-003, REACT-049)

**All 4 had exactly 1 worker fired.** W0 router under-fired on cases that needed a coordinated multi-worker set. The single worker is strong on its own dimension but missed the others the case required:

| Case | Worker | Why it failed alone |
|---|---|---|
| REACT-037 | W3 (Gap Detector) | "remained at conceptual level and failed to instantiate concrete operational artifacts" — needed W14 (delivery contract) + W12 (auto tester) + W2 (gap) to nail the artifacts |
| REACT-047 | W1 (Intent Analyst) | "materially missed the system-learning/operational-loop dimension" — needed W10 (meta improver) + W12 to define the loop |
| HO-003 | W2 (Gap Detector) | "did not address the in-flight session risk" — needed W8 (autonomous operator) to cover the live-state dimension |
| REACT-049 | W6 (LLM Selfcheck) | "routed the task toward an abstract eval design exercise instead of the specific [WRITE_SYNTHETIC_TEST] artifact" — needed W12 to produce the concrete artifact |

**The fix is the W0 router prompt.** Currently W0 picks the minimum-coverage set ("list relevant workers"). A contract like "each WORKER list must include the W that covers each of: intent, gap, risk, self-check, delivery" would prevent the 1-worker cases.

## Reproduction

```bash
# All 52 cases
bun run bin/multimind.ts eval --output /tmp/eval-52.json

# Specific case
bun run bin/multimind.ts eval --case REACT-037

# Resume a partial run (skip the first N cases)
bun run bin/multimind.ts eval --skip 20 --output /tmp/eval-remaining.json
```
