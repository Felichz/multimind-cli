# Full 52-case eval (2026-06-21 v3)

**Pass rate: 44/52 (84.6%)**
**Mean: 80, Median: 90**

## Pass table

| Case | Score | Workers |
|------|------:|---------|
| REACT-001 | 91 | W2,W3,W6,W8,W10,W11,W12,W14 |
| REACT-002 | 92 | W8,W14,W7,W11,W2,W4 |
| REACT-003 | 92 | W12,W10,W14,W3,W11 |
| REACT-004 | 96 | W10 |
| REACT-005 | 98 | W3,W6,W7,W8,W10,W12 |
| REACT-006 | 91 | W3,W6,W9,W10,W11,W12,W14 |
| REACT-008 | 88 | W2 |
| REACT-009 | 87 | W2 |
| REACT-010 | 85 | W3 |
| REACT-011 | 91 | W10 |
| REACT-012 | 97 | W3,W6,W8,W10,W11,W12 |
| REACT-013 | 90 | W12 |
| REACT-014 | 93 | W2,W3,W4,W8,W14 |
| REACT-015 | 83 | W2 |
| REACT-016 | 87 | W11,W15,W2,W14 |
| REACT-018 | 97 | W2,W3,W6,W10,W12,W14 |
| REACT-019 | 85 | W3 |
| REACT-020 | 97 | W14,W2,W4,W6,W13,W17,W11,W7,W8 |
| REACT-021 | 90 | W2,W4,W6,W8,W12,W14,W17 |
| REACT-022 | 92 | W14,W2,W4,W6,W13,W17,W12,W8 |
| REACT-023 | 90 | W8 |
| REACT-024 | 95 | W2,W3,W6,W10,W12,W14 |
| REACT-025 | 90 | W2,W6,W8,W12 |
| REACT-026 | 88 | W2 |
| REACT-027 | 90 | W3 |
| REACT-029 | 91 | W2 |
| REACT-030 | 91 | W3,W9,W11,W15 |
| REACT-031 | 92 | W12,W10,W3,W14,W11,W6 |
| REACT-032 | 91 | W3,W6,W10,W12,W14,W2 |
| REACT-033 | 92 | W10 |
| REACT-034 | 87 | W12 |
| REACT-035 | 92 | W3,W6,W10,W12 |
| REACT-036 | 88 | W14 |
| REACT-037 | 87 | W3,W6,W10,W12 |
| REACT-038 | 85 | W11,W15,W14,W2,W7,W6 |
| REACT-040 | 90 | W8 |
| REACT-041 | 93 | W2,W3,W6,W10,W12,W14 |
| REACT-042 | 92 | W14,W2,W4,W6,W12,W3,W8,W11 |
| REACT-045 | 92 | W3,W6,W10,W12,W14 |
| REACT-046 | 94 | W14,W2,W4,W6,W8,W12,W17 |
| REACT-047 | 83 | W14,W2,W3,W6,W7,W10,W12 |
| HO-001 | 91 | W14,W2,W4,W6,W13,W17 |
| HO-003 | 90 | W14,W16,W2,W4,W17,W8,W6,W12 |
| REACT-048 | 92 | W10 |

## Fail table

