# Rutevi

Use **Jev** from Claude Code, Codex, or OpenCode to choose an executor for a task, delegate useful subtasks, and bring results back to your conversation. A terminal launcher remains available for work you want in separate sessions.

The host agent understands and divides the work; Jev chooses among callable executors; the host executes, integrates, and verifies. Your coding tool keeps control of tools and permissions.

## Why Rutevi?

A small edit and a difficult debugging task may need different models and reasoning effort. Rutevi saves you from choosing those settings for every task.

It sends your request to Jev, the routing model from TypeSafe, then applies your local routing policy. You can inspect the decision, override it, or open the task directly in your preferred coding tool. The policy is configurable; it is not a benchmark or a guarantee that one model is always best.

```text
Your conversation → concrete task → Jev → current agent / worker → verified result
Separate session → Rutevi TUI → Jev → Codex / OpenCode / Claude Code
```

## Install

You need:

- Node.js 22.12+, 24, or 26+.
- At least one coding CLI installed and signed in: `codex`, `opencode`, or `claude`.
- A TypeSafe API key for Jev.
- Optionally, Herdr to open tasks in separate tabs or split panes.

```sh
git clone https://github.com/alesanabriav7/Rutevi.git
cd Rutevi
npm ci
npm link

export TYPESAFE_API_KEY="your-typesafe-api-key"
```

Set the key in the environment where you start Rutevi or use its integrations. Each coding CLI uses its own existing provider authentication.

## Use the TUI

Run Rutevi from the project you want to work on:

```sh
cd /path/to/your/project
rutevi
```

1. Choose **Codex**, **OpenCode**, or **Claude** with **Tab** or a click. Codex is the default.
2. Write your task, such as “Add pagination and tests.”
3. Press **Enter**. Jev selects the model and Rutevi opens the coding tool with your task.

You do not need to type `/jev` in the Rutevi TUI.

| Control | Action |
| --- | --- |
| Tab / click | Choose the coding tool |
| Enter | Route and open the task |
| Ctrl+J / Alt+Enter | Insert a new line |
| ↑ / ↓ | Recall previous tasks |
| PgUp / PgDn | Scroll the task history |
| `/help`, `/status`, `/quit` | Help, current settings, or exit |
| Esc / Ctrl+C | Cancel pending routing, or exit when idle |

Start with a specific tool or skip the launcher screen:

```sh
rutevi --harness opencode
rutevi --harness claude
rutevi session --harness claude "Fix the failing checkout tests"
```

## Herdr integration

Herdr lets you keep Rutevi open while each task runs in its own native coding session. You can launch work in Codex, OpenCode, and Claude side by side, then return to Rutevi for the next task.

No separate Rutevi plugin is needed for Herdr. Have the `herdr` CLI available and start Rutevi **from a terminal inside Herdr**:

```sh
cd /path/to/your/project
rutevi
```

Rutevi detects the Herdr environment and opens a launcher tab in the same workspace. Submit a task and it opens a new tab with the selected coding tool, model, and project directory. Each task has its own session; unrelated task history is not sent to Jev.

| Control | Action |
| --- | --- |
| Ctrl+O | Choose a new tab, a right split, or a bottom split |
| Ctrl+G | Follow the new task or stay in Rutevi |

You can also choose the layout when starting the launcher:

```sh
# Open tasks to the right and keep focus in Rutevi.
rutevi --layout right --background

# Keep the launcher in this pane; open tasks below it.
rutevi --inline --layout down

# Skip the launcher screen and open a task in a new Herdr tab.
rutevi session --harness opencode "Improve the settings screen"
```

`--layout` controls where **tasks** open. `--inline`, when starting the TUI, controls where the **launcher** opens. With a direct task (`rutevi session --inline "..."`), it runs that task in the current terminal instead.

From a skill, explicitly ask to open a separate session to use this Herdr integration. The default `$jev` workflow now completes work in the current conversation; Herdr is not required.

Outside Herdr, Rutevi hands the current terminal to the selected coding tool. Layout and background options require Herdr. If a pane is too small to split, select a new tab instead.

## Use it from your coding tool

All integrations share one [Jev workflow](plugins/rutevi/skills/jev/SKILL.md).
Describe the task or refer to the plan you just discussed. The host prepares concrete
work, asks Jev to choose among executors it can actually call, and collects and verifies
results here. A small fix can stay with the current agent. Architecture may benefit
from independent research workers; multiple agents are not automatic.

