# Measuring Jev's value

Run `npm run bench:value` from the repository root. This is a live, paid-usage
experiment, separate from offline tests and from routing-label evaluations.

[First pilot: 2026-09-21](2026-09-21-pilot.md) — all strategies passed; Jev avoided
frontier use but did not improve total latency. Raw evidence is included.

## Question and baselines

Does Jev preserve task success while reducing frontier use or elapsed time,
compared with always using Astra high? Does it add enough value to justify its
overhead compared with always using Luna medium?

All three strategies receive identical task requirements and starting files.
Jev alone chooses model/effort from the supported direct policy. No extra LLM
classifies tasks, prepares its request, or judges answers. There are no retries or
fallbacks. Each executor can use native tools and edits `solution.js`; deterministic
checks run on the saved file after the turn. Merely reporting success does not pass.

The initial suite contains clamp (7 checks), interval merging (1,266 checks,
including deterministic coverage cases), and a transfer ledger (7 checks).
Check counts are diagnostics, **not weights**: each task contributes one pass/fail.
The checks include mutation, duplicate IDs, rejected-operation retries, self-transfer
overflow and account names inherited from Object.prototype. Passing these finite
checks is the acceptance criterion, not a proof of general correctness.

## Reading and accumulating evidence

Each timestamped run under `artifacts/value-benchmark/` stores its manifest,
attempts, source code, raw usage, routing decisions and Markdown report. An attempt
is saved even when routing or execution fails. The wall clock includes Jev,
App Server startup and execution; it excludes model discovery and local grading.
The per-executor deadline is 120 seconds, in addition to the router's own deadline.

```sh
BENCH_REPEATS=3 npm run bench:value
node scripts/benchmark-summary.mjs artifacts/value-benchmark/*/results.json
```

The aggregator rejects duplicate runs and mismatched suite/policy/harness hashes,
catalogs, Codex versions or deadlines. It reports time per successful task including
time spent on failed attempts. Missing measurements stay unknown. Keep runtime
dependencies and router code unchanged when accumulating comparable runs; those
imported sources are not independently fingerprinted by the initial harness.
Partial runs remain inspectable, but unequal task coverage is not a fair comparison.

Rotate strategy order across tasks and repetitions; do not discard failures or
rerun selectively. Fresh threads do not guarantee cold provider caches. Record
cached input separately. Do not add reasoning tokens to output tokens again, or
sum cumulative thread-usage notifications: each attempt stores only the last total.

## What this can support

- Observed pass@1, wall time, selected models and token usage on this exact suite.
- Router overhead, separately from executor time, with Jev usage retained.
- A statement about reduced frontier usage **if** success is maintained.

Token totals across different models are not monetary costs. Billed savings need
verified model-specific input/cache/output rates, Jev charges and the relevant
subscription accounting. This pilot cannot support statistical superiority, a 90%
coverage claim, long-horizon architecture quality or Claude/OpenCode performance.

To extend coverage, add tasks and deterministic checks to
`test/benchmark-fixtures.js` before collecting results. Validate the grader with
correct and deliberately broken implementations. A changed suite starts a new
comparison cohort. The next useful expansion is representative repository work
with integration tests and hard cases where using a frontier model improves success.
