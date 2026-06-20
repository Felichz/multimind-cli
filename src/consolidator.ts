export type ConsolidatorInsight = {
  key: string
  name: string
  output: string
}

export type DistilledWorkerKernel = {
  key: string
  title: string
  body: string
}

export function consolidateForMainAgent(insights: ConsolidatorInsight[]) {
  const coverage = insights.map(responseCoverage)
  const artifact = firstVisibleArtifactSection(insights)
  const deliverable = requiredVisibleDeliverable(insights)
  const contracts = situationalResponseContracts(insights)

  return [
    "[Heads-Up]",
    "",
    "Background cognitive workers reviewed the latest exchange. Do not treat this as a checklist or a script. Treat it as a consciousness frame for the next answer.",
    "",
    "The important thing is not to mention these ideas. The important thing is to let them update what you consider a good professional answer in this situation.",
    "",
    "What matters:",
    ...insights.map((item, index) => `${index + 1}. ${item.name}: ${firstLine(item.output)}`),
    "",
    ...evidenceDisciplineSection(),
    "",
    ...contracts,
    ...coverageSelfCheck(contracts),
    ...artifact,
    "Required visible deliverable:",
    ...deliverable,
    "",
    "Required response coverage:",
    "Address each item below in substance in the user-visible response. Do not paste this checklist unless that is naturally the best UX. If an item is not relevant after thinking it through, resolve it explicitly through a narrower claim instead of silently dropping it.",
    ...coverage.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Frame shift:",
    "- Before answering, notice what kind of professional moment this is: implementation, delivery confidence, critical-domain risk, user handoff, or empirical verification.",
    "- Ask what claim your answer would create, what responsibility that claim implies, and what evidence would make confidence honest.",
    "- Time pressure compresses scope; it does not delete responsibility or critical gates.",
    "- If the work changes authority, durable state, external commitments, reversibility, user trust, or operational continuity, do not think of it as ordinary CRUD.",
    "- Reduce user cognitive load: choose a concrete default path with explicit assumptions instead of pushing broad coordination back to the user.",
    "- Missing context changes the shape of the answer; it should not make the answer vague. State reasonable assumptions, choose the smallest responsible next step, and name the evidence that would confirm or falsify it.",
    "",
    "What this changes about your answer:",
    "- Answer naturally in your own style, but from the corrected frame.",
    "- Do not merely acknowledge the worker notes. Let them change the posture, specificity, and confidence of the response.",
    "- Turn the corrected frame into concrete professional movement: default path, acceptance criteria, failure modes, minimum tests, and completion evidence when the situation calls for them.",
    "- Ask for broad files or context only when a real decision is blocked. Otherwise, proceed with explicit assumptions and give the user the lowest-friction path forward.",
    "- Do not end with permission-seeking language like 'if you want'. End with the default next action, evidence gate, or the one truly blocking decision.",
    "- Preserve evidence fidelity: separate what is known, what is inferred, what remains unverified, and what would prove the next claim.",
    "- When QA or delivery confidence is involved, keep the eval-driven workflow alive: define expectations as cases, run the cheapest useful checks first, then reserve broader gates for milestone confidence with model/prompt/dataset metadata.",
    "- When the user must test the deliverable, give low-friction debug instrumentation or a precise evidence handoff instead of asking them to reverse-engineer logs.",
    "",
    "Worker evidence:",
    ...insights.map((item) => `\n=== ${item.key}: ${item.name} ===\n${item.output.trim()}`),
  ].join("\n")
}

export function consolidateWithDistilledWorkerKernels(input: {
  insights: ConsolidatorInsight[]
  kernels: DistilledWorkerKernel[]
}) {
  const coverage = input.insights.map(responseCoverage)
  const artifact = firstVisibleArtifactSection(input.insights)
  const deliverable = requiredVisibleDeliverable(input.insights)
  const contracts = situationalResponseContracts(input.insights)
  const kernels = input.insights.flatMap((insight) =>
    input.kernels
      .filter((kernel) => kernel.key === insight.key)
      .map((kernel) => `\n=== ${kernel.key}: ${kernel.title} ===\n${kernel.body.trim()}`),
  )

  return [
    "[Heads-Up]",
    "",
    "Background cognitive workers reviewed the latest exchange. W0 already selected the relevant perspectives; the notes below include only distilled kernels for those selected workers.",
    "",
    "Use this as operating discipline, not as text to paste. The point is to make the next answer more professionally grounded than the first draft.",
    "",
    "Non-negotiable answer floor:",
    ...evidenceDisciplineBullets(),
    "- Choose a concrete first slice, decision path, or verification path.",
    "- If implementation was already approved but tools are unavailable in this response, still name the first artifact or target slot. Use a repo path when known, or `UNVERIFIED <implementation/test slot>` when it has not been inspected yet.",
    "- Separate the first thin slice from later follow-up layers when scope could sprawl.",
    "- For software feature delivery, name the first artifact layout: durable state/schema or config, policy/enforcement boundary, user/API entrypoint, and test slot. If the repo is uninspected, mark the layout as UNVERIFIED instead of omitting it.",
    "- Define acceptance criteria or success conditions when the response implies delivery quality.",
    "- Include the cheapest negative/failure/security check that would expose false confidence.",
    "- If the slice uses an authority-bearing artifact or trust-bearing transition, name its lifecycle in the visible answer: creation or generation, storage/source of truth, actor/resource binding, expiry or bounded validity, consumption/revocation, and the negative misuse check.",
    "- For token-like, credential-like, invitation-like, or access-granting artifacts, do not collapse storage and expiry into vague `bounded` language. Name where the artifact is stored or validated, when it expires, how it is consumed or revoked, and what rejection proves misuse fails.",
    "- Split the test strategy explicitly when delivery confidence is at stake: the fastest deterministic policy/unit check with setup/action/assertions, and the primary integration/e2e path with expected pass and expected fail signals.",
    "- Under demo or schedule pressure, include a compact manual demo checklist: setup, action, visible confirmation, negative/security check, expected rejection signal, stop/rollback condition, and residual risk. Do not replace this checklist with a generic next step.",
    "- Name the evidence required before any done, ready, safe, fixed, or ship claim.",
    "- When delivery and QA are both active, include a compact proof record and decision rule: current/baseline result, after-change result, regression result, artifact/log reference, residual risk, and accept/revise/rollback condition.",
    "- Include a stop, revise, or rollback condition when the plan can fail.",
    "- Preserve explicit assumptions and only ask for decisions that truly change implementation.",
    "- Reduce user cognitive load with a default path, debug handoff, status block, or exact evidence request.",
    "- Do not end with a broad offer. If action is possible, name the default next action. If action is blocked, name the single decision that changes implementation.",
    "- Forbidden close after approval: tone variants, rewrite offers, `if you want`, `si querés`, `si quieres`, or broad permission language. Replace them with the evidence bundle, decision rule, or next gate that would make the professional claim true.",
    "- When delivery, QA, and risk frames all fire, lead with the local artifact/proof loop. External provider checks are supporting gates unless provider semantics are the first blocking unknown.",
    "- Operationalize the worker guidance before explaining it: first artifact or slice, acceptance criteria, failure modes, same-case check, quick regression, run record, and accept/revise/rollback rule.",
    "",
    ...artifact,
    "Required visible deliverable:",
    ...deliverable,
    "",
    ...contracts,
    ...coverageSelfCheck(contracts),
    "",
    "Selected distilled worker kernels:",
    ...(kernels.length ? kernels : ["NONE"]),
    "",
    "Required response coverage from worker outputs:",
    "Address each item below in substance. If a kernel and worker output conflict, prefer the concrete obligation that best protects the user's outcome.",
    ...coverage.map((item, index) => `${index + 1}. ${item}`),
    "",
    "Worker evidence:",
    ...input.insights.map((item) => `\n=== ${item.key}: ${item.name} ===\n${item.output.trim()}`),
  ].join("\n")
}

