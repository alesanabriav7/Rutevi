---
name: jev
description: Use Jev to select an executor and model for a task or concrete subtasks, then complete the work in this conversation. Use when the user invokes Jev or requests model routing and delegation with Rutevi.
---

# Jev in the current conversation

Use the task and relevant conversation context. Inspect enough to identify the scope,
dependencies and completion criteria with a brief inspection; a request for architecture is not automatically
a request to implement it. Keep the current conversation as coordinator.

Rutevi's CLI must be installed (`npm ci` and `npm link` from its checkout), with
`TYPESAFE_API_KEY` in the host environment. Do not read or print credentials.
Invoke `rutevi invoke` with JSON on stdin using a quoted heredoc or a process API.
Read [the request contract](references/requests.md) for payloads and examples.
If the CLI or key is missing, report that routing is unavailable; never claim Jev ran.

## Routing before model inference

If the user wants routing with Jev alone, the transport must run first. OpenCode's
native `/jev <task>` already selects the executor before inference and no longer
injects this workflow. Execute the task directly; do not reconstruct candidates or
call Jev again just to repeat that selection.

For Codex, `rutevi direct` is a lightweight terminal session over App Server, with
automatic inventory, bounded literal history, and Jev before each executor turn.
`rutevi direct --session <id>` resumes it. It is not a TUI and does not need Herdr.
A skill invoked inside the Codex app has already consumed a model turn; it cannot
retroactively provide zero-model routing. Do not claim that `$jev` changes this.
Claude can use `rutevi run --harness claude` for direct initial routing; its skill
likewise runs inside an existing model turn. No universal pre-turn plugin is implied.

## Choose, execute, integrate

1. Optimize task fit: required quality, response latency and completion cost. Offer a callable modest
   agentic worker for ordinary implementation, bug fixes, tests and refactoring,
   an intermediate coding specialist for coordinated implementation, and a frontier
   candidate for difficult reasoning or escalation. Do not reduce the pool to cheap vs frontier. A bounded task
   can be delegated whole to save inference cost; parallelism is not required.
   For a one-line edit, handoff may cost more than finishing here. Do not force
   a percentage of cheap routes or invent unavailable models. Keep the coordinator's
   investigation brief; do not solve the task before asking Jev who should do it.
2. Submit `action: "assign"` with those tasks and each task's real candidates.
   `priority` defaults to `balanced`: Jev's best-fit preference wins among capable
   candidates. Use `quality` for reliability/depth, `speed` for latency, and `economy`
   only when minimizing cost is explicitly the objective. Infer constraints from the
   user's request; never make a cheap-model quota the goal.
   Batch independent assignments in one request (up to eight); route dependent
   work after its prerequisites supply the needed context. Candidate descriptions
   explain capability, coordination cost and scope. Include only model/effort/agent
   parameters supported by the actual tool and permitted by this host. Supply
   `costRank` for every candidate when a defensible relative total-cost ordering is
   known (smaller is cheaper, including context transfer and verification). These
   are estimates, not dollar prices; omit unknown ranks rather than guessing from
   model names. Optional `latencyRank` is a separate relative latency estimate, not
   a token price or a measured SLA. Describe capability limits and previous failures explicitly. Preserve
   explicit user choices by excluding conflicting candidates.
3. Show the selected executor/model briefly, including a fallback or uncertainty.
   `selected` means capability is sufficient and the priority policy selected a
   candidate: best fit by default; lowest complete cost/latency rank only for explicit
   economy/speed respectively. Preference confidence
   can be low while capability is clear. Read `assessments` and `costBasis`.
   For `review-required`, inspect the specific capability uncertainty; reroute only
   with new evidence or use a demonstrably capable local fallback, disclosed as such.
   `no-fit` means no supplied capability fits; `needs-context` requires recovering
   the goal or inspecting candidate coverage. Ask only for a concrete missing input.
   `unavailable` means routing failed. Never end an actionable request with just
   routing status, invent an executor, or spawn a candidate not selected/permitted.
4. Execute the selected candidate: `current` continues here without changing this
   model; `subagent` uses the host's native delegation tool with the selected fields.
   Keep model and effort fixed while a subtask is executing. Give each worker its scope, context,
   expected output and checks. Parallel writers need nonoverlapping ownership or
   isolated workspaces. Track returned agent IDs and wait for actual results.
5. Verify the worker's patch with focused tests and inspection; do not redo its whole
   implementation with the frontier model. If validation fails, pass the observed
   failure to the same worker for a bounded correction when appropriate. Escalate
   on a demonstrated capability gap or repeated failure, with the patch and evidence;
   do not restart blindly. Keep model selection stable until that evidence changes.
   Integrate results, inspect changes and run appropriate checks. Report what completed,
   the models actually used, validation and unresolved work. Report usage/cost only
   when the host exposes it; a cheap selection is not proof of monetary savings. A successful route or
   zero process exit alone does not prove the user's task is complete.

Use an `external` candidate only when a separate installed coding CLI is needed,
the host permits it and the task can be handed off with explicit context. Execute
it through `action: "run"`; capture its output and exit status through the host's
process tool. It starts a separate noninteractive session, not a native subagent,
and does not inherit this conversation. Do not recursively launch the same CLI
when its environment rejects nested sessions, bypass permissions, or retry an
uncertain execution blindly. Prefer native delegation when available.

When only a model recommendation is requested, use `action: "route"` and stop
after reporting it. For execution without native model-selectable workers,
`action: "run"` routes and runs through the existing harness policy. If no callable
executor can apply a recommendation, state that limit rather than claiming a switch.

## Adaptive effort at observable boundaries

For a continuing task, route the next bounded phase using `task.step`: overall goal,
latest observation, and up to eight factual action/result summaries. Include the facts
needed by the next step, not just labels such as "analysis done". Supply
`previousCandidateId` when that configuration is still in the offered inventory.

When the host can apply effort to the same model, offer its supported effort levels
as distinct candidates before adding a different model. A difficult project can have
routine next steps: lower effort again after reasoning is resolved. Keep the model
when sufficiently capable; estimated cost must account for any new session/context
transfer. Continuity breaks equal-cost ties, never overrides insufficient capability.

Apply changes only at an actual host-supported turn/phase boundary. Do not interrupt
an active worker or claim a plugin controls internal tool-loop reasoning. `current`
still cannot change this conversation's model/effort. An external `run` starts a new
session; same model does not imply cache or history reuse. If overrides/resume are
unavailable, route a whole bounded subtask instead of spawning a process per tool.

Measure complete successful outcomes against a fixed-effort baseline, including
router calls, context, retries and verification. A failed cheap run is not savings.
This is an Ares-inspired Jev policy, not the paper's trained router or its benchmark.

## Host differences

- **Codex:** standalone `$jev`, packaged `$rutevi:jev`. A plugin/skill does not replace the running main model. Native
  subagent overrides depend on the exposed tool and its constraints; use only
  supported arguments. The separate executor is the alternative when appropriate.
- **Claude Code:** standalone `/jev`, or plugin `/rutevi:jev`. The Agent tool's
  available model choices govern candidates; do not invent a subagent effort field.
- **OpenCode:** `/jev <task>` already applies the primary model/variant before the
  turn. Reuse that decision; consult `assign` only for useful delegation. Discover
  callable subagents and their configured capabilities. Do not assume the Task tool
  can override a subagent model. `/jev auto`, `off`, `status` retain their existing meanings.

Open a separate interactive session only when the user requests it: `action: "open"`
uses Herdr. Never start a TUI inside an agent tool call. Rutevi's standalone TUI
remains available for managing separate tasks.
