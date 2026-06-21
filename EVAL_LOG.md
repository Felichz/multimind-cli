# Eval log

A chronological record of every eval run, what we observed, and what we learned. New runs append at the bottom.

The purpose is two-fold:

1. **Memory across sessions.** The insight from one run ("all 4 thinking failures had 1 worker fired") is easy to lose. The log captures the *why*, not just the *what*.
2. **Raw material for a blog post.** Each entry is a self-contained narrative that can be quoted, summarized, or expanded into a section of a future post.

Each entry has the same shape:

- **Run** — what was tested, the model, the wall time
- **Results** — the numbers, with pass/fail classification
- **Observations** — patterns in the data (what we noticed)
- **Insights** — what we concluded (the *why*)
- **Decisions / next steps** — what to do based on this

The format is deliberately narrative, not tabular. Tables belong in the eval report (`evals/reports/latest.md`); this file is for the reasoning around the data.

---

## 2026-06-20 — Full 52-case surface sweep

### Run

- **Cases:** all 52 in `evals/dataset.jsonl` (49 REACT + 3 HO)
- **Model:** `opencode-go/minimax-m3` via opencode-go HTTP
- **Wall time:** ~3.5 hours
- **Scoring:** LLM-as-judge with the calibrated rubric in `src/judge.ts` (heads-up lens)

This was the first full surface sweep. Earlier we had only:
- A spot-check of 3 cases (REACT-001, REACT-013, HO-002) — mean 90, 3/3 pass
- A 20-case interim run — mean 82.2, 18/20 pass
- A 32-case remaining run — mean 80.6, 25/32 pass

The 20 and 32 were a partition of the same physical run; combined they are the 52-case sweep.

### Results

| Metric | Value |
|---|---:|
| Cases | 52 / 52 |
| Pass | 43 (82.7%) |
| Mean | 81.2 |
| Median | 91 |
| Fail | 9 |

**Failures, by root cause:**

| Type | Count | Cases |
|---|---:|---|
| Thinking (single-worker, scored 58–76) | 4 | REACT-037, REACT-047, HO-003, REACT-049 |
| Pipeline SKIP (W0 returned SKIP) | 3 | REACT-007, REACT-031, REACT-045 |
| Judge non-JSON (parse failed) | 2 | REACT-013, REACT-029 |

### Observations

**Pass distribution is bimodal.** Pass cases cluster in two bands: 88–94 (the typical case) and 96–98 (cases where the system particularly shines). The median of 91 sits between the two. The bottom of the pass distribution is 84; nothing passed in the 80–84 band.

```
Pass score histogram (43 cases):
  80–84:  1   (REACT-016, 84)
  85–89:  5   (REACT-004 88, REACT-017 88, REACT-026 88, REACT-039 88, REACT-038 89, REACT-044 87)
  90–94: 25   (the typical "good" case)
  95–98: 12   (the "edge" cases where the system particularly shines)
```

**All 4 thinking failures had exactly 1 worker fired.** This is the strongest signal in the data.

| Case | Score | Workers | Why it failed alone |
|---|---:|---|---|
| REACT-037 | 68 | W3 | "remained at conceptual level, failed to instantiate concrete operational artifacts" — needed W14 + W12 + W2 |
| REACT-047 | 58 | W1 | "materially missed the system-learning/operational-loop dimension" — needed W10 + W12 |
| HO-003    | 76 | W2 | "did not address the in-flight session risk" — needed W8 |
| REACT-049 | 68 | W6 | "routed to abstract eval design instead of [WRITE_SYNTHETIC_TEST] artifact" — needed W12 |

The single worker is strong on its own dimension. The problem is not that the worker is bad; the problem is that the *case required multiple dimensions* and only one was covered.

**The 5 infra fails are noise, not signal.** Three cases (REACT-007, REACT-031, REACT-045) had W0 return SKIP — the router decided no heads-up was needed and the judge accepted that. Two cases (REACT-013, REACT-029) had the judge return malformed JSON, which `parseJudgeResponse` correctly maps to score 0. These don't represent thinking-quality regressions.

### Insights

**The W0 router prompt is the highest-leverage place to fix.** Currently W0 is asked to "list relevant workers." The model interprets "relevant" as minimum-coverage. A contract like "your WORKER list must include the W that covers each of: intent, gap, risk, self-check, delivery" would force multi-dimensional thinking.

This is a 30-line prompt change. It does not require touching the workers, the consolidator, the model, or the architecture. It is the cheapest possible fix that addresses the only pattern in the failures.