export function consolidateSynthesizerForMainAgent(input: {
  synthesis: string
  insights: ConsolidatorInsight[]
}) {
  if (!input.synthesis.trim()) return consolidateForMainAgent(input.insights)

  const deliverable = requiredVisibleDeliverable(input.insights)
  const artifact = firstVisibleArtifactSection(input.insights)
  const contracts = situationalResponseContracts(input.insights)
  const c0Decision = parseMultimindDecision(input.synthesis)

  return [
    "[Heads-Up]",
    "",
    "C0 synthesized a completion contract. Treat it as the prioritized consciousness frame for the next answer, but do not let synthesis erase concrete worker evidence.",
    "",
    "The important thing is not to mention these ideas. The important thing is to let them update what you consider a good professional answer in this situation.",
    "",
    "Non-negotiable answer floor:",
    ...evidenceDisciplineBullets(),
    "- Include a concrete first slice or decision path, not just intent.",
    "- Include acceptance criteria that define what success means.",
    "- Include at least one negative/failure/security check when the situation has real risk.",
    "- Include the evidence needed before any done, ready, safe, or ship claim would be honest.",
    "- Include residual assumptions or truly blocking decisions only when they change the next move.",
    "- Include a low-friction handoff, debug path, or validation path when the user will need to verify the deliverable.",
    "- If tools are not available in the current turn, express these as the exact plan and evidence gates you will execute, not as completed facts and not as a vague offer.",
    "- Do not end with permission-seeking language. Convert any 'if you want' into a default next step, assumption, or evidence gate.",
    "",
    ...contracts,
    ...coverageSelfCheck(contracts),
    ...artifact,
    "Required visible deliverable:",
    ...deliverable,
    "",
    "C0 completion contract:",
    input.synthesis.trim(),
    "",
    "C0 session decision:",
    c0Decision === "safe_to_end"
      ? "- C0 marked this session safe to end. The main agent may close only within the scoped evidence C0 accepted."
      : c0Decision === "blocked"
        ? "- C0 marked the session blocked. The main agent should report the exact blocker instead of continuing blindly."
        : c0Decision === "continue"
          ? "- C0 marked that more work is needed. The main agent must continue with the next concrete step."
          : "- C0 did not emit a safe-to-end marker. Treat the session as needing more work.",
    "",
    "Required response coverage from workers:",
    "The C0 contract is the priority order, not permission to drop evidence. Address each item below in substance unless the C0 contract explicitly de-emphasizes it with a concrete reason.",
    ...input.insights.map((item, index) => `${index + 1}. ${responseCoverage(item)}`),
    "",
    "Evidence preservation rule:",
    "- Preserve concrete obligations, floors, negative checks, and completion evidence from the workers.",
    "- If C0 turned a concrete worker signal into a generic abstraction, repair it using the worker evidence below before answering.",
    "- If a worker names a specific object, state, transition, risk, or gate, keep that specificity in the professional substance of the answer.",
    "",
    "Worker evidence to preserve:",
    ...input.insights.map((item) => `\n=== ${item.key}: ${item.name} ===\n${item.output.trim()}`),
  ].join("\n")
}

function parseMultimindDecision(text: string) {
  const finalLine = text.trimEnd().split("\n").at(-1)?.trim().toLowerCase()
  if (finalLine === "[multimind:safe_to_end]" || finalLine === "multimind:safe_to_end") return "safe_to_end"
  if (finalLine === "[multimind:continue]" || finalLine === "multimind:continue") return "continue"
  if (finalLine === "[multimind:blocked]" || finalLine === "multimind:blocked") return "blocked"
  return "missing"
}

export function buildSynthesizerPrompt(input: {
  instruction: string
  insights: ConsolidatorInsight[]
  recentConversation: string
}) {
  return `${input.instruction}

Recent conversation history:
${input.recentConversation}

Worker outputs to synthesize:
${input.insights.map((item) => `\n=== ${item.key}: ${item.name} ===\n${item.output.trim()}`).join("\n")}

Produce the private completion contract for the main agent.`
}