| Tool | Local shortcut | Main model and delegation |
| --- | --- | --- |
| Codex | `$jev <task>` | Keeps the main model; selects callable native workers or a separate noninteractive executor |
| Claude Code | `/jev <task>` | Same workflow; native workers use the Agent tool's supported model choices |
| OpenCode | `/jev <task>` | Applies the primary model/variant to this message, then supports the shared delegation workflow |

### Quick local installation

After `npm ci` and `npm link`, run the desired installers from this checkout:

```sh
npm run install:codex
npm run install:claude
npm run install:opencode
```

These commands create symlinks and preserve existing files. Keep the checkout in place
and restart the coding tool with `rutevi` on PATH and `TYPESAFE_API_KEY` in its environment.
The Codex and Claude shortcuts install the shared skill; OpenCode installs a JavaScript
plugin that also supplies the workflow. These are local integrations, not marketplace installs.

```text
# Codex
$jev Fix duplicate submissions and verify the fix
$jev Implement the plan we just discussed; delegate independent parts when useful
$jev Recommend only: which model should design the new synchronization architecture?

# Claude Code or OpenCode
/jev Fix duplicate submissions and verify the fix
```

A skill cannot change the running Codex or Claude main model. It applies routing through
available workers instead, and reports a limitation if the host cannot execute the selection.
Native worker model/effort controls vary by host. An external `rutevi run` executor is a
separate session with explicit context, not a native subagent. It streams its result back
through the calling process tool; the coordinator must still integrate and verify it.

### Install as a packaged plugin

The repository includes a portable skills package in `plugins/rutevi`, with Codex and
Claude manifests and local marketplace catalogs. The package requires the Rutevi CLI
installed separately (`npm ci`, `npm link`) and the TypeSafe key in the host environment.
Choose packaged installation **or** the local skill shortcut for each host to avoid duplicates.

From this checkout, install in Codex:

```sh
codex plugin marketplace add .
codex plugin add rutevi@rutevi
```

Start a new Codex conversation and invoke `$rutevi:jev <task>` (or select it with `$`).
The standalone local shortcut remains `$jev`.

For Claude Code:

```sh
claude plugin marketplace add .
claude plugin install rutevi@rutevi
```

Restart Claude, then use `/rutevi:jev <task>`. Claude namespaces packaged plugin skills;
`/jev` is the standalone shortcut above. For a single development session:

```sh
claude --plugin-dir /absolute/path/to/Rutevi/plugins/rutevi
```

To move from the old local skill to packaged installation, first remove its owned links:
`node scripts/install-integrations.mjs codex --uninstall` (or `claude`). Removing links
preserves the sources. OpenCode uses its native JavaScript plugin, not either manifest.

### OpenCode controls

```text
/jev Fix the failing checkout tests
/jev auto
/jev status
/jev off
```

`/jev <task>` routes the primary message and loads the shared workflow. `auto` retains
lightweight primary-message routing for subsequent text messages; it does not repeatedly
inject the workflow. `off` respects the manual model selection. Auto is per session and
resets when the plugin/server restarts. The notification names the applied model even if
the manual picker displays its previous value. Turn auto off before sending attachments.
The launcher remains available without installing this plugin.

### Agent-facing JSON bridge

`rutevi invoke` reads JSON on stdin. No task text is interpolated into a shell command.

```sh
rutevi invoke <<'RUTEVI_REQUEST'
{
  "action": "route",
  "harness": "claude",
  "prompt": "Investigate the intermittent checkout test",
  "context": "The failure began after introducing concurrent requests."
}
RUTEVI_REQUEST
```

Actions: `route` recommends using the existing harness policy; `assign` selects among
host-provided candidates for up to eight concrete tasks in one Jev request; `run` executes
noninteractively; `open` explicitly opens Herdr. See the [request contract](plugins/rutevi/skills/jev/references/requests.md).
Since 0.9.0, `assign` batches candidate sufficiency checks with executor preference.
Since 0.12.0, default `balanced` prioritizes Jev task fit among capable candidates.
Explicit `economy` sorts complete cost ranks, `speed` sorts complete latency ranks,
and `quality` emphasizes reliability and depth. Missing estimates defer to Jev. It
preserves probabilities and capability assessments. The skill favors modest agentic
workers for ordinary work and escalates with failure evidence, keeping coordinator
work small. A tiny local edit can still be cheaper than launching a worker.
OpenCode defaults to `balanced`; `quality` remains an explicit override.
Run `npm run eval:assign` for live synthetic routing checks and `npm run smoke:assign`
for a real isolated coding task (both use live services). Routing share is not measured
monetary savings or evidence that 90% of tasks fit smaller models.

