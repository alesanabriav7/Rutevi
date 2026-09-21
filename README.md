# Rutevi

Describe a task, choose Codex, OpenCode, or Claude Code, and let **Jev** choose the model before the task starts.

Rutevi is a terminal launcher. Your chosen coding tool still handles the conversation, tools, permissions, and work.

## Why Rutevi?

A small edit and a difficult debugging task may need different models and reasoning effort. Rutevi saves you from choosing those settings for every task.

It sends your request to Jev, the routing model from TypeSafe, then applies your local routing policy. You can inspect the decision, override it, or open the task directly in your preferred coding tool. The policy is configurable; it is not a benchmark or a guarantee that one model is always best.

```text
Your task → Jev → model selection → Codex / OpenCode / Claude Code
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

The Codex `$jev` skill uses this same integration to open a routed task in a new Herdr tab. It leaves the original Codex conversation in place.

Outside Herdr, Rutevi hands the current terminal to the selected coding tool. Layout and background options require Herdr. If a pane is too small to split, select a new tab instead.

## Use it from your coding tool

| Tool | Integration | What it does |
| --- | --- | --- |
| Codex | `$jev` skill | Routes a task and opens a new session in Herdr |
| OpenCode | `/jev` plugin | Selects the model for a message in the current chat |
| Claude Code | Rutevi launcher | Opens Claude with the selected model and effort; no standalone Claude plugin yet |

Run the installation commands below from the cloned Rutevi directory. They create symlinks, so keep that directory in place.

### Codex: install the skill

```sh
npm run install:codex
```

In Codex, invoke:

```text
$jev Add pagination to the API and test it
$jev Use Claude to investigate the checkout failure
```

The skill uses your task and a relevant context summary to select a model, then opens a **new Herdr tab**. It does not change the model of the Codex session that received the request. Launching from the skill requires Codex to be running inside Herdr.

Ask explicitly for “recommend only” if you want a selection without opening a task. `/prompts:jev <task>` is also installed as a compatibility shortcut.

### OpenCode: install the plugin

```sh
npm run install:opencode
```

Restart OpenCode with `TYPESAFE_API_KEY` available in its environment, then use:

```text
/jev Fix the failing checkout tests
/jev auto
/jev status
/jev off
```

`/jev <task>` routes one message. `auto` routes subsequent text messages in that session; `off` returns to your manual model selection. Automatic routing starts off and resets when the plugin/server restarts.

The plugin uses recent text from the current chat as context. Its notification shows the selected model, even if the manual model selector still displays its previous value. Turn automatic routing off before sending attachments.

The plugin is optional: `rutevi --harness opencode` can launch OpenCode without installing it.

### Claude Code: use the launcher

```sh
rutevi --harness claude
rutevi session --harness claude "Investigate this intermittent test failure"
```

Rutevi chooses a model and reasoning effort before opening Claude's native terminal interface. Claude keeps its own authentication, configuration, and approval flow. Subsequent messages stay in Claude; Rutevi does not route every turn.

There is no `install:claude` command or Claude `/jev` plugin in this repository.

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

Codex and Claude use task categories to select a model and effort. OpenCode selects from the configured candidates available in its local catalog and supports `--preference quality`, `balanced`, or `fast`.

Edit the policies in [src/router.js](src/router.js) for Codex, [src/claude.js](src/claude.js) for Claude, and [opencode-policy.json](opencode-policy.json) for OpenCode. Model access depends on your provider account. A routing failure uses the configured fallback and reports it; a failed task is not automatically retried on another model.

The launcher sends the task and any explicit context to TypeSafe. It does not automatically read your repository or previous conversations. The Codex skill adds a relevant summary; the OpenCode plugin includes up to eight recent messages, capped at 12,000 characters. Rutevi removes the TypeSafe key from the coding processes it launches. The standalone OpenCode plugin needs that key to route messages inside its own process.

## Development

```sh
npm run quality       # Oxlint, strict TypeScript, Vitest + fast-check, Knip 6.
npm run quality:full  # All checks, plus Stryker mutation testing.
npm run test:watch    # Run tests while editing.
```

TypeScript checks `src/` through JSDoc with `strict`, `checkJs`, and `noEmit`; no build step is required. Unit tests use local fixtures rather than live models. Stryker's initial minimum score is 50%, with reports in `reports/mutation/`. GitHub Actions runs both quality and mutation checks.

For more detail, see the [integration reference](INTEGRATIONS.md), [model policy review](MODEL-REVIEW.md), and [model audit guide](tasks/audit-models.md). These supporting documents are currently in Spanish.