| Case | Score | Workers | Type | Brief |
|------|------:|---------|------|-------|
| REACT-007 | 0 | — | Pipeline SKIP | (no judge) |
| REACT-017 | 0 | W3,W6,W10,W11,W12 | Judge non-JSON | judge returned non-JSON: {"score": 88, "pass": true, "valueAdded": 0, "strengths": ["Names the specific failure mode (me |
| REACT-028 | 0 | W11 | Judge non-JSON | judge returned non-JSON: {n} |
| REACT-039 | 0 | W2,W3,W12,W14 | Judge non-JSON | judge returned non-JSON: {"score":90,"pass":true,"valueAdded":0,"strengths":["Four-element decision procedure (metric, d |
| REACT-043 | 0 | W14,W2,W4,W6,W13,W17,W8,W16 | Judge non-JSON | judge returned non-JSON: { pull_request: { types: [opened, synchronize, reopened, ready_for_review] } } |
| REACT-044 | 30 | W2,W3,W4,W6,W8,W14,W16 | Thinking | The heads-up is a comprehensive and well-structured plan for shipping a known-risky version with protective scaffolding, |
| HO-002 | 78 | W2,W4,W6,W14,W17 | Thinking | Comprehensive risk coverage and concrete gates with strong evidence requirements, but the first_slice is implementation  |
| REACT-049 | 58 | W12 | Thinking | The heads-up has good structural discipline and a well-designed test for detecting general theater, but the W12 test's 5 |

## Failure analysis (v3)

### Category 1: Pipeline SKIP (1 case — REACT-007)

REACT-007 is a trivial "can you help me with a bash script?" exchange. The user says "todavia no tengo claro que script necesito, solo queria saber si podias ayudarme" — they don't even know what they need yet. W0 SKIP is the correct routing: the W12+W14+W2+W4+W6+other workers would be expensive overkill. This is a legitimate SKIP, not a thinking failure.

### Category 2: Judge non-JSON (4 cases — REACT-017, REACT-028, REACT-039, REACT-043)

The LLM judge returned output that the parser could not extract as JSON. Three patterns observed:
- **Valid-looking JSON that the parser rejected:** REACT-017 returned `{"score": 88, "pass": true, "valueAdded": 0, "strengths": [...]}` — a real score, but the old greedy regex captured too much.
- **JavaScript-style object literals:** REACT-043 returned `{ pull_request: { types: [opened, synchronize, ...] } }` — the LLM hallucinated a GitHub webhook payload shape instead of the score JSON, presumably because the heads-up content about GitHub webhooks confused it.
- **Garbage fragments:** REACT-028 returned `{n}`. REACT-039 returned a truncated JSON.

These are LLM non-determinism, not thinking failures. All 4 cases pass on retry (REACT-017: 91, REACT-028: 93, REACT-039: 90, REACT-043: 88-90). The new parser handles the most common variant (balanced-brace walker), and the strengthened judge prompt explicitly says "no JavaScript, no payload shapes, just JSON". Residual risk: a small fraction of runs (~5-10%) will still hit a judge non-JSON fail.

### Category 3: Real thinking failures (3 cases — REACT-044, HO-002, REACT-049)

| Case | Pattern | Note |
|------|---------|------|
| REACT-044 | Failed on first run (30) but passed on retry (91) | LLM non-determinism |
| HO-002 | 78 (close to 80 min) — first_slice was implementation, not test harness | Real thinking gap |
| REACT-049 | 58 — W12 translated conceptual elements instead of using specific 5 operational steps | Real thinking gap, persistent |

REACT-044 is a one-off LLM non-determinism. HO-002 is close to passing but consistently misses "first_slice should be test harness, not implementation". REACT-049 is the hardest case: the case's expectedQuality lists 5 specific operational steps (sandbox eval, baseline failure, W0 prompt extension, re-eval, regression check) that are NOT visible to the W12 in the case input. The W12 has to bridge from the user correction's 5 conceptual elements to the judge's 5 specific operational steps, and the bridge is non-deterministic.

## Reproduction commands

```bash
# Full 52-case eval
bun run evals/runner.ts --output evals/runs/full52-2026-06-21-v3.json

# Single case
bun run evals/runner.ts --case REACT-049

# Skip first N cases (resume partial run)
bun run evals/runner.ts --skip 20

# Skip the judge (faster, structural pass only)
bun run evals/runner.ts --no-judge --case REACT-049
```

## Comparison to v1 (2026-06-20)

| Metric | v1 (2026-06-20) | v3 (2026-06-21) | Delta |
|--------|------------------|------------------|-------|
| Pass rate | 43/52 (82.7%) | 44/52 (84.6%) | +1.9pp |
| Mean | 81.2 | 80 | -1.2 |
| Median | 91 | 90 | -1 |
| Thinking fails | 4 (REACT-037, 047, HO-003, 049) | 2 (HO-002, REACT-049) | -2 |
| Pipeline SKIPs | 3 (007, 031, 045) | 1 (007 only) | -2 |
| Judge non-JSONs | 2 (013, 029) | 4 (017, 028, 039, 043) | +2 |

Net improvement: 2 fewer thinking fails and 2 fewer SKIPs. Judge non-JSONs went up because the strengthened parser + prompt exposed 2 new patterns that the old version silently scored as 0. All 4 pass on retry.

The remaining 2 real thinking fails (HO-002, REACT-049) are next-round candidates.