`assign` does not create agents. Its receipt proves a routing decision; the host must
execute and report the actual outcome. Missing candidates, uncertainty and service failures
are explicit and never silently create a worker.

## Useful commands

```sh
# See the routing decision without starting the task.
rutevi route "Explain the structure of this repository"

# Run a task without opening an interactive chat.
rutevi run "Fix the typo in the README"

# Open a native interactive session with an initial task.
rutevi chat --harness opencode "Investigate the failing build"

# Provide explicit context.
rutevi session --context-file ./summary.txt "Implement the proposed fix"

# Choose the model yourself and skip Jev.
rutevi session --harness claude --model sonnet --effort low "Fix the typo"

# Inspect the OpenCode candidates available in your local catalog.
rutevi models --harness opencode

# Check OpenCode catalog changes and policy review needs.
rutevi audit

rutevi --help
```

Use `--cwd /path/to/project` to target another directory. `router-jev` remains available as an alias for `rutevi`.

## Routing and context

Legacy Codex launch routing uses task categories; Codex direct and Claude routing use task-fit candidates. OpenCode selects from the configured candidates available in its local catalog and supports `--preference quality`, `balanced`, or `fast`.

Edit the policies in [src/router.js](src/router.js) for Codex, [src/claude.js](src/claude.js) for Claude, and [opencode-policy.json](opencode-policy.json) for OpenCode. Model access depends on your provider account. A routing failure uses the configured fallback and reports it; a failed task is not automatically retried on another model.

The launcher sends the task and any explicit context to TypeSafe. It does not automatically read your repository or previous conversations. The shared skill prepares relevant context and callable candidate metadata; the OpenCode primary router includes up to eight recent messages, capped at 12,000 characters. Assignment requests contain explicit task/context text and a whitelist of candidate fields, not tool schemas or credentials. Text is not automatically redacted; the host should include only task-relevant information. Rutevi removes the TypeSafe key from the coding processes it launches. The standalone OpenCode plugin needs that key to route messages inside its own process.

## Development

```sh
npm run quality       # Oxlint, strict TypeScript, Vitest + fast-check, Knip 6.
npm run quality:full  # All checks, plus Stryker mutation testing.
npm run test:watch    # Run tests while editing.
```

TypeScript checks `src/` through JSDoc with `strict`, `checkJs`, and `noEmit`; no build step is required. Unit tests use local fixtures rather than live models. Stryker's initial minimum score is 50%, with reports in `reports/mutation/`. GitHub Actions runs both quality and mutation checks.

Validated locally for 0.8.0: offline routing/bridge/installation tests, plugin manifest
validation, isolated marketplace installs, live Jev assignments, a read-only Codex
executor and an OpenCode `/jev` response with the shared workflow persisted.
Claude installation passed; inference could not be tested because its CLI reported
`Not logged in`. These checks are not a model-quality benchmark or proof of completed
multi-agent work across all three hosts.

For more detail, see the [integration reference](INTEGRATIONS.md), [model policy review](MODEL-REVIEW.md), and [model audit guide](tasks/audit-models.md). These supporting documents are currently in Spanish.

### Adaptive phase routing (0.10.0)

