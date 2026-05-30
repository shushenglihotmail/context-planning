# context-planning (`cp`)

> **A fully customizable workflow + context-management system for AI coding agents.**
> Define repeatable phase DAGs in YAML, run them with `cp run`, keep all the
> long-lived state on disk where every agent (and every human) can read it.
> Harness-agnostic. Provider-pluggable. Self-contained — works with zero
> external dependencies via the built-in `manual` fallback.

[![npm](https://img.shields.io/npm/v/context-planning.svg)](https://www.npmjs.com/package/context-planning)
[![tests](https://img.shields.io/badge/tests-87%20files-brightgreen.svg)](#testing)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

---

## What is cp?

`cp` (CLI: `cp` or `cplan`) is two cleanly-separated things in one small npm
package:

1. **A YAML workflow engine.** You describe a piece of work as a DAG of
   phases — each with a role, a skill routing key, a prompt, and
   dependencies — and `cp run` walks that DAG one wave at a time,
   printing a machine-readable invocation contract your agent harness
   picks up.
2. **A file-based state layer.** Long-lived planning artefacts live in
   `.planning/` as plain Markdown: `PROJECT.md`, `ROADMAP.md`,
   `STATE.md`, `MILESTONES.md`, per-phase directories with `PLAN.md` +
   `SUMMARY.md`, per-run directories under `.planning/runs/`, etc. No
   database. Round-trips with `git`.

These two pillars sit behind a thin CLI surface (`cp run`, `cp workflow
...`, `cp status`, `cp audit`, ...) and a small set of slash-skill
shims that drop into whatever harness you use (GitHub Copilot CLI,
Claude Code, Cursor, Aider).

### What changed

Earlier versions of cp described it as *"GSD's brain, Superpowers'
hands"* — a thin state layer that delegated all the "doing" to an
external workflow provider. That framing is no longer accurate.

As of **v1.x**, the workflow engine is first-class. You can:

- Author and run your own YAML workflows entirely in-project
  (`.planning/workflows/*.yaml`).
- Compose reusable phase templates (`.planning/phase-templates/`) and
  whole workflow templates (`.planning/workflow-templates/`).
- Fan out a single phase into N parallel children (waves).
- Run any workflow with **zero external provider** via the built-in
  `manual` skill set — every role resolves to a `cp:manual/<name>`
  inline prompt.

cp still inherits its file shape from
[get-shit-done (GSD)](https://github.com/gsd-build/get-shit-done) and
still ships a `superpowers` provider so it works seamlessly with
[Jesse Vincent's Superpowers](https://github.com/obra/superpowers).
But those are **integration contracts**, not identity claims. cp is now
its own thing.

---

## Quick start

```bash
# 1. Install
npm install -g context-planning

# 2. Install into your harness (any one)
cp install copilot      # GitHub Copilot CLI
cp install claude       # Claude Code
cp install cursor       # Cursor
cp install aider        # Aider

# 3. Scaffold a project
cd your-repo
cp init

# 4. Run something
cp run quick "rename-version-flag"

# 5. Or invoke via slash-skill in your harness
/cp-quick rename version flag
```

### Sanity check

```bash
cp doctor             # resolved config, provider status, skill routing table
cp status             # "you are here": current milestone, phase, next plan
cp workflow ls        # built-in + project workflow templates
```

---

## Workflows

The workflow engine is the heart of cp. A workflow is a YAML file that
describes a piece of work as a DAG of phases. Each phase declares:

- **who** does the work (`role:` — a persona like `planner`, `reviewer`)
- **how** they do it (`skill:` — a routing key the active provider
  resolves to a real skill; falls back to `cp:manual/<role>`)
- **what** to do (`prompt:` — the instructions handed to that skill)
- **what comes first** (`depends_on:` / `after:` — wave scheduling)

You hand the workflow file to `cp run <workflow-name>` and the engine
walks the phase DAG one wave at a time. Each wave prints an
**invocation contract** — a machine-readable block your agent harness
(or you) reads, dispatches the named skill, and advances with
`cp run mark-complete <slug> <phase-id>`.

### Built-in templates

```
$ cp workflow ls
name                source    binds_to
------------------  --------  ---------
complete-milestone  built-in  quick
debug               built-in  quick
dev                 built-in  milestone
docs                built-in  quick
milestone           built-in  milestone
quick               built-in  quick
```

| Template             | Binds to    | Use for                                                                  |
| -------------------- | ----------- | ------------------------------------------------------------------------ |
| `quick`              | quick task  | Single-shot small tasks: design → execute → finalize.                    |
| `dev`                | milestone   | Multi-feature build-out: plan fans out into per-feature execute waves.   |
| `debug`              | quick task  | Reproduce → diagnose → fix → verify, with hypothesis discipline.         |
| `docs`               | quick task  | Inventory docs → write in parallel → overall review → publish.           |
| `milestone`          | milestone   | Brainstorm a new milestone, break into phases, lock the roadmap.         |
| `complete-milestone` | quick task  | Verify, aggregate digest, archive, reset STATE.                          |

Inspect any of them:

```bash
cp workflow show docs        # print the YAML body
cp workflow inspect docs     # YAML + deduced wave-by-wave execution
cp workflow diagram docs     # Mermaid flowchart of the phase DAG
```

### Run your own

```bash
cp workflow new triage --from quick     # seed from a built-in
$EDITOR .planning/workflows/triage.yaml  # tweak roles, prompts, deps
cp workflow validate triage             # schema + DAG checks
cp workflow inspect triage              # see wave grouping
cp run triage "first-pass"              # start a run
cp run mark-complete <slug> <phase>     # advance after each wave
cp run resume <slug>                    # pick up where you left off
```

Project templates at `.planning/workflows/*.yaml` **shadow** built-ins
with the same name, so you can fork and own any built-in. Round-trip
customization is `cp workflow export <name>` → edit → `cp workflow
import <file>`.

### Key features

- **Supervised mode** (`supervised: true`, default for every built-in):
  the engine prints one wave at a time and exits. You stay in the loop
  and `mark-complete` each phase yourself — auditable, resumable, no
  runaway agents.
- **Fan-out** (`max_children:` / `min_children:`): a parent phase can
  emit N child instances. With `optimizable: true` + declared
  `depends_on:` per item, children with no inter-dependencies run as a
  parallel wave.
- **Reusable templates**: hoist common phases into
  `templates/phase-templates/<id>.yaml` (or
  `.planning/phase-templates/<id>.yaml`) and reference them via
  `template: <id>` with `with: { ... }` for parameter overrides. Whole
  workflows compose the same way under `workflow-templates/`.
- **Auto-injected finalize**: every `cp run` ends in a clean state.
  If you don't declare a finalize phase, the engine injects
  `cp <binds_to>-finalize`.
- **Drift defence**: `cp audit`, `cp reconcile`, `cp supersede`,
  `cp deviate` keep `.planning/` honest as humans hand-edit files
  alongside the agent.

### Full workflow documentation

The canonical schema, recipes, and walkthroughs live under
[`docs/workflow/`](./docs/workflow/):

- **[Quickstart](./docs/workflow/quickstart.md)** — ~10-minute
  end-to-end walkthrough writing a `triage` workflow.
- **[Reference](./docs/workflow/reference.md)** — every top-level and
  per-phase field, validation rules, runtime semantics, CLI flags,
  exit codes, the v1.6 invocation contract line by line.
- **[Recipes](./docs/workflow/recipes.md)** — worked patterns:
  fan-out, parallel-with-dependencies, parameterised workflows,
  template inclusions, mixed scaffold + skill phases.

---

## The state layer

`cp init` scaffolds `.planning/` with the file shape every cp command
reads and writes:

```
.planning/
├── PROJECT.md           # one-page "what this project is"
├── ROADMAP.md           # active milestone + phase tree (single source of truth)
├── STATE.md             # tiny "you are here" pointer (regenerated)
├── MILESTONES.md        # completed milestones archive
├── MILESTONE-CONTEXT.md # scratchpad for the active milestone
├── INBOX.md             # captured ideas awaiting triage
├── REVIEW-LOG.md        # external review notes
├── config.json          # resolved settings (provider, harness, behavior)
├── codebase/            # static codebase intel (STACK, ARCHITECTURE, ...)
├── phases/{NN-slug}/    # per-phase: PLAN.md + SUMMARY.md + {NN-MM-SUMMARY.md}
├── quick/{YYYY-MM-DD-slug}/  # per-quick-task: DESIGN.md + STATE.md + SUMMARY.md
├── runs/{workflow}/{slug}/   # per-run state (workflow supervisor)
├── workflows/           # project-local workflow YAMLs (shadow built-ins)
├── workflow-templates/  # project-local reusable workflow templates
└── phase-templates/     # project-local reusable phase templates
```

All files are plain Markdown with deterministic structure — every cp
command (and every other tool you point at this folder) can parse and
update them. Git-friendly. No lock files. No database.

### Aggregator commands

| Command                          | What it does                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `cp status`                      | Active milestone, current phase, next plan, recent activity. JSON via `--json`.       |
| `cp statusline`                  | One-line prompt-friendly string (PS1 / Starship / tmux).                              |
| `cp state regen`                 | Re-derive `STATE.md` from `ROADMAP.md` + phase tree (run after pulling colleagues' commits). |
| `cp tick <plan-id>`              | Mark a plan done in ROADMAP + PLAN.md. Idempotent.                                    |
| `cp write-summary <plan-id>`     | Write `{NN-MM}-SUMMARY.md` with validated frontmatter (snake_case → kebab-case).      |
| `cp scaffold-milestone <name>`   | Add milestone heading to ROADMAP.                                                     |
| `cp scaffold-phase N --name X`   | Add phase to ROADMAP + create `phases/{NN-slug}/PLAN.md`.                             |
| `cp complete-milestone`          | Verify, aggregate digest, archive, reset STATE. Gated by `cp audit`.                  |
| `cp capture <text>`              | Append to `INBOX.md` with timestamp.                                                  |
| `cp inbox [--tick N]`            | List / triage inbox items.                                                            |

### Drift defence

When humans and agents both edit `.planning/`, drift is inevitable.
cp ships a four-verb playbook for keeping it honest:

| Command                                 | What it does                                                  |
| --------------------------------------- | ------------------------------------------------------------- |
| `cp audit [--strict] [--json]`          | Read-only sweep. Reports findings with severity + fix.        |
| `cp audit --fix [--max N]`              | Classify + auto-fix loop. One atomic commit per fix.          |
| `cp reconcile <phase\|--all\|--phase R>` | Repair drift: infer missing commit SHAs, accept summary updates. |
| `cp supersede <planId> --by <newId>`    | Mark a plan superseded; rewrite history honestly.             |
| `cp deviate <phase> --summary <text>`   | Append a dated deviation block to the phase PLAN.md.          |

Details: [`docs/drift-playbook.md`](./docs/drift-playbook.md).

---

## Slash skills

cp installs a set of slash skills into your harness so workflows feel
native. The workhorse skills are all thin wrappers over the workflow
engine (each one runs a built-in YAML in supervised mode):

| Slash skill                  | Wraps                                       | When to use                                                          |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `/cp-quick <task>`           | `cp run quick`                              | Small one-shot tasks.                                                |
| `/cp-new-project`            | bootstrap a new cp project                  | First-time setup: PROJECT.md + initial ROADMAP.                      |
| `/cp-new-milestone <goal>`   | `cp run milestone`                          | Start a new milestone (brainstorm → phase breakdown → lock ROADMAP). |
| `/cp-complete-milestone`     | `cp run complete-milestone`                 | Close out the active milestone.                                      |
| `/cp-plan-phase`             | planner for the active phase                | Write `phases/{NN-slug}/PLAN.md`.                                    |
| `/cp-execute-phase`          | `cp scaffold-phase --continue` + execution  | Drive the active phase (plan + execute).                             |
| `/cp-progress`               | `cp status` + nudge                         | "Where am I?"                                                        |
| `/cp-resume`                 | `cp run resume <slug>`                      | Pick up a paused workflow.                                           |
| `/cp-autonomous`             | drive all remaining phases sequentially     | Hands-off mode (use with care).                                      |
| `/cp-capture <text>`         | `cp capture`                                | Drop an idea into INBOX without disturbing flow.                     |
| `/cp-workflow-run <wf> <name>` | `cp run <wf>`                             | Run any workflow (built-in or project) in supervised mode.           |
| `/cp-workflow-{list,show,inspect,new,validate,brainstorm,export,import,customize,diagram,resume}` | the `cp workflow ...` family | Author and inspect workflows.    |
| `/cp-map-codebase`           | parallel scan into `.planning/codebase/`    | Bootstrap codebase intel docs.                                       |
| `/cp-write-summary <plan-id>` | `cp write-summary`                         | Write a per-plan summary with validated frontmatter.                 |
| `/cp-update`                 | `cp update`                                 | Refresh per-repo state after a cp version bump.                      |

Full list: see [`.github/skills/`](./.github/skills/) (each skill is a
single `SKILL.md` file; the same files are installed into Claude Code
and Cursor with the appropriate front-matter).

---

## Providers

A **provider** in cp is a routing table for skill names. When a
workflow phase says `skill: plan`, the engine asks the active provider
"what real skill does `plan` map to?" and emits that path in the
invocation contract.

cp ships three providers out of the box:

| Provider      | Resolves `plan` to             | When to use                                       |
| ------------- | ------------------------------ | ------------------------------------------------- |
| `superpowers` | `writing-plans` (Superpowers)  | You have Jesse Vincent's Superpowers installed.   |
| `echo-provider` | `echo` (no-op)                | Schema testing / dry runs.                        |
| `manual`      | `cp:manual/plan` (inline prompt) | **Default fallback.** Zero external dependencies. |

The `manual` provider is the key. Every role has a built-in inline
prompt (see `templates/config.json:cp.providers.manual.prompts`), so
**cp runs without any external workflow provider**. Install Superpowers
to upgrade those prompts to full skills; otherwise the inline
fallbacks do the job.

Write your own: drop a `providers.<name>` block into
`.planning/config.json` mapping the canonical roles (`brainstorm`,
`plan`, `execute`, `review`, `finish`, `worktree`, `tdd`, `debug`,
`verify`, ...) to skill paths in your plugin. See
[`docs/writing-providers.md`](./docs/writing-providers.md).

---

## Harnesses

cp is harness-agnostic. The CLI is the source of truth; each harness
installer writes the appropriate slash-skill shims that shell out to
`cp`.

| Harness          | Install                | Slash invocation             | Notes                                                       |
| ---------------- | ---------------------- | ---------------------------- | ----------------------------------------------------------- |
| GitHub Copilot CLI | `cp install copilot` | `/cp-quick ...`              | Writes `.github/skills/cp-<name>/SKILL.md`.                 |
| Claude Code      | `cp install claude`    | `/cp-quick ...`              | Writes `~/.claude/skills/cp-<name>/` or repo-local.         |
| Cursor           | `cp install cursor`    | `@cp-quick ...` in chat      | Writes `.cursor/rules/cp-<name>.mdc` + an ambient rule.     |
| Aider            | `cp install aider`     | natural language             | Writes `.aider/cp-commands/<name>.md`; patches `.aider.conf.yml`. |

`cp install --hooks` also installs cp git hooks (pre-commit drift
check, post-commit tick). `cp install --ci` installs a GitHub Actions
audit workflow.

---

## GSD compatibility

cp's file shape is a drop-in superset of
[get-shit-done (GSD)](https://github.com/gsd-build/get-shit-done) —
same `.planning/` filenames, same frontmatter conventions, same
`config.json` keys (cp adds a `cp.*` namespace that GSD ignores).

```bash
cp gsd-import                  # read-only audit of a GSD project
cp gsd-import --apply          # plus `cp init` (no destructive edits)
```

Either tool can read the other's files. cp adds the workflow engine,
the drift-defence verbs, the harness installers, and the run/quick
directories on top.

---

## CLI reference

```bash
cp init                        # scaffold .planning/
cp install <harness>           # install into copilot | claude | cursor | aider
cp install --hooks             # install git hooks
cp install --ci                # install GitHub Actions audit workflow
cp install --uninstall-hooks   # remove cp-owned hooks

cp doctor                      # resolved config + provider + skill routing
cp status                      # current milestone / phase / next plan
cp statusline                  # one-line prompt-friendly status
cp gsd-import [--apply]        # audit / import a GSD project

cp workflow ls                 # list built-in + project workflows
cp workflow show <name>        # print workflow YAML
cp workflow inspect <name>     # YAML + deduced wave grouping
cp workflow diagram <name>     # Mermaid flowchart
cp workflow validate <name>    # schema + DAG checks
cp workflow new <name> [--from <built-in>]   # scaffold a project workflow
cp workflow export <name>      # dump a built-in for editing
cp workflow import <file>      # validate + copy to .planning/workflows/
cp workflow brainstorm --workflow <name>     # provider-assisted design

cp run <workflow> <run-name>   # start a workflow run
cp run mark-complete <slug> <phase-id> [--summary file]
cp run resume <slug>           # resume a paused run
cp run abandon <slug>          # abandon a run

cp scaffold-milestone <name> [--planned]
cp scaffold-phase <N> --name <name> [--plans N] [--continue]
cp scaffold-codebase
cp complete-milestone [<name>] [--audit-warn]

cp tick <plan-id> [--undo]
cp write-summary <plan-id> --from <json> [--body <md>]
cp state regen

cp audit [--strict] [--fix] [--max N]
cp reconcile <phase> | --all | --phase <range>
cp supersede <planId> --by <newId> --reason <text>
cp deviate <phase> --summary <text>

cp capture <text>
cp inbox [--tick N] [--note <dest>]
cp codebase-status

cp worktree create <name> [--phase N]
cp worktree list
cp worktree remove <slug>

cp update [--check]            # refresh per-repo cp state after a version bump
cp version
cp help
```

Every command supports `--json` where output structure matters. See
`cp help` or `cp <subcommand> --help` for the full flag set.

---

## Architecture

For the internals — workflow engine, state layer, provider routing,
runtime model — see [`docs/architecture.md`](./docs/architecture.md).

Highlights:

- **Workflow engine** (`lib/workflow*.js`, `lib/runtime*.js`,
  `lib/supervisor.js`): template loading, expansion, validation
  (DAG + token whitelist), wave/topo computation, supervised vs.
  unsupervised runs, fan-out runtime, auto-injected finalize, role↔skill
  routing.
- **State layer** (`lib/milestone.js`, `lib/state.js`, `lib/run-lifecycle.js`,
  `lib/quick-helpers.js`, `lib/persist.js`): file-level
  read/write/aggregation primitives, atomic commits, frontmatter
  validation.
- **Drift defence** (`lib/audit*.js`, `lib/reconcile.js`,
  `lib/supersede-deviate.js`, `lib/hooks.js`): detect → classify →
  fix → block (git hook) loop.
- **Provider routing** (`lib/provider.js`): resolves `role:`/`skill:`
  via `config.json:cp.providers` with `manual` as a guaranteed
  fallback.

---

## Testing

```bash
npm test         # 87 test files; ~1.5 minutes
npm run coverage # local HTML coverage
```

The test suite covers schema validation, lifecycle transitions,
fan-out runtime, supervisor flow, drift detection, harness
installers, the workflow CLI, the run CLI, and full integration
walkthroughs of each built-in workflow.

---

## Status

cp is on **v1.7**. Stable enough to dogfood; the workflow engine,
state layer, and drift-defence verbs are all considered API surfaces.
Breaking changes will be called out in [`CHANGELOG.md`](./CHANGELOG.md)
and each major release ships migration notes under `docs/MIGRATION-*.md`.

See `CHANGELOG.md` for the version-by-version story; per-version
migration notes (e.g. `docs/MIGRATION-v0.5.md`) cover what changed
and how to adopt it.

---

## Credits

- File shape and state-management patterns inherited from
  [get-shit-done](https://github.com/gsd-build/get-shit-done) by TÂCHES.
- The default `superpowers` provider is designed around
  [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent —
  install it and cp's workflows light up with full agentic skills.

## License

MIT.
