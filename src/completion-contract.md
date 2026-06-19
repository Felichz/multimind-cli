[Subconscious Completion Contract]

SITUATION_TYPE: delivery-confidence

PRIORITY_ORDER:
1. Run regression test to close the remaining verification gap — the auto-discovery claim is structurally verified (loader code read, glob pattern confirmed, naming convention matched, router conditions present) but zero runtime confirmation has been executed
2. Report test result transparently — if green, delivery is sound; if red, block readiness until fixed

PRESERVED_WORKER_OBLIGATIONS:
- W6: The original "auto-discovered... no code changes needed" claim was made without verification — acknowledged. Since then, W12 confirmed the claim is correct via code reading. The false-completeness concern is resolved for this deliverable, but the pattern is a risk for future turns.
- W7: "No empirical proof of integration" — partially addressed by W12's inspection; the remaining gate is running `bun run test --test="subconscious"` from packages/opencode.
- W8: Verify loader code reveals naming convention, then run discovery check — DONE (loader read at subconscious-server.ts:255-272, convention is `W\d+_.*\.md`, files match, extensions fill gaps). The failure_split analysis (plugin_load, idle_event, callback_entry, worker_execution) is preserved for next time but not needed now.
- W12: Auto-discovery confirmed via six structural evidence classes (file exists, naming pattern, regex match, directory placement, router section format, router section location) — all GREEN. Only runtime regression remains UNVERIFIED.

MAIN_AGENT_VISIBLE_FLOOR:
- Run one command and report result: `cd packages/opencode && bun run test --test="subconscious"`
- Do not say "done" or "ready" until test exit code is 0
- If test fails, report the exact failure, not just "there was an issue"

STRUCTURE_TO_PRESERVE:
- Evidence record: file_exists=GREEN, naming_pattern=GREEN, regex_match=GREEN, directory_placement=GREEN, router_section_format=GREEN, router_section_location=GREEN, runtime_regression=UNVERIFIED
- Decision table: tests pass close all gaps; tests fail block readiness

COMPLETION_CONTRACT:
  first_slice: cd packages/opencode && bun run test --test="subconscious"
  must_address:
    - Run the test suite and report the exact output
    - If pass, close the delivery as complete with evidence
    - If fail, do not say "done" — block and report the failure
  acceptance_criteria:
    - All subconscious tests pass (exit 0)
    - bun run typecheck from packages/opencode passes (exit 0)
  minimum_negative_check:
    - Verify adding W15/W16/W17 to extensions dir does not shadow or conflict with existing core workers (W12 confirmed: core has W1-W14 only, no conflict — VERIFIED)
    - Verify the extension dir duplicate W12 files (W12_AUTO_TESTER.md + W12_BEHAVIORAL_ENFORCER.md) do not cause issues — pre-existing, not blocking this delivery
  evidence_to_claim_done:
    - Test output showing all subconscious tests pass with W15/W16/W17 present
    - Typecheck output showing no new errors
    - (All structural evidence already collected: loader code, naming convention, router conditions)
  residual_assumptions:
    - No test in the subconscious suite exercises the new workers' actual routing at runtime — the test confirms no regression from adding files, not that W15/W16/W17 produce correct analysis in a real session
    - Router conditions for W15/W16/W17 reference section tags that must appear in the main agent's output; this was not verified against actual session runs
  user_handoff:
    - NONE — this is self-verifiable by the agent. Only escalate if test infrastructure (bun, node modules) is missing.

DROP_OR_DEEMPHASIZE:
- W6's claim that this was "fabricated fact" — overridden by W12's evidence-based verification. The original claim was made without evidence, but the content of the claim is correct. The pattern warning is preserved; the accusation is not.
- W7's broad "zero evidence of quality" — the load-side verification was a 2-minute read the agent could have done before claiming done. But W12 did verify it this turn. The craftsman quality bar is directionally correct; apply it next time before claiming completion, not after.
- The full failure_split taxonomy from W8 — the system works; the failure analysis is unnecessary for this turn. Preserve as reference for future.

COMMUNICATION_FRAME: Calibrated and evidence-gated. Run the test, report pass/fail, close the loop. No re-justification of past work needed.

FINAL_MARKER:
[subconscious:continue]