Inspired by [Ares](https://arxiv.org/html/2603.07915v1), `assign` now accepts
`task.step` with goal, current observation and bounded factual history. It judges the
next phase instead of assigning the entire project's difficulty to every action.
Offer supported effort levels of the same model as distinct candidates; it can raise
and lower effort as evidence changes. Equal-cost eligible choices favor model
continuity. Actual session/cache reuse depends on the host, not the candidate name.

`npm run eval:effort` checks prerecorded low → high → low routing over three trials.
`npm run smoke:effort` applies selected efforts to a single Codex App Server thread
and compares a separate fixed-high synthetic run, recording raw usage in artifacts.
These are integration checks, not the paper's trained router, quality benchmark or
proof of billed savings. Native plugins cannot intercept every internal reasoning step.

### Jev-only routing before inference (0.11.0)

```sh
rutevi direct --cwd /path/to/project
rutevi direct --session THREAD_ID
```

This lightweight Codex conversation reads the native model catalog, filters the
configured candidates in `codex-direct-policy.json`, extracts recent text in code,
and asks Jev before each `turn/start`. No generative model analyzes the task or
constructs the inventory first. The chosen model performs the actual task in the same
thread. Relative cost ranks are policy estimates, not prices learned from the catalog.
Type `/quit` to close. `--sandbox` is optional; native configuration is otherwise
inherited. Interactive server approvals/tools that require client-side handling are
not implemented by this minimal client; it never auto-approves those requests.

For automation, `rutevi direct --json` accepts one `{"prompt":"..."}` object per
line and streams `ready`, `route`, `text`, and `result` JSON events. A routing failure
or missing suitable candidate produces `not-executed`, with no executor invocation.
No expensive implicit fallback is launched. A failed/uncertain execution is not retried.

OpenCode `/jev <task>` also routes before inference. It now passes only the original
task, without injecting the orchestration skill or asking a model to route again.
Catalog errors, no-fit and service fallbacks stop the request before inference.
Control commands (`auto`, `off`, `status`) retain their existing display behavior.
Codex `$rutevi:jev` and Claude `/rutevi:jev` remain in-model skills; they cannot remove
the initial model turn. Claude's `rutevi run --harness claude` routes before launching
its executor but starts a new session.

### Task-fit evaluation (0.12.0)

`npm run eval:task-fit` runs 16 prerecorded cases three times, reversing/rotating
candidate order: 48 live Jev decisions. Expected families were defined before the run.
Codex covers Luna for latency, Terra for coordinated implementation, and Astra for
hard reasoning. Claude covers Haiku, Sonnet, Opus and Fable, including urgent tasks
that still need frontier reasoning. Missing goals must not select a worker.

Profiles: `codex-direct-policy.json` and `claude-policy.json`. Codex candidates are
filtered against native model/effort availability. Claude profiles use documented
aliases; local account access is not implied. Current Claude authentication is absent.
These tests validate routing policy, not measured superiority on executed tasks.
Report: `artifacts/task-fit-eval.json`; inputs: `test/fixtures/task-fit.json`.

Use `rutevi direct --preference quality` or `--preference fast` (`speed` alias).
`economy` explicitly requests lowest sufficient estimated cost. Claude CLI routing
accepts the same preferences. Natural-language task constraints also inform Jev.

### Executed-task value benchmark

[Methodology](benchmarks/README.md) · [First measured pilot](benchmarks/2026-09-21-pilot.md).

```sh
npm run bench:value                   # 3 tasks × 3 strategies = 9 real executions
BENCH_REPEATS=3 npm run bench:value    # 27 executions; real model usage
node scripts/benchmark-summary.mjs artifacts/value-benchmark/*/results.json
```

Requires Codex authentication and `TYPESAFE_API_KEY`. Compares fixed Luna medium,
fixed Astra high, and Jev choosing from the actual Codex catalog and direct policy.
The same prompts ask agents to edit real files in isolated temporary workspaces;
hidden deterministic checks validate the resulting code. Tasks cover an urgent
small fix, interval implementation, and a correctness-sensitive transfer ledger.
Each task has an explicit priority shared by all strategies. Models are never told
which model should win. No generative model prepares Jev's request.

Results persist after every attempt in `artifacts/value-benchmark/<timestamp>/`:
`manifest.json`, `results.json` (code, answers, checks, raw routing and usage), and
`report.md`. Failures count, retries are disabled, and each executor has a 120-second
deadline. Strategy order rotates by task/repetition to reduce order bias. Runs use
fresh threads, but provider caching is not controlled. Compare matching suite,
policy and harness hashes; keep all repetitions rather than selecting winners.
The summary command combines compatible runs, rejects duplicates or changed
configurations, and retains failed-attempt time and unknown token measurements.

Success rate and end-to-end latency are primary. The report separates input,
cached input and output tokens; Jev usage is retained separately. These are resource
measurements, **not billed savings**. This small synthetic pilot cannot establish
production quality, architecture capability, a 90% routing target or Claude/OpenCode
performance. Add representative repository tasks before generalizing its results.
