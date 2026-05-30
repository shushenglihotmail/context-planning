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
# 1. Install once per machine
npm install -g context-planning

# 2. Install into your harness (any one), per repo OR globally
#    Per-repo (default): cd into the target repo first — cp walks up
#    from cwd to find .git / package.json and writes into .github/ |
#    .claude/ | .cursor/ | .aider/ in that repo only.
cd path/to/your/repo
cp install copilot      # GitHub Copilot CLI
cp install claude       # Claude Code
cp install cursor       # Cursor
cp install aider        # Aider

# Or target a specific repo from anywhere with --repo <path>
# (handy from a wrapper script or when you don't want to cd first):
cp install copilot --repo path/to/your/repo

# Add --global to wire the harness once at user-home scope instead
# of per-repo. Run from anywhere; files land under ~/.copilot,
# ~/.claude, ~/.cursor, ~/.aider. /cp-* commands then appear in
# every repo on this machine for that harness. Still per-harness —
# run once per harness you use.
cp install copilot --global
```

> **Two different "install" steps, easy to conflate:**
> - `npm i -g context-planning` puts the **`cp` binary** on your PATH.
>   Do this once per machine.
> - `cp install <harness>` wires that binary into a specific
>   **harness** (Copilot / Claude / Cursor / Aider) by writing the
>   slash-skill files it loads. Per-repo by default; per-user with
>   `--global`. Run it once per harness you actually use.

cp gives you **two ways to work**, depending on the shape of the work.
Pick the one that fits and skip the other — you don't need both.

### Path A — Project work (recurring, multi-milestone)

For real product/feature work where you want a roadmap, milestones,
phase history, and a long-lived `PROJECT.md`.

**A "project" in cp = one `.planning/` directory, not one git repo.**
You run `/cp-new-project` once **per project root** — that is, once
per directory you want to give its own `.planning/`. A monorepo
hosting three services means three independent `/cp-new-project`
runs, one in each service directory. See
[Multi-project repos](#multi-project-repos) for the layout and
the first-time anchoring rule.

#### Two one-time setup commands, not one

cp has two bootstrap commands that produce **different artifacts**:

|                          | `/cp-map-codebase`                                                                              | `/cp-new-project`                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Answers**              | *What does the existing code look like?*                                                        | *What do we want to build, and what's milestone 1?*                                                |
| **Writes**               | 7 reality docs in `.planning/codebase/` (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS) | `PROJECT.md` (intent) + first milestone in `ROADMAP.md`                                            |
| **How**                  | 4 parallel sub-agents scanning the source tree                                                  | Interactive brainstorm with you. Reads `.planning/codebase/*.md` if present, so PROJECT.md is grounded in real code. |
| **Auto-runs `cp init`?** | Yes (if `.planning/` is missing)                                                                | Yes (its first step)                                                                               |

This is the same split that **GSD** has — cp inherited it on purpose
so the two commands stay independently useful.

**So which do you run first?**

- **Greenfield** (empty repo / new subproject dir with no code yet) →
  just `/cp-new-project`. There's nothing to map.
- **Brownfield** (code already exists) → `/cp-map-codebase` **first**,
  then `/cp-new-project`. The brainstorm reads `.planning/codebase/*.md`
  automatically, so `PROJECT.md` and the first milestone are grounded
  in reality instead of guesses.
- **Trivial codebase** (<5 source files) → skip map, just
  `/cp-new-project`. Mapping an empty tree produces thin docs.

`/cp-map-codebase` is also useful **outside** the bootstrap, which is
why we keep it standalone:

- Refresh after a big refactor: `/cp-map-codebase --force`.
- Onboarding to an unfamiliar codebase you didn't write.
- Pre-refactor exploration (understand current state).
- Focused refresh of one slice:
  `/cp-map-codebase --fast --focus arch`.

#### The commands

```bash
cd path/to/project-root          # the dir that should own .planning/.
                                 # In a single-project repo this is
                                 # the repo root; in a monorepo it's
                                 # the subproject dir (e.g. services/api).

# Brownfield only — skip on greenfield:
/cp-map-codebase                 # 4 parallel agents → .planning/codebase/*.md
                                 # Also auto-runs `cp init` if needed.

# Both paths run this:
/cp-new-project                  # brainstorms PROJECT.md (grounds on
                                 # .planning/codebase/ if present) and
                                 # creates the first milestone.

# After bootstrap:
/cp-new-milestone "<goal>"       # for each later milestone
/cp-autonomous                   # drive the active milestone end-to-end
```

`/cp-new-project` is the **one-time intent setup per project root**.
`/cp-map-codebase` is the **one-time codebase-knowledge bootstrap**
(plus a refresh tool you can re-run anytime). After both, the rest
of the cp commands work against the `.planning/` they created,
anchored from whatever directory you run them in (see
[Multi-project repos](#multi-project-repos) for how anchoring works).

### Path B — One-shot tasks (no project required)

For ad-hoc work where you don't need a long-lived plan.

```bash
cd path/to/work-dir              # any dir, no project setup needed.
                                 # The quick task's artifacts will
                                 # live under <here>/.planning/quick/.

cp run quick "rename version flag"
# or, equivalently, in your harness:
/cp-quick rename version flag
```

`cp run quick` auto-creates `.planning/quick/<date-slug>/` for its
DESIGN.md + STATE.md + SUMMARY.md. It does **not** touch `PROJECT.md`,
does **not** require `/cp-new-project`, and works on any repo
(including one that's also a Path A project — they coexist).

### Sanity check

```bash
cp doctor             # resolved config, provider status, skill routing table
cp status             # current milestone / phase / next plan (Path A only)
cp workflow ls        # built-in + project workflow templates
```

### Multi-project repos

A "project" in cp = one `.planning/` directory. To run multiple
independent projects out of a single git repo, give each subproject
its own `.planning/`:

```
monorepo/
├── .git/
├── services/
│   ├── api/
│   │   └── .planning/        # project A
│   └── web/
│       └── .planning/        # project B
```

Project root is detected by walking up from `cwd` and using the **first
`.planning/` found**, falling back to `.git/` if none. So
`cd services/api && cp run …` anchors at `services/api/.planning/`
automatically.

> **First-time gotcha:** in a fresh subproject directory there's no
> `.planning/` yet to anchor on, so the walker will keep going up to
> `.git/` and use the **wrong** root. Before running `/cp-new-project`
> in a subproject for the first time, run `mkdir <subproject>/.planning`
> to anchor the lookup. After that, all cp commands run from inside
> the subproject behave correctly.

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

Every cp project has a `.planning/` directory with the file shape
below. `/cp-new-project` scaffolds it for you (and fills `PROJECT.md`
via the brainstorm skill); `cp run quick` auto-creates the `quick/`
subtree on demand. You never need to create these files by hand.

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
| `/cp-quick <task>`           | `cp run quick`                              | Small one-shot tasks. No project setup required.                     |
| `/cp-new-project`            | `cp init` + brainstorm + first milestone    | **One-time setup** per project: scaffolds `.planning/`, fills `PROJECT.md` with you, creates the first milestone + phase breakdown. |
| `/cp-new-milestone <goal>`   | `cp run milestone`                          | Start a new milestone (brainstorm → phase breakdown → lock ROADMAP). Requires a project (Path A). |
| `/cp-complete-milestone`     | `cp run complete-milestone`                 | Close out the active milestone.                                      |
| `/cp-plan-phase`             | planner for the active phase                | Write `phases/{NN-slug}/PLAN.md`.                                    |
| `/cp-execute-phase`          | `cp scaffold-phase --continue` + execution  | Drive the active phase (plan + execute).                             |
| `/cp-progress`               | `cp status` + nudge                         | "Where am I?"                                                        |
| `/cp-resume`                 | `cp run resume <slug>`                      | Pick up a paused workflow.                                           |
| `/cp-autonomous`             | drive all remaining phases sequentially     | Hands-off mode (use with care).                                      |
| `/cp-capture <text>`         | `cp capture`                                | Drop an idea into INBOX without disturbing flow.                     |
| `/cp-workflow-run <wf> <name>` | `cp run <wf>`                             | Run any workflow (built-in or project) in supervised mode.           |
| `/cp-workflow-{list,show,inspect,new,validate,brainstorm,export,import,customize,diagram,resume}` | the `cp workflow ...` family | Author and inspect workflows.    |
| `/cp-map-codebase`           | parallel scan into `.planning/codebase/`    | **Brownfield bootstrap.** Run this in any repo that already has code, *before* `/cp-new-project`, so the brainstorm grounds on real STACK / ARCHITECTURE / CONVENTIONS / etc. docs. Auto-runs `cp init` if `.planning/` is missing. Re-run with `--force` after major refactors. |
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

**Per-repo vs per-user.** By default, `cp install <harness>` writes
into the **current repo** (`.github/`, `.claude/`, `.cursor/`,
`.aider/`), so `/cp-*` commands only appear in that repo. You must
run it from inside the target repo — `cp` walks up from your cwd
looking for `.git` / `package.json`. Use `--repo <path>` to target
a specific repo from any cwd (handy in wrapper scripts or when you
don't want to cd first). Add `--global` to write into the user-home
scope (`~/.copilot/`, `~/.claude/`, `~/.cursor/`, `~/.aider/`)
instead — `/cp-*` commands then appear in every repo on this
machine for that harness. Still per-harness: run
`cp install <harness> --global` once for each harness you use.
`--global` and `--repo` are mutually exclusive.

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
cp install <harness>                  # install into copilot | claude | cursor | aider
                                      #   default: per-repo — run from inside the target repo
                                      #   (cp walks up to .git/package.json)
cp install <harness> --repo <path>    # per-repo install targeting <path> from any cwd
cp install <harness> --global         # install at user-home scope (~/.copilot, ~/.claude, ...)
                                      #   run from anywhere; mutually exclusive with --repo
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

### Plumbing

```bash
cp init                        # scaffold an EMPTY .planning/ (no content)
```

`cp init` is a low-level primitive. It writes empty template files
(`PROJECT.md`, `ROADMAP.md`, `STATE.md`, `MILESTONES.md`,
`config.json`) and exits — it does no brainstorming and no milestone
planning, so the project isn't actually usable until you fill those
files in. For interactive bootstrap that includes both the scaffold
and the content, use **`/cp-new-project`**. The only standalone use
case for `cp init` is repair / restore (it's idempotent, so re-running
it puts back any deleted templates).

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