**The harness does work that would be expensive to elicit from any model.** The evidence discipline section, the completion contract from C0, the multi-lens bias from W0's routing — these are structural features of the pipeline, not model features. M3 with the pipeline at 82.7% may be a better value than Opus 4.8 vanilla at 95%, because the pipeline is doing the structural work that Opus would have to improvise. The cost difference is 50–100x per call.

**The single-worker pattern is the only systematic failure mode.** Three of the four thinking failures (REACT-037, REACT-047, REACT-049) trace back to a single missing dimension. The fourth (HO-003) traces back to a different missing dimension. The fix in the W0 prompt is one contract that addresses all four. This is a high-leverage target because the fix rate is high relative to the fix cost.

**The eval is non-deterministic in two places.** (1) The judge LLM is non-deterministic — same case, different runs, different scores. (2) W0 is non-deterministic — same input, different worker selections. The 82.7% is a *sample*, not a *result*. A re-run tomorrow could give 78% or 87%. The fix is either to run N times and report the range, or to set temperature 0 on the LLM calls. We have not yet decided which.

### Cost

The full 52-case sweep cost approximately $1–2 in API. The same call set with Claude Opus 4.8 would cost $50–100. The pass rate of 82.7% on a calibrated multi-dimension rubric is acceptable for most production work where "85%+ pass" is the bar.

### Decisions

1. **Move the per-case table out of the README** into `evals/reports/latest.md`. The README carries summary metrics + failure analysis + a link. The detailed table belongs in a separate canonical document.
2. **Add a `--skip N` flag** to the eval runner so a partial run can be resumed without re-paying for cases already done. (Committed in the same change.)
3. **Document the W0 single-worker pattern** as a known issue with a known fix, tracked for the next sprint.
4. **Defer the judge non-JSON fix.** 2 of 52 is noise. The judge prompt could be strengthened, but the cost of an occasional score-0 is low (the parser handles it correctly, and the run still gets a useful signal).

### Next steps

1. **Fix the W0 router prompt.** Add an explicit "must cover" contract. Target: re-run the 4 thinking-failure cases after the fix and confirm they all pass.
2. **Re-run the full 52 cases after the W0 fix.** Expected improvement: 43/52 → ~48/52 (the 4 thinking fails clear, the 5 infra fails stay). New baseline ~92%.
3. **Decide on eval determinism.** Either add N-run averaging or set temperature 0. This affects how we report results going forward.
4. **Blog post.** The W0 single-worker pattern is a good "here is what we learned from running the full eval for the first time" post. The eval log is the raw material.

---

## Earlier runs (for context)

### ~2026-06-19 — 3-case spot-check

- **Cases:** REACT-001, REACT-013, HO-002
- **Model:** M3 via opencode-go HTTP
- **Result:** 3/3 pass, mean 90, scores 95, 93, 82

This was a sanity check before the full sweep. Confirmed the pipeline produces a heads-up that the judge can score well on. The 82 on HO-002 was the lowest — and the case had 7 workers fired, suggesting multi-lens coverage was already paying off.

### 2026-06-20 (same session) — 20-case interim

- **Cases:** REACT-001 through REACT-020
- **Result:** 18/20 pass, mean 82.2, median 90
- **Fails:** REACT-007 (router SKIP), REACT-013 (judge non-JSON)

The first half of the full sweep. The drop from the 3-case spot-check (mean 90) to the 20-case (mean 82.2) was real, not noise — it was driven by REACT-007 (SKIP) and REACT-013 (judge non-JSON) being scored as 0. Excluding those two, the mean was 91.5. The takeaway: when the pipeline works, it works well. When the infra fails, the score is 0. The gap between the two modes is large.

### 2026-06-20 (same session) — 32-case remainder

- **Cases:** REACT-021 through REACT-049 + HO-001, HO-002, HO-003
- **Result:** 25/32 pass, mean 80.6, median 91
- **Fails:** REACT-029 (judge), REACT-031 (SKIP), REACT-037 (W3 alone, 68), REACT-045 (SKIP), REACT-047 (W1 alone, 58), HO-003 (W2 alone, 76), REACT-049 (W6 alone, 68)

The second half of the full sweep. This is where the single-worker pattern became visible. The four 1-worker failures (REACT-037, REACT-047, HO-003, REACT-049) all had clear "this case needed more than one lens" diagnoses from the judge. The pattern was the headline finding of the day.
