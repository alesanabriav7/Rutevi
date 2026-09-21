# Rutevi JSON requests

`rutevi invoke` takes a JSON object on stdin, with no flags or positional arguments.
Input is limited to 64 KB. Route/assign/open return JSON on stdout. Run streams the
executor's output to stdout and prints a final `[rutevi]` process receipt to stderr;
its exit code matches the executor. Preserve that exit status when using a process tool.
Use a unique quoted heredoc delimiter absent from the input, or send bytes through
a process API. Never interpolate task text into shell command strings.

## Assign native or external executors

```sh
rutevi invoke <<'RUTEVI_REQUEST'
{
  "action": "assign",
  "context": "Relevant constraints and decisions from this conversation.",
  "tasks": [{
    "id": "fix",
    "prompt": "Fix the confirmed duplicate submission and verify it.",
    "candidates": [{
      "id": "here",
      "kind": "current",
      "description": "Current agent already understands this localized change; no handoff overhead."
    }]
  }]
}
RUTEVI_REQUEST
```

Add only actually callable candidates, not illustrative model names:

- `id`: unique within this task; a local identifier.
- `kind`: `current`, `subagent` or `external`.
- `description`: agentic capabilities, limitations, scope and handoff overhead; no credentials.
- `costRank`: optional finite nonnegative relative total-cost estimate (lower is cheaper).
  Include coordinator review and context transfer. Supply all ranks or none; partial
  ranks do not enable cost sorting. Not dollars or a price inferred from a name.
- `latencyRank`: optional relative latency estimate, lower is faster; independent of cost.
- Optional `model`, `effort`, `variant`, `agent`: exact values the host can apply. Omit fields
  the host tool cannot accept. For OpenCode subagents, `agent` can identify a
  configured subagent whose model is already fixed.
- `harness`: required for external candidates (`codex`, `claude`, `opencode`).

Supply 1–8 tasks, each with 1–32 candidates. No dependencies or execution commands
are accepted: the host owns scheduling and tools. Jev sees only the context, task
prompts and whitelisted candidate metadata. Arbitrary extra fields are dropped.

Each task asks one executor preference and one capability judgment per candidate,
in the same API call. Use a small meaningful shortlist (usually 2–4).
Output preserves `probabilities`, `preference`, `assessments`, `costBasis` and usage.
Only `suitable` assessments with confidence >= 0.5 are eligible. This is an initial
capability-evidence policy, not a calibrated task-success probability. Each task accepts `priority`: `balanced` (default), `quality`, `economy`, or `speed`.
Balanced/quality preserve Jev's best-fit preference among eligible candidates.
Economy sorts by costRank only when all candidates have it; speed does the same with
latencyRank. Incomplete estimates defer to Jev, never treat missing values as zero.
The receipt declares priority, costBasis and latencyBasis; estimates are not actual prices.
Rank ties favor continuity then preference; best-fit ties favor continuity.
A low preference confidence does not block a sufficiently supported capability.

- `selected`: execute `candidate`, copied exactly from the supplied inventory.
- `review-required`: capability needs evidence; inspect, then reroute only with new facts.
- `no-fit`: all candidates have stated unsuitable judgments; expand real capabilities.
- `needs-context`: Jev preference was `none`; recover the goal or inspect coverage.
- `unavailable`: API or response validation failed; no executor selected.

Routing is not execution authorization. Missing key/invalid input fails before the API.
No workers are created here. Results include the Jev preference even when cost policy
chooses another sufficient candidate, so the decision is auditable.

## Route, run, or open using the existing model policy

```sh
rutevi invoke <<'RUTEVI_REQUEST'
{
  "action": "route",
  "harness": "codex",
  "prompt": "Implement the agreed pagination fix and verify it.",
  "context": "Scope and acceptance criteria prepared by the coordinator.",
  "cwd": "/absolute/project/path"
}
RUTEVI_REQUEST
```

- `route`: selection only; report `route.source` including any fallback.
- `run`: select and execute noninteractively; the host must collect results and verify.
- `open`: select and open a separate Herdr session; requires `HERDR_ENV=1`.

All three require `harness` and a nonempty `prompt`. `cwd` defaults to the caller's
directory. Optional `context`, `model`, `effort`, `variant`, `agent`, `sandbox` use
the existing CLI semantics. Explicit `model` skips Jev; do not call it a Jev decision.
For an assigned external candidate, pass its model/effort (or OpenCode variant)
explicitly so execution does not route a second time. `effort` here supports
low/medium/high for Codex and Claude; OpenCode uses `variant`. `sandbox` supports
read-only/workspace-write for Codex. No permission bypass flags are accepted.

Run/open pass only the prompt and explicit context to a new executor; they do not
copy the host's history. Routing sends this text to TypeSafe. Launched executors
use their own provider authentication and do not receive the TypeSafe key.
If a process needs interactive approval, return to the host's approval flow or use
an explicitly requested interactive session; never add autoapproval to make it pass.

## Routing the next phase (0.10.0)

An optional `step` on each task contains:

```json
{
  "goal": "Finish the concurrency fix and verify it",
  "observation": "Reviewed patch is ready; only the agreed tests remain",
  "history": ["Established global lock order A then B", "Applied and reviewed the patch"],
  "previousCandidateId": "worker-high"
}
```

`goal` and `observation` are nonempty text; `history` is 0–8 nonempty factual summaries.
`previousCandidateId` is optional and must identify a supplied candidate. The task's
`prompt` describes only the next phase. Extra step fields are dropped; the existing
64 KB limits still apply. Output `scope` is `next-step` or `task`.

Offer same-model candidates with distinct supported `effort` or `variant` values,
capability descriptions and defensible cost ranks. In economy/speed with complete estimates, the relevant rank is compared before continuity;
equal-cost eligible choices favor the prior configuration/model, then Jev preference.
No automatic retry or persistent session is created. The host owns factual history,
verification and whether a selected configuration can be applied without a new session.
Do not batch dependent phases with future observations; route after results arrive.