export function parseDistilledWorkerKernels(text: string) {
  return text.split(/\n(?=##\s+W\d+\s+-\s+)/).flatMap((section) => {
    const match = section.match(/^##\s+(W\d+)\s+-\s+([^\n]+)\n([\s\S]*)/m)
    if (!match) return []
    return [{ key: match[1], title: match[2].trim(), body: match[3].trim() }]
  })
}

function firstLine(output: string) {
  return output.trim().replace(/\s+/g, " ").slice(0, 220)
}

function compactLine(output: string, max = 220) {
  return output.trim().replace(/\s+/g, " ").slice(0, max)
}

function evidenceDisciplineSection() {
  return ["Evidence discipline:", ...evidenceDisciplineBullets()]
}

function evidenceDisciplineBullets() {
  return [
    "- Treat worker statements about files, tests, commands, repo state, tool output, or runtime behavior as factual only when they include explicit evidence from this run.",
    "- If a worker claims something exists, does not exist, passed, failed, or was already verified without evidence, convert that into a verification target before acting on it.",
    "- Preserve the split in the user-visible work: verified observation, inference, unverified hypothesis, and next check.",
  ]
}

function firstVisibleArtifactSection(insights: ConsolidatorInsight[]) {
  const deliverySignal = hasDeliverySignal(insights)
  const evalSignal = hasEvalSignal(insights)
  const persistentTechnicalFailureSignal = hasPersistentTechnicalFailureSignal(insights)
  const metricReadinessSignal = hasMetricReadinessSignal(insights)
  const sections = [
    ...(hasTrustArtifactSignal(insights)
      ? [
          "Critical trust-bearing state to name explicitly:",
          "- If the answer touches any artifact, record, relationship, or transition that grants authority, changes durable access, moves value, crosses a boundary, or authorizes future action, name the lifecycle floor in the user-visible answer.",
          "- State the lifecycle floor as first-slice requirements, not only as later verification: creation/source of authority, storage or persistence, scope/binding, bounded validity, consumption/reuse/revocation, leakage/replay exposure, and the one negative check that proves the happy path is not lying.",
          "- When the artifact grants access or authority, creation/source includes unpredictability or entropy; bounded validity includes expiry, TTL, or an equivalent limit derived from the system's own design.",
          "- Do not move this lifecycle floor into follow-up layers when it is what makes the happy path honest. Follow-up layers may add breadth, but the first slice must still preserve the minimum trust contract.",
          "- This is not broad hardening or polish. It is the minimum that makes a compressed critical-domain claim honest.",
          "",
        ]
      : []),
    ...(hasDebugSignal(insights)
      ? [
          "First debug artifact to include:",
          "- Start with a named debug artifact in plain language: `First debug artifact: <screenshot/status/comment/debug surface> — <one-line purpose>`.",
          "- Use `UNVERIFIED` repo paths only for agent-facing traces or status files. For a user handoff, prefer visible names like `plugin status screenshot`, `PR comment thread`, or `copied status block`.",
          "- For review/comment-agent failures, make the first evidence menu this small and explicit, in this order: `PR link to the comment` if available; `exact copied comment plus file/line and 5-10 surrounding diff lines`; or `screenshot of the comment thread with nearby diff`. Do not lead with raw logs or screenshots alone when a PR link or copied comment is simpler.",
          "- If the user is non-technical or overloaded, lead with a visible screenshot/status/comment artifact in plain language, and move repo paths or raw traces to fallback evidence for the agent.",
          "- If this is the multimind plugin itself, prefer existing surfaces before inventing a new one: TUI status label, `/subconscious-debug`, `.opencode/subconscious/debug/latest-run.json`, and the debug dashboard.",
          "- For OpenCode/plugin debug, do not say only `live log`, `trace`, or `OpenCode logs`. Name at least two exact surfaces from the known set, plus the screenshot/snippet fields to capture from each.",
          "- Treat those multimind plugin surfaces as known standard surfaces. If you have not inspected the current run, mark the current contents as unverified or possibly stale; do not mark the standard path itself as UNVERIFIED.",
          "- For the multimind plugin itself, use concrete marker fields when available: `plugin_loaded`, `idle_detected`, `hook_dispatched`, `callback_entered`, `worker_action_completed`, and `error`.",
          "- Choose exactly one highest-signal live surface to watch first, then name fallback or alternative surfaces after it. Do not bury the primary observation in a broad list.",
          "- Include exact surfaces: UI pane, status file, trace path, log prefix, screenshot target, ordered markers or states, and exact snippet/screenshot fields to capture.",
          "- Accept equivalent evidence when the preferred artifact is absent: screenshot, status label, JSON excerpt, command output, or one log line is enough if it proves the same boundary.",
          "- Include an evidence-to-next-action map: if the captured marker is present or missing, state what the next agent will inspect or change next.",
          "- Include a debug run-record template: timestamp, session id, plugin loaded, idle marker, callback marker, worker/action marker, error, screenshot/log reference.",
          "- Include a compact three-way failure split before details: load/config failure, trigger/subscription failure, and downstream effect/worker failure. Then map concrete markers onto those buckets.",
          "- Include a debug decision table: plugin/load marker missing -> inspect load/config; idle marker missing -> inspect event/lifecycle; callback marker missing -> inspect subscription/guards; worker/action marker missing -> inspect downstream worker or action; marker appears but no effect -> inspect handler/action result.",
          "- Include the next-step evidence gate, stop/escalation condition, and the second-pass path if the highest-signal observation is ambiguous.",
          "",
        ]
      : []),
    ...(persistentTechnicalFailureSignal
      ? [
          "First diagnostic artifact to include:",
          "- Start with a live observable artifact, not an eval dataset: `First diagnostic artifact: browser Network row for the first protected request after reload/retry — proves whether the failure is storage, request wiring, backend acceptance, credentials/CORS, or UI rehydration`.",
          "- Include the minimal request/response fields in the visible answer: request URL, auth header or cookie/credentials mode, response status, response body class, backend auth log line if available, UI state after response, and the next branch.",
          "- Keep eval/test artifacts secondary for regression protection after the live boundary is isolated. The first user-facing debugging move should be a concrete observation the user or agent can capture now.",
          "",
        ]
      : []),
    ...(metricReadinessSignal
      ? [
          "Metric-to-readiness evidence to include:",
          "- Start with the direct verdict: the metric is a promising signal, not a production/readiness proof by itself.",
          "- Separate two visible gates: `Metric validity gate` and `Release readiness gate`.",
          "- `Metric validity gate` must name dataset/case coverage, run metadata, model/judge/prompt or pipeline version, leakage risk, reproducibility, and false-positive/false-negative or failure analysis.",
          "- `Release readiness gate` must name integration or representative workflow evidence, monitoring/observability, rollback or override path, residual-risk review, and staged rollout or production safety boundary.",
          "- Include an accept/revise/block matrix: accept readiness only if both gates pass; revise if the metric is valid but release evidence is incomplete; block if provenance, negative controls, integration, rollback, or monitoring are missing.",
          "- Include a compact `Evidence bundle required next` with fields: `dataset_id/hash`, `case_count/coverage`, `run_id/timestamp`, `model/judge`, `prompt_or_pipeline_version`, `negative_or_boundary_cases`, `false_positive_review`, `false_negative_review`, `integration_check`, `monitoring_signal`, `rollback_or_override_path`, and `residual_risk`.",
          "- Do not end with tone-variant offers. End with the evidence gate or decision rule that makes the readiness claim honest.",
          "",
        ]
      : []),
    ...(deliverySignal && !metricReadinessSignal
      ? [
          "Delivery execution artifact to include:",
          "- Start with a named slice: `First slice: <repo-relative module/test slot or UNVERIFIED implementation target> — <one-line outcome>`.",
          "- When the user asks for a confident done/ready verdict, the verdict comes before any artifact label. After the verdict, name the runtime evidence classes that would prove it: e2e output, API request/response snapshot, browser network trace, old-path negative trace, adjacent control result, or manual workflow evidence.",
          "- Include target shape: likely domain/module boundary, smallest vertical behavior, acceptance criteria, and the exact integration or e2e path that proves the behavior from the user or API entrypoint to the persisted state.",
          "- For product or feature delivery planning, include a concrete first artifact to inspect or create, the fastest deterministic test, and one integration/e2e path with setup, action, expected pass signal, expected fail signal, and the hidden failure it catches.",
          "- Separate the first thin slice from follow-up layers. Do not let the first slice quietly become the whole project.",
          "- If the delivery involves authority, access, paid state, entitlement, membership, quotas, external providers, or durable workflow state, separate the state boundaries explicitly: external/source-of-truth state, local persisted state, derived/cache/counter state, reconciliation or drift gate, and the negative check for each boundary that can lie while the demo works.",
          "- When schedule pressure or a demo is present, include a compact manual demo checklist labeled `Manual demo checklist:` with these rows: setup state, user action, visible confirmation, negative/security check, expected rejection signal, stop/rollback condition, and residual risk. Do not replace it with a loose evidence list.",
          "- Include deterministic evidence slots: baseline/current result, after-change result, quick regression result, failed step, logs or trace reference, latency/request count if available, and residual risk.",
          "- Include the run protocol: inspect real surfaces, run or define the baseline check, make the smallest scoped change, rerun the same check, then run the cheapest adjacent regression before any ready/done claim.",
          "- Include an accept/reject decision table for the slice: baseline already passes -> verify case alignment; after-change passes and regression passes -> accept; after-change fails -> revise; regression fails -> reject, narrow, or roll back the change.",
          "- Close with the next operational step as the default action or evidence gate, not a permission-seeking offer.",
          "",
        ]
      : []),
    ...(evalSignal && !deliverySignal && !persistentTechnicalFailureSignal
      ? [
          "First visible artifact to include:",
          "- Start with a named artifact block: `First artifact: <repo-relative slot or UNVERIFIED slot> — <one-line purpose>`.",
          "- Slot selection must be project-relative. Prefer project-supplied eval, test, or run-record slots before placeholders; do not treat multimind plugin development paths as universal defaults for unrelated projects.",
          "- When working in this multimind plugin development repo, prefer known slots before placeholders: `packages/opencode/scripts/benchmark-reaction-dataset.jsonl` for final response or architecture behavior, `packages/opencode/scripts/benchmark-thought-dataset.jsonl` for worker cognition, `packages/opencode/scripts/benchmark-autoqa-dataset.jsonl` for auto-QA behavior, `.opencode/subconscious/self-improvement/candidates/<id>/synthetic-test.json` for generated fail-first candidate cases, `.opencode/subconscious/evals/reaction-runs/latest.json` for reaction run records, and `.opencode/subconscious/evals/runs/latest.json` for worker eval run records.",
          "- Do not invent generic primary slots like `evals/regressions/*.yaml` when a known repo registry fits the claim. Use the known registry first and mark only the case entry/current contents as unverified.",
          "- Choose the slot by claim type: reaction/final-response slot for visible assistant response or plugin architecture behavior, auto-QA/app/integration/e2e slot for delivery or user workflow behavior, and worker-cognition slot only when the claim is specifically about worker cognition.",
          "- Treat project-supplied dataset and run-record paths as known repo slots. If tools are unavailable, do not call the known slot itself UNVERIFIED; say the case entry, current contents, baseline result, or run record is unverified until inspected.",
          "- Forbidden pattern for a known registry path: `First artifact: UNVERIFIED packages/opencode/scripts/...`. Correct pattern: `First artifact: packages/opencode/scripts/... — known slot; case entry/current contents unverified until inspected`.",
          "- If no concrete candidate id exists, do not make `.opencode/subconscious/self-improvement/candidates/<id>/synthetic-test.json` the primary artifact. Use a concrete dataset file plus a proposed case id as the primary artifact, then mention the candidate slot only as an optional generated-copy location.",
          "- Include the artifact body: literal input/context, expected output obligations, sample expected output shape when useful, pass gate or judge rubric, numeric accept threshold when scoring is involved, expected baseline failure, and metadata or run-record template fields.",
          "- Include a numeric threshold in the visible eval artifact: use the case's `minScore` when known; otherwise use `80/100` as pass, `90/100` as a strong development target, and `96-100` as exceptional value-added territory.",
          "- Use the case's own minScore when known; otherwise treat `80/100` as pass, `90/100` as a strong development target, and `96-100` as exceptional value-added territory.",
          "- For this repo, prefer concrete invocation patterns before generic ones: `cd packages/opencode && bun run eval:subconscious:reaction -- --case <case_id> --timeout-ms 120000` for final-response/plugin behavior and `cd packages/opencode && bun run eval:subconscious -- --case <case_id> --timeout-ms 120000` for worker-cognition behavior.",
          "- Include a ready-to-add case object when the answer proposes a new eval. For JSONL datasets, show one compact single-line JSON object or a clearly labeled pseudo-JSONL entry.",
          "- Include the execution loop in strict order: baseline run on the same input before any scoped change, scoped change, after-change rerun on the exact same case, quick regression profile, and production/full gate if relevant. Name the command or invocation pattern; if the exact runner is unknown, mark the pattern UNVERIFIED instead of omitting it.",
          "- If the artifact does not exist yet, name the first create/edit action that would materialize it instead of ending at discovery.",
          "- Include a compact run-record shape: case id, model, judge, dataset hash, prompt/version hash, baseline score, after-change score, score delta, cost, latency, request count, pass/fail, regression result, and rollback condition.",
          "- Include a decision table with explicit thresholds: baseline already passes -> inspect judge/case; individual improves past target and regression passes -> accept; individual fails or stays below threshold -> revise/reject; regression fails -> reject or narrow the change.",
          "",
        ]
      : []),
  ]

  return sections
}

function requiredVisibleDeliverable(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  const evalSignal = hasEvalSignal(insights)
  const debugSignal = hasDebugSignal(insights)
  const architectureBoundarySignal = hasArchitectureBoundarySignal(insights)
  const persistentTechnicalFailureSignal = hasPersistentTechnicalFailureSignal(insights)
  const metricReadinessSignal = hasMetricReadinessSignal(insights)
  const items = [
    ...(debugSignal
      ? [
          "- Include the user-facing debug handoff when the user must verify behavior: expected event sequence, exact surfaces or files to watch, acceptable alternative evidence, evidence-to-next-action mapping, and the first failure split that tells the agent where to inspect next. If no existing surface is known, propose one temporary status file, trace path, or log prefix with a concrete name.",
          "- For OpenCode/plugin debug, name exact surfaces instead of generic logs: TUI status label, `/subconscious-debug`, `.opencode/subconscious/debug/latest-run.json`, debug dashboard, or a concrete log prefix. Include the screenshot/snippet fields the user should capture.",
          "- Make the first debug instruction one primary live surface plus the compact failure split: load/config, trigger/subscription, downstream effect/worker. Use fallbacks only after the primary observation.",
          "- For review/comment/triage-agent debugging, make the first ask either one PR link, one screenshot/comment thread, or one copied comment plus visible surrounding diff/context; then map it to trigger/timing, diff/context extraction, model judgment/rubric, and formatting/publishing. Say raw traces are optional secondary evidence for the agent, not the user's first job.",
          "- For review/comment/triage-agent debugging, use this visible shape when possible: `Send one of these first: 1) PR link to the exact comment, 2) exact copied comment + file/line + 5-10 surrounding diff lines, 3) screenshot of the comment thread with nearby diff`. Then add `How I map it:` with trigger/timing, diff/context extraction, model judgment/rubric, and formatting/publishing.",
        ]
      : []),
    ...(evalSignal
      ? [
          "- Write the minimal eval/self-improvement artifact itself when that is the claim, not just the need for one: target file or dataset slot, literal input/context, expected output obligations, judge rubric or pass threshold, expected baseline failure, scoped change, individual rerun command, quick regression command, and metadata for model, judge, prompt or version, dataset, score, cost, latency, and request count.",
          "- Include the scoring/pass threshold and first editable artifact shape in the visible response. A synthetic eval without `minScore`, pass/fail assertion, or target case body is not operational yet.",
          "- The proof record is incomplete without run metadata fields: `model`, `judge`, `prompt_or_pipeline_version`, `dataset_hash`, `score`, `cost`, `latency_ms`, `request_count`, `baseline_result`, `after_change_result`, `regression_result`, and `decision`.",
          "- Prefer project-supplied eval/test slots before an UNVERIFIED placeholder. If exact current contents cannot be verified in the current turn, name the known target file and mark the case entry or run data as unverified, not the whole path.",
          "- Do not use a worker-cognition dataset for product delivery or application workflow proof. For delivery/e2e claims, use an auto-QA, app, integration, or e2e slot such as `packages/opencode/scripts/benchmark-autoqa-dataset.jsonl` in this plugin development repo.",
          "- For delivery/e2e claims, include a compact test matrix: deterministic unit or policy check, integration/e2e path, expected pass signal, expected fail signal, and the hidden failure each catches.",
          "- Use a concrete case id and dataset slot when possible. Avoid making `<id>` placeholders the first artifact because that leaves the main agent without an immediate file to edit or run.",
          "- Include a ready-to-add case body or pseudo-JSONL line, an explicit baseline-before-change step, exact accept/reject thresholds, and a named quick regression case/profile when the claim is about improving behavior.",
        ]
      : []),
    ...(architectureBoundarySignal
      ? [
          "- Write the architecture boundary contract as the deliverable, not just a plan: `source_corpus`, `principle_id_format`, `selected_note_schema`, `allowed_operations`, `forbidden_operations`, `handoff_boundary`, `docs_target`, `regression_artifacts`, and `before_after_verification`.",
          "- Make `selected_note_schema` operational, not just named: include the fields that keep retrieval small and non-solver-like, such as `note_id`, `source_principle_ids`, `selected_principles[]`, `principle_id`, `title`, `relevance_reason`, `principle_text_or_summary`, `application_bias`, `handoff_instruction`, and `forbidden_output_check`.",
          "- Preserve the full framework by separating corpus from note: the corpus/index keeps the complete source with stable IDs; the note carries only references plus a few selected principle summaries. Compression may create an index, but it must not replace or delete the source framework.",
          "- Include the compact corpus artifact shape: `corpus_entry` with `principle_id`, `worker_or_source`, `title`, `canonical_text`, `why_it_matters`, `failure_prevented`, `retrieval_tags`, and `source_ref`; and `corpus_index` with stable IDs mapped to source sections.",
          "- For retrieval or pre-note architecture, define the prohibition protocol concretely: the note is invalid if it solves the task, proposes implementation, performs broad extra reasoning, deletes framework detail for brevity, or emits fields outside the selected-note schema.",
          "- Include the artifact target shape that would reduce developer cognitive load: the corpus file/section, the retrieval prompt/schema file or UNVERIFIED slot, the docs section, one behavior eval case, and the same-case rerun plus quick regression profile.",
          "- Include a docs/test artifact list: corpus spec, retrieval prompt/schema spec, boundary docs for maintainers, role-drift eval case, normal-case regression, high-stakes calibration regression, and run-record output.",
          "- Include the regression harness shape: retrieval-only case, normal implementation case, and high-stakes/calibration case; pass when the note cites stable IDs and biases the main agent without solving; fail when it gives generic principles, deletes corpus detail, proposes implementation, or drifts into a second main-agent answer. Record model, judge, dataset/corpus hash, prompt hash, score, latency, cost, and request count.",
          "- Include an accept/reject table and run-record template for the architecture change: baseline passes -> inspect case strength; same-case improves and quick regression passes -> accept; same-case fails -> revise; regression fails -> reject or narrow. Record `case_id`, `corpus_hash`, `prompt_hash`, `model`, `judge`, `baseline_score`, `after_change_score`, `regression_result`, `latency`, `cost`, `request_count`, and `decision`.",
        ]
      : []),
    ...(persistentTechnicalFailureSignal
      ? [
          "- For a technical failure that persists after a narrow fix, write an ordered diagnostic ladder rather than repeating the first fix: storage/source state, outbound request evidence, backend acceptance, client state rehydration, and the negative/security check that falsifies the obvious explanation.",
          "- Start with the fastest triage sequence as the first visible diagnostic object: inspect stored state, inspect the first protected request after reload, read status/body and credential mode, then branch on no request/header, `401/403`, `200 but logged out`, or cookie/CORS mismatch.",
          "- Include one concrete request/response evidence block the user or agent can gather immediately: route or request name such as `GET /me`, `/api/me`, or the first guarded endpoint; auth/header/cookie/credential fields; response status/body class; UI state after response; and the branch each observation implies.",
          "- If auth can be cookie-based, explicitly check `credentials: include`, CORS credentials headers, `SameSite`, and `Secure`; if it is bearer-based, explicitly check the Authorization header, token validity, expiry, issuer/audience, and backend acceptance log.",
          "- Name the first code-path priority without asking the user to design it: auth bootstrap/rehydration, HTTP client wrapper/interceptor, backend auth middleware/guard, then route guard or UI session store. Ask for snippets only after the observable branch says which boundary is next.",
        ]
      : []),
    ...(metricReadinessSignal
      ? [
          "- When a metric, benchmark, score, or `100%` result is being translated into production/readiness confidence, include a concrete evidence sequence: metric provenance, dataset or coverage scope, failure analysis, integration or workflow check, rollback/monitoring gate, and the before/after or rerun evidence that would justify the claim.",
          "- Do not answer this as a tone correction only. The visible answer must state what evidence would make the release/readiness endorsement true and what evidence keeps it blocked.",
          "- Separate the two gates explicitly: `Metric validity` proves the score is real, reproducible, representative, and free of leakage; `Release readiness` proves integration, operational monitoring, rollback/override, residual-risk review, and staged deployment safety.",
          "- Any artifact path, run record, or dataset slot not inspected in the current turn must be framed as a target with current contents unverified, not as evidence already available.",
          "- Prefer gate labels over generic `First slice` wording for this class. Use an accept/revise/block matrix: accept readiness only if metric validity and release readiness both pass; revise if the metric is valid but release evidence is incomplete; block if provenance, negative controls, integration, rollback, or monitoring are missing.",
        ]
      : []),
    ...(evalSignal && hasDeliverySignal(insights)
      ? [
          "- Include a compact proof block when delivery confidence and QA are both active: `Proof record: baseline/current, after-change rerun, regression, artifact/log, residual risk` and `Decision rule: accept if the same case passes and regression is clean; revise if the same case fails; roll back or narrow if regression fails`. Keep it short enough for a response-only turn.",
          "- Make the proof block concrete, not conceptual: include field names such as `case_id`, `baseline_result`, `after_change_result`, `regression_result`, `artifact_or_log_ref`, `residual_risk`, and `rollback_condition`.",
        ]
      : []),
    ...(hasAnySignal(output, ["RISKS", "MINIMUM_FLOOR"]) || insights.some((insight) => insight.key === "W4")
      ? [
          "- Preserve the concrete risk objects named by the workers in the visible answer: state transitions, persistence rules, external callbacks, authority-bearing artifacts, trust boundaries, and the exact negative check that would falsify safety.",
        ]
      : []),
    ...(hasTrustArtifactSignal(insights)
      ? [
          "- For trust-bearing state, explicitly address the lifecycle floor as first-slice requirements: creation/source of authority, storage or persistence, scope/binding, bounded validity, consumption/reuse/revocation, leakage/replay exposure, and a manual happy-path plus negative check. If the artifact grants access or authority, include unpredictability/entropy and expiry/TTL or the system's equivalent bound. Do not move this minimum trust contract into follow-up work.",
          "- When external/source-of-truth state and local persisted or derived state can drift, separate those boundaries and name the reconciliation/drift gate instead of folding them into one generic integration test.",
        ]
      : []),
    ...(hasAnySignal(output, [
      "DELIVERY_CONTRACT",
      "MINIMUM_FLOOR",
      "non_negotiable_gates",
      "evidence_to_say_done",
      "evidence_to_claim_done",
    ])
      ? [
          "- Include the delivery floor when the answer implies readiness: first responsible slice, acceptance criteria, minimum negative check, evidence needed before claiming done or safe, and residual assumptions.",
          "- If a product or implementation decision is unknown, state the minimal assumption that lets the first slice proceed and the gate that would invalidate it; ask only for the decision if it truly changes the implementation.",
          "- Under demo or deadline pressure, include a compact manual proof checklist so the user can verify the slice without reverse-engineering the system.",
        ]
      : []),
    ...(hasDeliverySignal(insights)
      ? [
          "- Turn delivery confidence into an execution artifact: named first slice, implementation target shape, integration/e2e path, before/after evidence slots, accept/reject decision table, quick regression gate, residual risk, and next operational step.",
          "- If the user asks for a confident yes/no done or ready verdict, start with the calibrated verdict directly. Use `No, not done yet` when evidence is insufficient; use `Yes` only after the named gates pass. Do not soften a missing gate into maybe-language.",
          "- Include the exact next command, test slot, manual run path, or `UNVERIFIED` invocation pattern plus a compact run-record template: timestamp, command/path, result, artifact/log ref, residual risk, and decision.",
          "- For migrations or boundary rewrites, name the before/after same-case rerun explicitly: current evidence, migrated-path runtime proof, old-path negative proof, adjacent-control regression, and the decision rule. If the exact command is unknown, write `UNVERIFIED: run <migrated-flow e2e or manual path>` instead of leaving the command implied.",
        ]
      : []),
    ...(hasAnySignal(output, ["MAIN_AGENT_FLOOR", "WAKE_UP_CALL"])
      ? [
          "- Convert the strongest wake-up call into concrete professional movement; do not leave it as advice, vibes, or a private checklist.",
        ]
      : []),
  ]

  if (items.length) return items
  return [
    "- Turn the worker signals into one concrete next response with explicit assumptions, the next action or decision path, and the evidence that would make confidence honest.",
  ]
}

function situationalResponseContracts(insights: ConsolidatorInsight[]) {
  const contracts = [
    ...(hasLayeredSuiteSignal(insights)
      ? [
          "Situational contract - layered validation suite:",
          "- If the user asks what test layers are needed before trust, the visible response must include a compact suite matrix, not just one eval artifact.",
          "- A fail-first case may be the center of the workflow, but it cannot replace the layer taxonomy. Show the suite matrix first, then name the first case.",
          "- Cover these layers in substance: deterministic unit tests for local parser/routing/config logic; plugin/tool contract tests for load shape, packaging, and dependencies; fake-LLM orchestration tests for event/session/worker lifecycle; live LLM-as-judge evals for cognitive quality under stated model/judge/dataset; and real user-flow/e2e or manual debug checks for the delivered runtime workflow.",
          "- For each layer, state what it proves, what it cannot prove, and the hidden failure it catches.",
          "- Keep nondeterministic LLM evals separate from ordinary unit tests. A strong average cannot promote the system if a critical layer has no gate.",
          "",
        ]
      : []),
    ...(hasCognitiveLoadHandoffSignal(insights)
      ? [
          "Situational contract - low-friction user feedback handoff:",
          "- If the user is confused, non-technical, overloaded by traces, or asked to test a delivered workflow, the visible response must make one primary evidence action mandatory and easy: one screenshot, one copied status block, one PR/comment link, or one visible UI state.",
          "- Do not satisfy this with only a one-line human description. The one-line description can accompany the handoff, but the primary ask should still be a screenshot, copied status block, PR/comment link, or visible UI state that reduces ambiguity.",
          "- Default visible shape: ask for exactly one screenshot/status/link/comment first; then give a three-state copy block: `Working`, `No-op / nothing changed`, `Error / wrong result`; then say raw traces/logs are optional fallback for the agent, not required from the user.",
          "- Include a literal `Copy/paste status block` when the user is testing manually: `Status: Working | No-op | Error`, `Evidence: screenshot/status/link/comment`, `What I see: ...`, `Raw traces/logs: not needed unless asked`.",
          "- Make the three-state block reusable like a tiny dashboard: each row should include what the user sees, what they send back, and what the next agent checks from that evidence.",
          "- For confused or non-technical users, offer at most two evidence paths up front: preferred screenshot/status/link/comment, or the copy/paste status block if that is easier. Do not ask for multiple extra details before the first artifact.",
          "- Use plain-language labels first and technical subsystem names second: wrong target/context (load/config), ran at the wrong time (trigger/subscription), bad generated result (worker/model/formatting).",
          "- For generated review, triage, or comment agents, lead with the simplest PR-visible artifact menu: `PR link to the comment`; or `exact copied comment + file/line + 5-10 surrounding diff lines`; or `screenshot of comment thread with nearby diff`. Explicitly say raw logs or prompt traces are not required for the first diagnosis.",
          "- Map review/comment evidence to likely subsystems in the visible answer: trigger/timing, diff or context extraction, model judgment/rubric, and comment formatting/publishing.",
          "- The mapping must be operational: wrong event/timestamp -> trigger/timing; wrong file/hunk or stale context -> diff/context extraction; correct target but bad critique -> model judgment/rubric; correct text but bad placement or display -> formatting/publishing.",
          "- Prefer the visible surface before technical paths. A non-technical user should be able to respond by sending one screenshot or copying one small block without understanding repo files.",
          "- Include a copy-ready mini status block or checklist with at least three outcome states: expected success, no-op/nothing happened, and visible error/wrong result.",
          "- Keep raw logs, JSON traces, and prompt dumps secondary agent evidence, not the user's main task.",
          "- Map the simple evidence to likely subsystems in plain language: load/config, trigger/subscription, downstream worker/model judgment, formatting/publishing, or runtime effect as applicable.",
          "- Name the fallback evidence and stop/escalation condition if the primary observation is absent, stale, or ambiguous.",
          "",
        ]
      : []),
    ...(hasPersistentTechnicalFailureSignal(insights)
      ? [
          "Situational contract - persistent technical failure after a narrow fix:",
          "- If the user says they already tried the suggested fix and the failure persists, the visible response must stop repeating that fix and switch to a falsifying diagnostic ladder.",
          "- Start with the corrected framing: the previous fix only proved one boundary; it did not prove the source state, outbound request, backend acceptance, or client rehydration path.",
          "- Include a compact `Evidence block` with fields the user can capture immediately: `stored_state`, `outbound_request`, `auth_or_credentials_sent`, `response_status`, `response_body_class`, `ui_state_after_response`, and `next_branch`.",
          "- If the failing boundary involves auth, session, token, access, credentials, or login state, cover these floors in substance: token expiry/invalidity, CORS or credential mode, backend acceptance model (Bearer token versus cookie/session), client boot or store rehydration, and storage/security implications such as localStorage exposure.",
          "- Name the security caveat plainly when localStorage holds JWTs: it is exposed to XSS, so it may be acceptable only under the project's threat model; httpOnly cookies or in-memory/short-lived tokens may be safer depending on the architecture.",
          "- Include the fastest check sequence: inspect storage, inspect the first authenticated request after reload, read status/body, then map `no request`, `401/403`, `200 but UI logged out`, or `credential/cookie mismatch` to the next subsystem.",
          "- Make the fastest check sequence a visible triage ladder before broad explanation. Use concrete observable names: DevTools Network row, request URL, request headers/cookies, response status/body class, backend auth log line when available, and UI state after reload.",
          "- Include a branch-specific decision table: no request/header -> auth bootstrap or HTTP interceptor/client wrapper; `401/403` -> backend auth middleware, token expiry, signature, issuer/audience, revocation, or cookie-vs-bearer contract; `200 but UI logged out` -> client store, route guard, or rehydration; cookie/CORS mismatch -> `credentials`, CORS credentials headers, `SameSite`, and `Secure`.",
          "- Keep the handoff low-friction but technical enough to be actionable; do not make a screenshot replace request/response evidence when the failure is a protocol or auth boundary.",
          "- Do not lead with `First artifact: UNVERIFIED` for this class. Lead with the real observable artifact class: browser Network request, request/response row, backend auth log line, or copied status/body excerpt. Mark only the current contents as unverified.",
          "",
        ]
      : []),
    ...(hasExternalContractSignal(insights)
      ? [
          "Situational contract - external source-of-truth boundary:",
          "- When the delivery depends on an external provider contract, the visible response must say which facts require primary-source verification before confident implementation.",
          "- Name the provider-specific source classes or docs/pages to verify before coding, not only generic official docs. Examples of source classes: webhook event payload docs, signature validation docs, endpoint permission docs, app/token scope docs, rate limit docs, retry/redelivery docs, and target API endpoint docs.",
          "- Include the first-slice gates for payload/schema or event shape, authenticity/signature verification, permission/scope requirements, rate-limit/quota behavior, retry/duplicate-delivery or idempotency semantics, and the API side effect being relied on.",
          "- Do not collapse those gates into generic auth, error handling, or residual risk language. If signature/authenticity, permission/scope, rate-limit/retry, or idempotency matters, name them explicitly in the visible answer.",
          "- Prefer a compact `External contract checks` block with these rows in substance: source docs to verify, payload/event schema, signature/authenticity, permissions/token scopes, rate-limit/retry behavior, idempotency or duplicate delivery key, API side effect/target binding, and local/staging integration path.",
          "- If duplicate delivery is possible, name the dedupe key or strategy class, such as provider delivery id, event id plus target id, or target id plus source revision. Do not leave idempotency as a vague noun.",
          "- Include a local, mocked, or staging integration path that exercises the provider boundary end to end before any ready/safe claim.",
          "- Include one negative check before external writes: forged/unsigned input, malformed payload, duplicate delivery, insufficient permission, wrong target, or forbidden API call depending on the provider.",
          "",
        ]
      : []),
    ...(hasCriticalFloorSignal(insights)
      ? [
          "Situational contract - critical floor over aggregate score:",
          "- If an aggregate score is strong but a critical subgroup, tail, or security-sensitive slice is weak, the visible response must reject the broad quality/ready/ship claim until that floor passes.",
          "- Name the weak subgroup and the minimum failing cases or case classes to fix first. Do not hide them behind the average.",
          "- Include a same-case before/after loop for those failing cases, a nearby quick regression gate, and an explicit acceptance floor for the critical slice.",
          "- Include a stop condition for public or blanket quality claims: if the critical floor still fails, narrow the claim, revise, or roll back; do not call the system high quality with a caveat.",
          "- Default visible shape: `Scoped claim`, `Blocking floor`, `Minimum failing cases`, `Before/after rerun`, `Regression gate`, `Stop condition`.",
          "",
        ]
      : []),
    ...(hasMetricReadinessSignal(insights)
      ? [
          "Situational contract - metric provenance before readiness:",
          "- If a benchmark, score, precision number, pass rate, or 100% result is used to justify production/readiness, the visible response must reject the direct promotion from metric to release claim until provenance and operational gates are shown.",
          "- Include `Metric provenance`: dataset/case coverage, run metadata, judge/model version, leakage risk, and whether negative/ambiguous/adversarial cases were included.",
          "- Include `Release evidence`: at least one integration or representative workflow check, failure-analysis classes such as false positives and false negatives, rollback or override path, and monitoring or post-release detection.",
          "- Keep `Metric validity gate` and `Release readiness gate` separate in the visible answer. A metric can be valid but still not sufficient to ship; a release can be blocked even when the score is reproducible.",
          "- Include `Before/after evidence gate`: baseline claim or prior bad response, corrected response or system change, same-case rerun or review, adjacent regression, and accept/revise/reject decision rule.",
          "- Include concrete run-record fields when available or as unverified targets: `dataset_hash`, `run_id`, `model`, `judge`, `prompt_or_pipeline_version`, `case_count`, `critical_failures`, `false_positive_review`, `false_negative_review`, `integration_check`, `rollback_or_override_check`, and `decision`.",
          "- Default visible shape: `Scoped claim`, `Metric provenance`, `Blocking release gates`, `Before/after evidence`, `Failure analysis`, `Rollback/monitoring`, `Decision rule`.",
          "",
        ]
      : []),
    ...(hasAutonomousAgentDevelopmentSignal(insights)
      ? [
          "Situational contract - autonomous-agent development loop:",
          "- When improving or extending an autonomous agent, the visible response must snapshot the current baseline artifact/state before proposing the next capability change.",
          "- Name one narrowly targeted fail-first case for the next incremental capability, not a broad bundle of cases as the first move.",
          "- Name the smallest code, prompt, rubric, or detector delta to try first.",
          "- Include the run record fields that make the iteration auditable: case id, baseline score/output, after-change score/output, prompt/version hash, dataset hash, model, judge, cost, latency, request count, regression result, and rollback condition.",
          "- Default visible shape: `Baseline snapshot`, `Fail-first case`, `Smallest delta`, `Same-case rerun`, `Quick regression`, `Run record`.",
          "",
        ]
      : []),
    ...(hasOperationalHandoffSignal(insights)
      ? [
          "Situational contract - operator handoff artifact:",
          "- If the agent output will be used by a human responder, reviewer, on-call engineer, or operational owner, include a compact handoff artifact, not only an eval case.",
          "- The handoff artifact should include summary, evidence used, confidence, unknowns, recommended next action, escalation/owner state, and a timestamp/source reference when relevant.",
          "- Include one simulated or live workflow check that proves the artifact can move through the real handoff path, not just a judge score on the text.",
          "- Default visible shape: `Handoff artifact`, `Workflow check`, `Release/confidence gate`.",
          "",
        ]
      : []),
    ...(hasRegressionFailureSignal(insights)
      ? [
          "Situational contract - failed regression blocks promotion:",
          "- If a scoped change improves the target case but a quick regression, benign-control case, or adjacent floor fails, the visible response must block ship/promotion/readiness.",
          "- Preserve the target-case improvement as a requirement for the next candidate, but do not ship it as an acknowledged tradeoff unless the visible claim is explicitly narrowed away from the failed behavior.",
          "- Do not say `accept this version`, `keep this version`, or `ship as a tradeoff` while the failed regression is still part of the claim. Say: preserve the improved behavior as a requirement, reject the current candidate for promotion, then revise/narrow/rollback.",
          "- The default next action is revise, narrow, or roll back, then rerun the exact target case and the failed regression case before any promotion claim.",
          "- Forbidden framing: `ship as a tradeoff`, `acceptable regression`, `ready with caveat`, or `good enough overall` when the failed regression is part of the claim's floor.",
          "- Default visible shape: `Verdict: do not ship/promote`, `Preserve`, `Action`, `Gate`, `Stop condition`.",
          "",
        ]
      : []),
    ...(hasArchitectureBoundarySignal(insights)
      ? [
          "Situational contract - architecture responsibility boundary:",
          "- If the issue is a prompt/system architecture boundary, the visible response must preserve the framework source, not compress it into generic advice.",
          "- Name stable principle or corpus IDs, source corpus shape, selected-note schema, allowed operations, forbidden operations, and the handoff between the retrieval/biasing layer and the reasoning/main-agent layer.",
          "- These boundary fields must be named explicitly, not merely implied through a proposed eval or high-level description.",
          "- Default visible shape: `source_corpus`, `principle_id_format`, `selected_note_schema` with field semantics, `allowed_operations`, `forbidden_operations`, `handoff_boundary`, and `regression_artifacts`.",
          "- For prompt or architecture behavior, choose a behavior/reaction eval slot or equivalent before delivery/e2e slots; delivery/e2e is for runtime workflow proof, not for preserving a prompt-layer boundary.",
          "- Explicitly forbid the boundary failure being discussed: solving the task inside a retrieval note, doing broad extra reasoning, deleting framework detail for brevity, or leaving role drift undocumented.",
          "- Name a docs target that explains the boundary to future maintainers, and a behavior eval target that rejects role drift. If the exact file cannot be inspected in the turn, mark the case entry/current contents unverified, not the whole target shape.",
          "- Include a before/after verification loop: baseline response on the same architecture correction, scoped prompt/schema change, same-case rerun, quick regression profile, run metadata, and accept/reject thresholds.",
          "- Include the run-record template and decision table in the visible answer when the user is asking how to fix the architecture, because the boundary is not protected until future maintainers can rerun and interpret the gate.",
          "",
        ]
      : []),
  ]

  if (!contracts.length) return []
  return ["Response contracts activated by worker signals:", ...contracts]
}

function coverageSelfCheck(contracts: string[]) {
  if (!contracts.length) return []
  return [
    "Coverage self-check before the visible answer:",
    "- Silently map every activated situational contract to visible substance before answering. If the answer omits a contract's concrete surface, gate, or boundary, revise before sending.",
    "- Do not replace a concrete evidence artifact with a weaker substitute. For debug handoffs, a one-line status is useful only when paired with the screenshot/status/link/comment artifact that makes the evidence inspectable.",
    "- Do not close with permission-seeking language. Close with the default action, evidence gate, or single blocking decision.",
    "",
  ]
}

function responseCoverage(insight: ConsolidatorInsight) {
  const output = insight.output.trim()
  const extracted = [
    labeledValue(output, "WAKE_UP_CALL"),
    labeledValue(output, "MOST_CRITICAL"),
    labeledBlock(output, "MINIMUM_FLOOR"),
    labeledBlock(output, "derived_floor"),
    labeledBlock(output, "BLIND_SPOTS"),
    labeledBlock(output, "SAFE_ASSUMPTIONS"),
    labeledBlock(output, "BLOCKING_DECISIONS"),
    labeledValue(output, "DEFAULT_NEXT_PATH"),
    labeledBlock(output, "non_negotiable_gates"),
    labeledBlock(output, "evidence_to_say_done"),
    labeledBlock(output, "evidence_to_claim_done"),
    labeledBlock(output, "minimal_assumptions_to_proceed"),
    labeledBlock(output, "truly_blocking_decisions"),
    labeledBlock(output, "MAIN_AGENT_FLOOR"),
    labeledBlock(output, "REQUIRED_RESPONSE_COVERAGE"),
    labeledBlock(output, "DEBUG_HANDOFF"),
    labeledBlock(output, "DEBUG_ARTIFACT"),
    labeledBlock(output, "PRIMARY_LIVE_SURFACE"),
    labeledBlock(output, "THREE_WAY_FAILURE_SPLIT"),
    labeledBlock(output, "EVIDENCE_CONTRACT"),
    labeledBlock(output, "MEASUREMENT_CONTRACT"),
    labeledBlock(output, "EVAL_SPEC"),
    labeledBlock(output, "EVAL_ARTIFACT"),
    labeledBlock(output, "READY_TO_ADD_CASE"),
    labeledBlock(output, "ready_to_add_case_jsonl"),
    labeledBlock(output, "OPERATIONAL_ARTIFACT"),
    labeledBlock(output, "RESPONSIBILITY_CONTRACT"),
    labeledBlock(output, "RUN_PLAN"),
    labeledBlock(output, "REGRESSION_GATE"),
    labeledBlock(output, "state_boundaries"),
    labeledBlock(output, "manual_demo_checklist"),
    labeledBlock(output, "OPERATIONALIZATION"),
    labeledValue(output, "confidence_gap"),
  ]
    .filter((item): item is string => Boolean(item && item.toUpperCase() !== "NONE"))
    .join(" ")

  return `[${insight.key}: ${insight.name}] ${compactLine(extracted || output, extracted ? 520 : 220)}`
}

function hasAnySignal(output: string, labels: string[]) {
  return labels.some((label) => output.toLowerCase().includes(label.toLowerCase()))
}

function hasEvalSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    hasAnySignal(output, [
      "EVAL_SPEC",
      "EVAL_ARTIFACT",
      "EMPIRICAL_LEARNING_CONTRACT",
      "MEASUREMENT_CONTRACT",
      "OPERATIONAL_ARTIFACT",
    ]) || insights.some((insight) => ["W3", "W10", "W12"].includes(insight.key))
  )
}

function hasDebugSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    insights.some((insight) => insight.key === "W8") ||
    hasAnySignal(output, ["DEBUG_HANDOFF", "DEBUG_ARTIFACT"]) ||
    hasPluginRuntimeDebugSignal(output)
  )
}

function hasPluginRuntimeDebugSignal(output: string) {
  return (
    hasAnySignal(output, [
      "plugin callback",
      "callback_entered",
      "idle_detected",
      "hook_dispatched",
      "worker_action_completed",
      "session.idle",
      "idle transition",
      "tui",
      "/subconscious-debug",
      "debug dashboard",
      "latest-run.json",
    ]) &&
    hasAnySignal(output, [
      "debug",
      "trace",
      "status file",
      "hook subscription",
      "callback runtime",
      "plugin",
      "background automation",
    ])
  )
}

function hasDeliverySignal(insights: ConsolidatorInsight[]) {
  return (
    insights.some((insight) => insight.key === "W14") ||
    insights.some((insight) => /\bDELIVERY_CONTRACT\s*:/i.test(insight.output))
  )
}

function hasTrustArtifactSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return hasAnySignal(output, [
    "trust-bearing",
    "authority",
    "durable access",
    "durable state",
    "moves value",
    "external commitment",
    "irreversible",
    "bounded validity",
    "revocation",
    "replay",
    "cross-boundary",
    "trust boundary",
  ])
}

function hasLayeredSuiteSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    insights.some((insight) => insight.key === "W12") &&
    hasAnySignal(output, [
      "layered test coverage",
      "layered validation",
      "what each proves",
      "deterministic unit",
      "contract tests",
      "fake-llm",
      "live llm-as-judge",
      "real user-flow",
      "unit, contract, integration",
      "separate layers",
      "nondeterministic evals",
    ])
  )
}

function hasCognitiveLoadHandoffSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    insights.some((insight) => insight.key === "W8") &&
    hasAnySignal(output, [
      "cognitive_load",
      "cognitive load",
      "non-technical",
      "too technical",
      "raw logs",
      "raw traces",
      "one screenshot",
      "copied status",
      "comment thread",
      "PR link",
      "debug handoff",
    ])
  )
}

function hasPersistentTechnicalFailureSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  const persistenceContext = hasAnySignal(output, [
    "already tried",
    "tried the suggested fix",
    "still fails",
    "same failure",
    "first-path",
    "lo hice",
    "no toma la sesion",
    "no toma la sesión",
  ])
  const technicalBoundary = hasAnySignal(output, [
    "authorization",
    "bearer",
    "localStorage",
    "jwt",
    "session",
    "cors",
    "credentials",
    "cookie",
    "request/response",
    "protected request",
    "401",
    "403",
  ])
  return (
    insights.some((insight) => ["W2", "W4", "W6", "W12"].includes(insight.key)) &&
    persistenceContext &&
    technicalBoundary
  )
}

function hasExternalContractSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  const externalProvider = hasAnySignal(output, [
    "external api",
    "external provider",
    "third-party",
    "provider contract",
    "webhook",
    "github",
    "stripe",
    "slack",
    "jira",
    "oauth",
  ])
  const strongProviderContractSurface = hasAnySignal(output, [
    "external api",
    "provider contract",
    "webhook",
    "payload",
    "signature",
    "signed",
    "rate-limit",
    "rate limit",
    "retry",
    "duplicate delivery",
    "idempotency",
    "oauth",
    "api side effect",
  ])
  const researcherRaisedContract =
    insights.some((insight) => insight.key === "W13") && (externalProvider || strongProviderContractSurface)
  return (
    researcherRaisedContract ||
    (insights.some((insight) => ["W4", "W14"].includes(insight.key)) &&
      externalProvider &&
      strongProviderContractSurface)
  )
}

function hasCriticalFloorSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return hasAnySignal(output, [
    "score laundering",
    "score_laundering",
    "critical category",
    "critical subgroup",
    "critical slice",
    "weak slice",
    "weak tail",
    "blocking floor",
    "category floor",
    "weak critical floor",
    "high quality",
    "readiness claim",
  ])
}

function hasMetricReadinessSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    insights.some((insight) => ["W12", "W14", "W3", "W6"].includes(insight.key)) &&
    hasAnySignal(output, ["production", "readiness", "release", "ship", "producción", "ready"]) &&
    hasAnySignal(output, [
      "100%",
      "precision",
      "score",
      "benchmark",
      "metric",
      "dataset",
      "coverage",
      "puntaje",
    ])
  )
}

function hasRegressionFailureSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return hasAnySignal(output, [
    "regression fails",
    "regression failed",
    "quick regression floor",
    "regression stays below",
    "harmless refactor",
    "benign refactor",
    "routine-review",
    "rollback condition",
    "reject, narrow, or roll back",
    "block ship",
    "block promotion",
  ])
}

function hasAutonomousAgentDevelopmentSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    hasAnySignal(output, [
      "autonomous agent",
      "review-agent",
      "review agent",
      "triage agent",
      "agent prompt",
    ]) &&
    hasAnySignal(output, [
      "baseline",
      "fail-first",
      "same-case",
      "quick regression",
      "prompt/version",
      "dataset hash",
      "run record",
      "case_id",
    ])
  )
}

function hasOperationalHandoffSignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return hasAnySignal(output, [
    "incident",
    "triage",
    "on-call",
    "oncall",
    "responder",
    "escalation",
    "likely_owner",
    "mitigation",
    "runbook",
    "service catalog",
  ])
}

function hasArchitectureBoundarySignal(insights: ConsolidatorInsight[]) {
  const output = insights.map((insight) => insight.output).join("\n")
  return (
    insights.some((insight) => insight.key === "W11") &&
    hasAnySignal(output, [
      "retrieval layer",
      "situational retrieval",
      "source corpus",
      "principle ids",
      "corpus ids",
      "selected-note schema",
      "note schema",
      "allowed operations",
      "forbidden operations",
      "role handoff",
      "framework through retrieval",
    ])
  )
}

function labeledValue(output: string, label: string) {
  return output.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"))?.[1]?.trim()
}

function labeledBlock(output: string, label: string) {
  return output
    .match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|\\n[a-z_]+:|$)`, "i"))?.[1]
    ?.trim()
    .replace(/\n\s*/g, " ")
}
