# context-planning (`cplan` / `cp`)

> **GSD's brain. Superpowers' hands.**
> A lightweight, harness-agnostic plugin that keeps long-lived AI development
> work — milestones, phases, plans, summaries — coherent across sessions, while
> handing the actual "how do I write this code" workflow to whatever
> coding-agent skill set you already use.

[![npm](https://img.shields.io/npm/v/context-planning?color=brightgreen)](https://www.npmjs.com/package/context-planning)
[![ci](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml/badge.svg)](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-2100%2B%20passing-brightgreen)]()
[![node](https://img.shields.io/badge/node-%E2%89%A518-blue)]()
[![license](https://img.shields.io/badge/license-MIT-blue)]()

> **CLI binary names:** as of v0.6 the canonical command is **`cplan`**.
> The original short name **`cp`** still works on every platform.
> PowerShell users — Windows ships `cp` as an alias for `Copy-Item`, so
> bare `cp` may not resolve to our binary unless you `Remove-Alias cp`.
> Use `cplan` to avoid the clash entirely. Examples below show both.

---

## TL;DR

```text
You      ──▶  /cp-new-milestone "v0.2 Auth"   (state layer: cp)
              ├─▶ /cp-plan-phase 1            (workflow: superpowers/brainstorming + writing-plans)
              ├─▶ /cp-execute-phase 1         (workflow: superpowers/subagent-driven-development)
              └─▶ /cp-complete-milestone      (state layer: cp aggregates, archives, resets)
```

`cp` owns the *project state docs* in `.planning/` (PROJECT.md / ROADMAP.md /
STATE.md / phase dirs / MILESTONES.md). It delegates the *workflow* — how to
brainstorm, plan, code, review, test — to a configurable provider, defaulting
to **[Superpowers](https://github.com/obra/superpowers)**. Falls back to a
built-in `manual` provider if Superpowers isn't installed.

## Why?

| Pain | Existing tool | What `cp` does |
|---|---|---|
| **GSD** has great stateful context management but its workflow pipeline is heavy (60+ commands, 30+ subagents, multi-stage gates). | [get-shit-done](https://github.com/gsd-build/get-shit-done) | Keeps GSD's `.planning/` shapes; throws away everything else. |
| **Superpowers** has a fast brainstorm → plan → TDD-execute → review → ship loop but doesn't track multi-week project state. | [obra/superpowers](https://github.com/obra/superpowers) | Stitches in superpowers skills as the workflow engine, called by *role*, not by name. |
| Restarting an LLM session loses everything you were working on. | — | Reads `STATE.md` + `.continue-here.md` → `/cp-resume` picks up exactly where you were. |

**Net result:** ~8 commands, the markdown state docs you already love, and
every "do the work" step hands off to whatever skill set you have installed.

## Choose your starting path

Four ways to land on cp, four one-command starts:

| Your situation | One command to start | Outcome |
|---|---|---|
| **1. Greenfield** — no code yet | `/cp-new-project` | Brainstorms project intent, scaffolds `.planning/`, queues first milestone |
| **2. Existing code, no planning** | `/cp-map-codebase` | Auto-inits `.planning/` (with notice), then maps the codebase into 7 docs via 4 parallel sub-agents |
| **3. Existing code + GSD planning** | `cp init && cp gsd-import` | Additive only — leaves all GSD files untouched, adds a `cp:` config block so cp verbs work on existing GSD state |
| **4. Existing cp + version bump** | `npx -y --package=context-planning@latest -- cp update` | Fetches latest cp + refreshes per-repo state (skill files, config defaults, drift fixes) in one shot |

Once you've started, every path converges on the same `/cp-plan-phase N`
→ `/cp-execute-phase N` → `/cp-complete-milestone` loop.

## Install

### Node CLI (recommended — from npm)

```bash
npm install -g context-planning
# exposes BOTH `cplan` and `cp` on PATH
cp --version    # should print 1.4.x
```

### Node CLI (from source — for development)

```bash
git clone https://github.com/shushenglihotmail/context-planning
cd context-planning
npm install         # only dep: yaml
npm test            # ~2100 assertions; should all pass
npm link            # exposes BOTH `cplan` and `cp` on PATH (or use: node bin/cp.js ...)
```

### Updating an existing install

**One-liner (v0.9+, recommended):**

```bash
cd <your-project>
npx -y --package=context-planning@latest -- cp update
```

That single command fetches the latest cp via `npx` (per-user cache, no
sudo, package-manager-neutral) and runs `cp update` against the current
repo. It detects which harness(es) are installed and runs the full
refresh loop: re-install skill files, merge new config defaults, and
auto-clean any low/medium drift via `cp audit --fix`. Mirrors GSD's
`/gsd-update` pattern.

**Equivalent manual steps** (or for users who prefer to manage the npm
package themselves):

```bash
npm install -g context-planning@latest   # upgrade global CLI
cd <your-project>
cp update                                # per-repo refresh (same as above)
```

**Even more granular** (the verbs `cp update` is built on):

```bash
cp install <harness> --force             # refresh skill files + ambient instructions
cp config refresh                        # merge new config defaults
cp audit --fix                           # auto-clean drift introduced by upgrade
```

Flags:

- `cp update --dry-run` — preview without writing.
- `cp update --check` — exit 1 if anything would change (CI gate).
- `cp update --json` — machine-readable summary.

**Why `--force` on install?** `cp install` is collision-safe by default — if a skill
file or ambient instruction file differs from what the new version ships,
it assumes you hand-edited it and refuses to overwrite (printing
`LOCALLY MODIFIED — kept`). On a clean version bump that's a false
positive; `--force` says "this is cp-owned content, replace it." If you
actually customised a cp file, copy it out before forcing. `cp update`
passes `--force` automatically.

**v0.8 upgrade note:** the drift-defense literacy block
(`<!-- cp:drift-defense v1 -->`) is injected into your harness's ambient
instruction file (`.github/context-planning.md` for Copilot CLI,
`.claude/CLAUDE.md` for Claude Code, etc.) so the AI agent learns the
new `cp audit` / `cp reconcile` / `cp supersede` / `cp deviate` verbs.
This requires `--force` because the file existed without that block
in v0.7. After upgrade, search for `cp:drift-defense v1` to confirm.

### Into an AI harness

```bash
cd <your-project>
cp install copilot   # writes .github/skills/cp/*.md + .github/agents/*.md
cp install claude    # writes .claude/commands/cp/*.md + .claude/agents/*.md + CLAUDE.md merge
```

Then ensure your provider is available in the same harness:

- **Superpowers** (recommended): see https://github.com/obra/superpowers
- **Manual** (no extra install): cp ships full inline prompts for every role.

### Initialise a project

**You usually don't need to call this directly.** All four onboarding
paths in the [decision matrix above](#choose-your-starting-path) handle
init for you:

- `/cp-new-project` runs it on the way to scaffolding `PROJECT.md`.
- `/cp-map-codebase` runs it automatically when `.planning/` is missing.
- `cp update` only refreshes existing installs.

Use bare `cp init` directly only for **case 3 — existing GSD project**:

```bash
cd <your-project>
cp init                  # idempotent — adds .planning/{PROJECT,ROADMAP,STATE,MILESTONES,config}.json
cp gsd-import            # ingest existing GSD state into the cp lifecycle
```

If the dir is already a GSD project, `cp init` is purely additive: it writes a
`cp:` block into the existing `config.json` and leaves every GSD file alone.

## Worked example — the **linkmark** demo

The repo ships a driver script (`drive-cp.js`, not committed) that walks a
fresh project through a full milestone lifecycle, simulating every slash
command by calling `cp` lib functions directly. Here's what it produces:

```text
.planning/
├── PROJECT.md                   # linkmark vision + constraints (cp-new-project)
├── ROADMAP.md                   # v0.1 MVP with 2 phases, 3 plans, all ticked done
├── STATE.md                     # "Idle, ready for v0.2" after close-out
├── MILESTONES.md                # auto-generated digest of shipped milestone
├── config.json                  # cp block + provider config
└── phases/
    ├── 01-foundation/
    │   ├── PLAN.md              # phase plan
    │   ├── 01-01-storage.md     # per-plan files
    │   ├── 01-01-SUMMARY.md     # written on execute completion
    │   ├── 01-02-list.md
    │   └── 01-02-SUMMARY.md
    └── 02-search/
        ├── PLAN.md
        ├── 02-01-search.md
        └── 02-01-SUMMARY.md
```

After `/cp-complete-milestone` runs, `ROADMAP.md` collapses the milestone into
a `<details>` block:

```markdown
## Phases

<details>
<summary>✅ v0.1 MVP (Phases 1-2) — SHIPPED 2026-05-19</summary>

Goal: ship a usable CLI that can add, list, and search bookmarks.

### Phase 1: Foundation
- [x] 01-01: storage + add
- [x] 01-02: list command

### Phase 2: Search
- [x] 02-01: search command

</details>
```

…and `MILESTONES.md` gets an auto-generated digest with subsystems,
decisions, patterns, and files touched — aggregated across every SUMMARY.md.

## Drift defense (v0.8)

Plan/state docs and the codebase drift apart over time. v0.8 ships a
three-layer defense stack — **prevent → detect → repair** — so you
can keep them in sync.

| Layer | Verbs | What it does |
|---|---|---|
| **Detect** | `cp audit` | 9 consistency checks (LOW/MEDIUM/HIGH); `--severity high` is CI-safe |
| **Repair (auto)** | `cp audit --fix` | Safe fixers for `state-stale`, `summary-without-tick`, `missing-base-commit`, `missing-end-commit` |
| **Repair (manual)** | `cp reconcile`, `cp supersede`, `cp deviate`, `cp scaffold-phase --continue` | SHA backfill, rescope tracking, intentional divergence, work carry-forward |
| **Prevent** | `cp install --hooks`, `cp install --ci` | Pre-commit gate + GitHub Actions workflow |

See **[`docs/drift-playbook.md`](docs/drift-playbook.md)** for the full
walkthrough including migration guide for pre-v0.8 projects and a
finding-id → verb lookup table.

The drift-defense verb list is also injected into your AI harness's
ambient instructions on `cp install`, so the agent surfaces the right
verb when a finding appears.

## Command surface

### Slash commands (live inside your AI harness)

| Command | Stateful work cp does | Workflow handoff |
|---|---|---|
| `/cp-new-project`        | Scaffold `.planning/`, seed PROJECT.md/ROADMAP.md/STATE.md | `brainstorm` → fill in vision/constraints |
| `/cp-new-milestone <name>` | **Rewritten in v1.4.** Thin wrapper that delegates to `cp run milestone "<name>"` — a 6-phase supervised workflow (setup → brainstorm → propose-project-updates → apply-project-updates → propose-phases → finalize). | `brainstorm` per phase |
| `/cp-plan-phase <N>`     | **Deprecated in v1.2 — removed in v1.3.** Stub that redirects to `/cp-autonomous` (which delegates per-phase plan generation to the role skill resolved by `cp doctor`). | — |
| `/cp-execute-phase <N>`  | For each plan: hand off, on success tick ROADMAP, write SUMMARY.md, update STATE.md | `execute` → write & verify code |
| `/cp-autonomous [START] [--scope=…] [--workflow=<dev\|quick>]` | Drive all pending phases of the active milestone without per-phase approval. Per-phase delegation to the role skill from `cp doctor`. `--workflow=quick` drives a non-roadmapped quick run. Smart-gated on test fail / audit HIGH / executor deviation; stops cleanly to `.planning/.continue-here.md` and prompts inline. | Delegates per phase to the role skill |
| `/cp-quick <task>`       | **Rewritten in v1.4.** Thin wrapper that delegates to `cp run quick "<task>"` — a 4-phase supervised workflow (setup → design → execute → finalize). `--full` swaps the design phase's skill for the full plan skill. | Quick workflow phases |
| `/cp-progress`           | Read STATE + ROADMAP → "you are here, next is X" | — |
| `/cp-resume`             | Restore from `.continue-here.md` + STATE | `execute` or whatever role was paused |
| `/cp-complete-milestone` | **Rewritten in v1.4.** Thin wrapper that delegates to `cp run complete-milestone "<name>"` — a 2-phase deterministic workflow (verify → complete) wrapping `cp complete-milestone`. | — |
| `/cp-map-codebase`       | Scaffold `.planning/codebase/` (7 GSD-compatible docs: STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS); dispatch 4 parallel sub-agents to fill them. **cp-native** — no provider required. | Harness sub-agent dispatch (Copilot CLI `task` / Claude `Task` tool) |
| `/cp-capture`            | Walk `.planning/INBOX.md` open items and route each to a quick task / phase note / seed / discard. cp tracks state; harness performs the routing edits. **cp-native** — no provider required for capture/list/tick. | Harness-driven routing; optional provider for `quick:*` items |

#### Workflow skills (new in v1.1)

The v1.1 milestone closed the agent-skill gap that v1.0 left: every
write-side workflow CLI verb now has a matching in-CLI slash skill, so
you never have to drop to the terminal mid-session to drive a workflow.

**Drive a run / discover templates:**

| Command | What it does | Wraps |
|---|---|---|
| `/cp-workflow-list` | List built-in + project workflow templates with source and binding; show what `/cp-workflow-run` accepts | `cp workflow ls` |
| `/cp-workflow-run <workflow> [<name>] [--scope=…] [--check]` | Drive any workflow (built-in or custom) wave-by-wave to completion. Dispatches each phase to the role skill resolved by `cp doctor`. Smart-gated on test fail / audit HIGH / executor deviation | `cp run` + the mark-complete wave loop |
| `/cp-workflow-resume <slug>` | Re-emit the current wave's instruction after a session boundary or context reset | `cp run resume` |

**Author + customize templates:**

| Command | What it does | Wraps |
|---|---|---|
| `/cp-workflow-new <name> [--from <built-in>] [--force]` | Author a new project-local workflow template from a blank or cloned starting point (interactive picker if argv is omitted) | `cp workflow new` |
| `/cp-workflow-customize <built-in> [<new-name>] [--out <path>] [--force]` | Round-trip customize a built-in template: export → edit → validate → import as a new project-local template | `cp workflow export` + `cp workflow import` |
| `/cp-workflow-brainstorm [--workflow <name>] [--out <path>]` | Design a new workflow template conversationally via the configured provider's brainstorm skill | `cp workflow brainstorm` |

**Inspect + validate templates:**

| Command | What it does | Wraps |
|---|---|---|
| `/cp-workflow-show <name>` | Pretty-print a template's YAML body | `cp workflow show` |
| `/cp-workflow-diagram <name-or-path>` | Emit a Mermaid `flowchart TD` of the phase DAG | `cp workflow diagram` |
| `/cp-workflow-inspect <name-or-path> [--json]` | Show YAML **plus** the deduced wave-by-wave execution sequence (parallel phase groupings) — the runtime's internal topological grouping made visible | `cp workflow inspect` (new in v1.1) |
| `/cp-workflow-validate <name-or-path> [--strict]` | Schema + DAG validation; `--strict` fails on warnings for CI | `cp workflow validate` |
| `/cp-workflow-import <path> [--name <override>] [--force]` | Validate + copy an external template into the project | `cp workflow import` |
| `/cp-workflow-export <name> [--out <path>] [--as <new-name>] [--force]` | Export a built-in to a file with the `# template:` header stripped and the `workflow:` key optionally renamed | `cp workflow export` (new in v1.1) |

### Node CLI (operational tooling — not used inside the AI loop)

```bash
cp install <copilot|claude|cursor|aider>     # Install slash-commands + agents into a harness
cp init                         # Scaffold .planning/ (idempotent; safe over GSD projects)
cp doctor                       # Show resolved config, provider status, GSD compat report
cp gsd-import [--root <dir>] [--json] [--apply]
                                # Read-only audit of any planning project (cp or GSD).
                                # exit 0 = clean, 1 = errors, 2 = changes pending
cp status [--json]              # "You are here": current milestone, phase, next plan
cp scaffold-milestone <name> [--planned] [--no-commit] [--dry-run]
                                # Add `### 🚧 <name> (In Progress)` heading to
                                # ROADMAP `## Phases` section. Refuses duplicates.
                                # Use --planned for `### 📋 <name> (Planned)`.
cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>] [--no-commit] [--dry-run]
                                # Add `### Phase N: <name>` under the active
                                # milestone in ROADMAP + create
                                # .planning/phases/{NN-slug}/PLAN.md from
                                # template. --plans pre-fills N empty
                                # `- [ ] NN-MM` checkboxes.
cp scaffold-codebase [--force] [--no-commit] [--dry-run]
                                # Create .planning/codebase/ with 7 stub docs
                                # (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE,
                                # CONVENTIONS, TESTING, CONCERNS) matching GSD's
                                # layout exactly. Filled by `/cp-map-codebase`.
                                # Refuses to overwrite without --force.
cp codebase-status [--json]     # Inventory .planning/codebase/: which docs
                                # exist, line counts, which still look like
                                # stubs (heuristic: <=40 lines OR contains
                                # the "/cp-map-codebase" placeholder marker).
cp capture "<text>" [--no-commit]
                                # Append a free-form line to .planning/INBOX.md
                                # under `## Open` with an ISO-minute timestamp.
                                # Auto-commits scoped to INBOX.md only.
cp inbox [--json] [--all] [--tick <N> [--note <dest>]] [--no-commit]
                                # List the inbox (Open by default; --all adds
                                # Triaged). `--tick N` moves open item N to
                                # Triaged with an optional `--note` destination
                                # tag (e.g. `quick:rename`, `phase:02-mvp`,
                                # `seed:routing-redesign`, `discard`).
cp statusline [--format <fmt>] [--json] [--no-color]
                                # Print a one-line prompt-friendly status string
                                # (e.g. `cp ▸ v0.5 ▸ 01-mvp 1/3 ▸ 01-02`).
                                # Silent outside a cp project. Tokens: %M
                                # (milestone), %P (phase slug), %D (done/total),
                                # %N (next plan id), %B (branch).
cp worktree create <name> [--branch <b>] [--from <base>] [--path <dir>] [--phase <N>] [--use-provider] [--no-create]
                                # Run `git worktree add <path> -b cp/<slug>`
                                # and record in .planning/WORKTREES.md. With
                                # --use-provider, delegates to the configured
                                # provider's worktree skill (Superpowers:
                                # using-git-worktrees) instead of running git
                                # directly.
cp worktree list [--json]       # List cp-tracked worktrees, cross-referenced
                                # against `git worktree list --porcelain`.
cp worktree remove <slug> [--force] [--no-commit]
                                # `git worktree remove` + drop the registry
                                # entry. Refuses if git refuses (dirty
                                # worktree) unless --force.
cp tick <plan-id> [--undo] [--no-commit] [--dry-run]
                                # Mark a plan done in ROADMAP + phase PLAN.md.
                                # Idempotent. Commits unless --no-commit.
cp write-summary <plan-id> --from <json> [--body <md>] [--overwrite] [--dry-run]
                                # Write {NN-MM}-SUMMARY.md with validated/normalised
                                # frontmatter. Accepts kebab-case OR snake_case keys
                                # and normalises to the canonical kebab-case names
                                # aggregateSummaries reads.
cp complete-milestone [<name>] [--dry-run] [--no-commit] [--json]
                                # Full close-out: verify all phases done → aggregate
                                # SUMMARYs → render digest → append to MILESTONES.md
                                # → collapse milestone in ROADMAP → clear
                                # MILESTONE-CONTEXT.md → reset STATE → commit.
                                # Use --dry-run to preview the actions list.
cp autonomous [START] [--scope=phase|N|N-M|milestone] [--check] [--json] [--quiet]
                                # v0.10: walk pending phases of the active
                                # milestone autonomously. START = phase
                                # number, milestone name, or omit to
                                # auto-detect. --check previews phases that
                                # would run. The bare CLI is most useful
                                # for --check; the full agent-driven loop is
                                # `/cp-autonomous` (slash skill).
cp abandon <slug> [--yes] [--reason <text>]
                                # v1.4: soft-abandon a workflow run (state
                                # only; never reverts code). Interactive
                                # confirm by default; --yes for scripts.
cp list [--workflow <name>] [--status <status>] [--json]
                                # v1.4: list workflow runs under
                                # .planning/runs/, with optional filters.
cp status <run-id> [--json]     # v1.4: with a positional run id, prints
                                # that run's state. Without args, behaves
                                # as before (project status).
cp quick-setup <task> [--slug <s>]
                                # v1.4: internal verb used by the `quick`
                                # workflow's setup phase. Scaffolds
                                # .planning/quick/<UTC-date>-<slug>/{DESIGN,STATE}.md.
cp quick-finalize <slug> [--summary <md>]
                                # v1.4: internal verb used by the `quick`
                                # workflow's finalize phase. Writes
                                # SUMMARY.md and flips STATE status.
cp milestone-setup <name>       # v1.4: internal verb used by the
                                # `milestone` workflow's setup phase.
                                # Pre-flight + scaffold milestone shell.
cp milestone-finalize <name>    # v1.4: internal verb used by the
                                # `milestone` workflow's finalize phase.
cp config get [<key>]           # Print a cp config value (or the whole cp block)
cp config set <key> <value>     # Update cp.<key>
cp version                      # Print version
cp help                         # Show command summary
```

The lifecycle wrappers (`status`, `tick`, `write-summary`,
`complete-milestone`) exist so that the LLM-driven slash commands and your
own scripts never have to learn the underlying lib contracts (SUMMARY
filename format, frontmatter aliases, descriptor-object return shapes,
etc.). See [Troubleshooting](#troubleshooting) for the contract details
they hide.

## Workflow Engine

> **New in v1.0** — see [MIGRATION-v1.0.md](MIGRATION-v1.0.md) for the full
> template format reference, state tier guide, and FAQ.
> **New in v1.1** — see [MIGRATION-v1.1.md](MIGRATION-v1.1.md) for the new
> in-CLI agent skills (12 `/cp-workflow-*` slash skills mirroring every
> CLI verb) and the new `cp workflow export` + `cp workflow inspect`
> subcommands.

> **New in v1.4** — see [MIGRATION-v1.4.md](MIGRATION-v1.4.md). The
> three workhorse slash commands (`/cp-quick`, `/cp-new-milestone`,
> `/cp-complete-milestone`) are now thin wrappers over workflow YAMLs
> (`quick`, `milestone`, `complete-milestone`). A new `supervised: true`
> flag on a workflow means a single harness LLM session drives every
> phase (Option A — supervisor = harness). New CLI verbs: `cp abandon`,
> `cp list`, `cp status <run-id>`, and internal `*-setup` / `*-finalize`
> helpers used by the workflow phases.

cp ships a reusable YAML workflow format that lets you define phase DAGs once
and run them via `cp run`. Each workflow declares phases, dependencies (for
parallel waves), roles, and global principles. The engine supports three state
tiers: **milestone-bound** runs that scaffold a full ROADMAP entry,
**phase-bound** runs that attach to an existing phase, and **custom-tier** runs
that execute completely outside the roadmap — perfect for debugging sessions,
quick tasks, and one-off investigations.

### Quick start

```bash
cp workflow ls                          # list available templates
cp run quick "fix login typo"          # start a 4-phase supervised run
# → prints slug + Wave 1 instruction for the agent to execute
echo "Scope captured"  | cp run mark-complete <slug> setup
echo "Design noted"    | cp run mark-complete <slug> design
echo "Implemented + tests green" | cp run mark-complete <slug> execute
echo "Finalized"       | cp run mark-complete <slug> finalize
cp run status <slug>                    # status: done
```

### `cp run` family

| Sub-command | Purpose |
|---|---|
| `cp run <workflow> [name] [--plan-only]` | Start a new workflow run; `--plan-only` prints the wave plan without writing state |
| `cp run resume <slug>` | Re-emit the current wave's instruction (after a session boundary or context reset) |
| `cp run retry <slug> <phase-id>` | Roll back a phase and re-emit its instruction |
| `cp run abandon <slug> [--yes]` | Mark a run abandoned (interactive confirm by default; `--yes` for scripts) |
| `cp run mark-complete <slug> <phase-id>` | Advance the run; summary text read from stdin |
| `cp run status [slug] [--json]` | List all runs (table) or show one run's state |

### `cp workflow` family

| Sub-command | Purpose |
|---|---|
| `cp workflow ls [--json]` | List built-in + project templates with source and binding |
| `cp workflow show <name>` | Pretty-print a resolved template (dumps YAML to stdout — pipe to a file for export-to-stdout) |
| `cp workflow export <name> [--out <path>] [--as <new-name>] [--force]` | **New in v1.1.** Export a built-in template to a file with the `# template:` header stripped and the `workflow:` key optionally renamed. Validates before write. Default destination: `./<as-or-name>.yaml`. Pairs with `cp workflow import` for round-trip customization (or use the `/cp-workflow-customize` skill) |
| `cp workflow validate <name-or-path> [--strict]` | Run schema + DAG validation; `--strict` fails on warnings (CI-safe) |
| `cp workflow diagram <name-or-path>` | Emit a Mermaid `flowchart TD` of the phase DAG |
| `cp workflow inspect <name-or-path> [--json]` | **New in v1.1.** Show template YAML plus the deduced wave-by-wave execution sequence (parallel phase groupings). The runtime's internal topological grouping made visible. `--json` for tooling |
| `cp workflow init` | Bootstrap `.planning/workflows/` in the current project (idempotent) |
| `cp workflow new <name> [--from <built-in>] [--force]` | Scaffold a new template, optionally cloned from a built-in |
| `cp workflow import <path> [--name <override>] [--force]` | Validate and copy an external template into the project |
| `cp workflow brainstorm [--workflow <name>] [--out <path>]` | Delegate to your provider's brainstorm skill to design a new workflow |

### Built-in templates

| Name | Binds to | Phase chain |
|---|---|---|
| `dev` | `milestone` | brainstorm → research-prior-art ∥ research-constraints → plan → execute → review |
| `debug` | `quick` | collect-symptoms → repro → plan → fix → verify |
| `quick` | `quick` | discuss → execute → verify |

> **v1.2** — the lightweight tier was renamed from `custom` to `quick`
> (matching the `.planning/quick/` storage root). `binds_to: custom` in
> existing templates still loads, with a one-line deprecation warning;
> removal is scheduled for v1.3.

Define your own with `cp workflow new <name> --from quick` and validate with
`cp workflow validate <name>` before running. Project-local templates in
`.planning/workflows/` override built-ins of the same name.

### Fan-out (v1.2)

A workflow phase can declare itself as the **parent** of N runtime
children. The parent's agent returns a structured list, and the runtime
materializes one child instance per item. Each child runs the same
downstream phase chain in its own DESIGN.md / STATE.md context.

```yaml
phases:
  - id: plan
    role: planner
    persist: true           # fold agent output into DESIGN.md ## plan

  - id: child-plan
    role: planner
    parent: plan            # fans out under "plan"
    persist: true

  - id: child-execute
    role: executor
    parent: plan
    after: child-plan       # runs after child-plan in the same fan-out unit
    max_children: 10        # safety cap — runtime refuses >10 children per parent
```

**Inter-child ordering via `optimizable:` + `depends_on:`.** The structured
object a parent returns supports a top-level `optimizable: boolean` flag and
a `depends_on:` field on each item:

```json
{
  "optimizable": true,
  "items": [
    { "name": "feature-A", "depends_on": [] },
    { "name": "feature-B", "depends_on": [] },
    { "name": "feature-C", "depends_on": ["feature-A", "feature-B"] }
  ]
}
```

When `optimizable: true` the runtime computes a topo order over declared
`depends_on` edges and parallelizes safe waves; missing `depends_on` is
treated as `[]`. When `optimizable: false` or missing, the runtime runs
items in strict array order (item 0 first) and ignores any declared
`depends_on`. Agents should only set `optimizable: true` when confident
about **every** inter-item dependency — when unsure, leave it `false` for
safe sequential execution. A bare items array (no wrapping object) is still
accepted and treated as `optimizable: false`.

### Principles

The top-level `principles:` field in a workflow template declares global
directives that apply across every phase. cp prepends them to every wave
instruction it emits, so the agent always has the workflow's ground rules in
context — no matter which phase is running. Examples:

```yaml
principles:
  - Don't commit until the user explicitly confirms
  - Run autonomously until you hit a blocking issue, then surface it
  - Run the full test suite after each change
```

Principles layer on top of your `PROJECT.md` `## Constraints` section. They
travel with the template, so a `debug.yaml` can encode "Reproduce before
diagnosing" while `quick.yaml` encodes "Discuss before acting" — each
workflow brings its own discipline without polluting the global config.

### Reusable phase templates (v1.3)

Workflows can include reusable phases via two new wrapper grammars:

```yaml
phases:
  # Bare phase (v1.2 form — still works unchanged):
  - id: plan
    role: planner
    prompt: "Plan the work."

  # Phase-template inclusion: substitute a parameterized phase body.
  - phase:
      id: review-auth
      template:
        name: reviewer       # resolves to .planning/phase-templates/ or builtin
        args:
          scope: auth
      after: [plan]

  # Workflow-template inclusion: splice a multi-phase group inline.
  - template:
      id: review              # group handle (virtual)
      name: review-and-address
      args:
        scope: auth
      after: [plan]           # group entry phases depend on `plan`

  - id: execute
    after: [review]           # rewritten to depend on group's exit phase(s)
```

Templates live in two places:

| Kind              | Built-in (ships with cp)            | Project-local override                 |
|-------------------|-------------------------------------|----------------------------------------|
| Phase template    | `templates/phase-templates/`        | `.planning/phase-templates/`           |
| Workflow template | `templates/workflow-templates/`     | `.planning/workflow-templates/`        |

Project-local files shadow built-in ones by name.

Workflow-template expansion prefixes the inner phase ids with the group
handle: `review-and-address` exposes phases `review-auth` and
`address-auth` → after inclusion under group id `review` they become
`review--review-auth` and `review--address-auth`. Outside refs that say
`after: [review]` get rewritten to point at the group's exit phases.

The CLI surfaces these:

```bash
cp phase-template ls                       # list reusable phase templates
cp phase-template show reviewer            # print body
cp phase-template new my-reviewer --from reviewer
cp workflow-template ls
cp workflow-template show review-and-address
cp workflow-template new my-flow
cp workflow inspect my-flow.yaml --json    # shows post-expansion phases + templates_referenced
```

See `templates/workflows/_examples/dev-templated.yaml` for an
end-to-end example, and `MIGRATION-v1.3.md` for upgrade notes.

## State layer

```
.planning/
├── PROJECT.md                   # Living what/why/requirements/constraints/decisions
├── ROADMAP.md                   # Milestones → phases → plans tree (checkboxes)
├── STATE.md                     # <120-line "you are here" digest
├── MILESTONES.md                # Archive of shipped milestones (GSD-compatible)
├── MILESTONE-CONTEXT.md         # Transient: current milestone spec (deleted on close)
├── config.json                  # Shared GSD+cp config (cp settings under `cp:` key)
├── phases/
│   └── 01-foundation/
│       ├── DESIGN.md            # v1.2: phase intent, contract, persisted agent output
│       ├── STATE.md              # v1.2: current status, last activity, history
│       ├── PLAN.md              # Phase-level plan (cp-friendly short form)
│       ├── 01-01-PLAN.md        # GSD-shape per-plan file: {phase}-{plan}-PLAN.md
│       └── 01-01-SUMMARY.md     # written on execute completion
└── quick/                       # v1.2: lightweight tier (was .planning/custom/)
    └── 20260519-fix-login-test/
        ├── DESIGN.md            # v1.2: goal / approach / done-when
        ├── STATE.md             # v1.2: current-status / last-activity
        └── SUMMARY.md
```

`.continue-here.md` is written inside the active phase dir when work is
paused (`/cp-pause` or LLM session ends mid-execute). `/cp-resume` reads it.

> **v1.2 — quick tier renamed.** `.planning/custom/` is now
> `.planning/quick/`. Legacy slugs under `.planning/custom/` keep working
> (read transparently, listed alongside quick runs, written in-place) with
> a one-time deprecation warning per process. Removal in v1.3 — migrate
> with `git mv .planning/custom/* .planning/quick/`.

## Provider abstraction

`cp` calls workflow providers by **role**, not by name, so users can swap
implementations without touching `cp` itself.

```jsonc
// .planning/config.json — cp block
{
  // ... GSD-compatible top-level keys (mode, workflow, gates, ...) ...
  "cp": {
    "workflow_provider": "superpowers",
    "providers": {
      "superpowers": {
        "skills": {
          "brainstorm":     "brainstorming",
          "plan":           "writing-plans",
          "execute":        "subagent-driven-development",
          "execute_simple": "executing-plans",
          "review":         "requesting-code-review",
          "receive_review": "receiving-code-review",
          "finish":         "finishing-a-development-branch",
          "worktree":       "using-git-worktrees",
          "tdd":            "test-driven-development",
          "debug":          "systematic-debugging",
          "verify":         "verification-before-completion"
        }
      },
      "manual": { "skills": { /* full inline prompts for each role */ } }
    },
    "behavior": {
      "atomic_commits": true,
      "fall_back_to_manual_if_provider_missing": true,
      "gsd_compat_mode": true
    }
  }
}
```

Swap providers with `cp config set workflow_provider <name>`. Missing skill?
`cp doctor` flags it, and at runtime `cp` warns and falls back to `manual`.

Want to write your own? See [`docs/writing-providers.md`](docs/writing-providers.md).

## GSD compatibility

`cp` is a **drop-in superset** of [get-shit-done](https://github.com/gsd-build/get-shit-done).

| Concern | What cp does |
|---|---|
| **Filenames** | Same: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `MILESTONES.md`, `MILESTONE-CONTEXT.md`, `phases/{NN-slug}/{phase}-{plan}-PLAN.md`, `quick/{YYYYMMDD-slug}/PLAN.md`. |
| **Frontmatter** | Same field names: `wave`, `depends_on`, `requirements`, `must_haves.*` for PLAN; `requires`/`provides`/`affects`, `subsystem`, `tags`, `tech-stack`, `key-files`, `key-decisions`, `patterns-established`, `requirements-completed` for SUMMARY. |
| **Config** | Same file (`.planning/config.json`). cp keys live under the `cp:` top-level block; GSD ignores unknown keys. |
| **Round-trip** | `cp` only ADDS to `.planning/` (new cp block, milestone bullets, ticked checkboxes). It never rewrites GSD-shape files in incompatible ways. |
| **Audit** | `cp gsd-import` classifies any project (none / pure-GSD / cp-aware / cp-aware-GSD-superset) and reports exactly what `cp init` would change. Read-only by default. |

You can switch back to GSD at any time. Run `cp doctor` to see the live
compatibility report.

> **Status:** format parity with GSD is a hard contract while cp is in
> active development. Long-term, cp may evolve its own conventions, but
> only after we've documented a migration path.

## Architecture

```
bin/cp.js            # CLI entry: install / init / doctor / config / gsd-import
install/
  copilot.js         # writes .github/skills/cp/*.md + .github/agents/*.md
  claude.js          # writes .claude/commands/cp/*.md + idempotent CLAUDE.md merge
commands/cp/         # harness-agnostic slash-command markdown (9 commands)
lib/
  frontmatter.js     # YAML frontmatter read/write (yaml dep, parseError on bad input)
  roadmap.js         # ROADMAP traversal: listPhases, setPlanDone, appendPhaseBlock
  state.js           # STATE.md "Current Position" updater
  paths.js           # phase dir / SUMMARY filename resolution (GSD conventions)
  milestone.js       # close-out: verify, aggregate, render digest, collapse milestone
  provider.js        # role → skill resolution with installed-check + fallback
  gsd-compat.js      # detect/classify pure-GSD vs cp-aware vs GSD-superset
  import.js          # read-only auditor (74-test fixture suite)
templates/           # PROJECT/ROADMAP/STATE/MILESTONES seeds
test/                # 43 test files, ~1400 assertions, plain Node (no test runner)
docs/
  architecture.md
  writing-providers.md
```

## Troubleshooting

**`cp doctor` says provider not installed.**
Either install Superpowers in the same harness, or `cp config set
workflow_provider manual` to use the built-in inline prompts.

**`cp gsd-import` returns exit code 1 (errors).**
Frontmatter parse failure or required GSD/cp file missing. Run with
`--json` to see the structured report; the offending file is listed under
`issues[*].file`.

**`/cp-complete-milestone` fails with `summariesMissing: ['01-01']`.**
`cp` looks for `{NN-MM}-SUMMARY.md` in each phase dir (e.g.
`01-01-SUMMARY.md`). If your executor writes `01-01-storage-SUMMARY.md`
(slug in the middle), rename without the slug.

**`fs.writeFileSync` `ERR_INVALID_ARG_TYPE` when calling lib functions.**
Several lib functions return `{content, changed, reason}` descriptor
objects, not raw strings. Always use `.content` before writing:
`fs.writeFileSync(p, milestone.collapseMilestoneInRoadmap(...).content)`.

**`/cp-resume` jumps to the wrong plan.**
Check STATE.md's "Session Continuity" section — `Resume file:` should point
to `.continue-here.md` inside the phase dir, not the project root.
`cp` normalises plan IDs (`02` vs `"02"`) when computing the next plan.

## Roadmap

**v0.1 (current)** — vertical slice for GitHub Copilot CLI: 9 slash commands
(`new-project`, `new-milestone`, `plan-phase`, `execute-phase`, `quick`,
`progress`, `resume`, `complete-milestone`, `config`), Claude installer,
manual provider with 11 inline role prompts.

**v0.2 (shipped)** — CLI lifecycle wrappers (`cp status`, `cp tick`,
`cp write-summary`, `cp complete-milestone`) so slash-command implementations
and external scripts never touch the lib contracts directly. 394 tests,
end-to-end smoke tested on the `linkmark` demo + `cp-cli-smoke` fixture.

**v0.3 (shipped)** — Scaffolding wrappers (`cp scaffold-milestone`,
`cp scaffold-phase`) that produce the exact ROADMAP shape the parser
expects, eliminating the H3-vs-bullet template gotcha. Fresh
`cp init` → `cp scaffold-milestone` → `cp scaffold-phase` → `cp tick` →
`cp complete-milestone` round-trips without any hand-editing. 429 tests.

**v0.3.x — `/cp-map-codebase` + safety hotfixes** (shipped) — cp-native
codebase mapping. New `cp scaffold-codebase` + `cp codebase-status` CLI
wrappers and a `/cp-map-codebase` slash command that dispatches 4 parallel
sub-agents (tech / arch / quality / concerns) via the harness's native task
tool to produce 7 GSD-compatible docs in `.planning/codebase/`. **No
workflow provider involved** — proves cp's state-layer ops (init,
scaffold-*, map-codebase) don't need Superpowers; the provider is for
*workflow* work (brainstorm, plan, execute, review, debug) only. v0.3.2
added atomic multi-file writes; v0.3.3 fixed `gitCommit` to never sweep the
working tree (now stages only `.planning/` or an explicit paths list) and
dropped the misleading short-form `PLAN.md` self-warning; v0.3.4 made
`writeBatch` rollback-safe, added installer collision protection
(`--force` to overwrite), and fixed the `--key=value` argv form. 558 tests.

**v0.4.0 — `/cp-capture` inbox triage** (shipped) — `cp capture "..."`
appends an ISO-minute-stamped line to `.planning/INBOX.md`; `cp inbox`
lists / triages (`--tick N --note <dest>` moves an item to the Triaged
section with a free-form destination tag like `quick:rename`,
`phase:02-mvp`, `seed:routing-redesign`, or `discard`). `/cp-capture`
slash command walks the open items interactively, proposes a routing
disposition per item (always user-confirmed), performs the routing edit
(quick task via the workflow provider, append to a phase PLAN.md, append
to STATE.md), and ticks the item triaged. Same auto-commit-scoping
invariant as v0.3.3 — `cp capture` commits never sweep unrelated dirty
files. 603 tests.

**v0.4.1 — shell statusline** (shipped) — `cp statusline` for prompt
integration. Default output `cp ▸ v0.5 ▸ 01-mvp 1/3 ▸ 01-02`. Silent
outside a cp project (safe for PS1 / Starship / tmux). `--format`
supports `%M %P %D %N %B` tokens; `--json` for harness consumption.
631 tests.

**v0.4.2 — Cursor + Aider installers** (shipped) — `cp install cursor`
writes each cp slash-command as a `.cursor/rules/cp-<name>.mdc` rule
(invokable via `@cp-<name>` in Cursor chat) plus an ambient routing rule
(`alwaysApply: true`). `cp install aider` writes `.aider/CP-CONTEXT.md` +
`.aider/cp-commands/<name>.md` and patches `.aider.conf.yml` with a
fenced `read:` block (preserves any other YAML you've added). 681 tests.

**v0.4.3 — git worktree integration** (shipped) — `cp worktree create/list/remove`
wraps `git worktree` with cp-aware defaults (sibling-dir layout, `cp/<slug>`
branch) and records each worktree in `.planning/WORKTREES.md`. `--use-provider`
opt-in delegates to the configured workflow provider's `worktree` skill
(Superpowers maps it to `using-git-worktrees`); cp-native fallback uses
`git worktree add` directly. 751 tests.

**v0.4.4 — dogfood hotfix** (shipped) — re-ran `/cp-map-codebase --force`
against v0.4.3 source, surfaced two HIGH concerns, fixed both: `install/aider.js`
now uses the `yaml` parser (preserves user `read:` entries; auto-migrates
v0.4.2/v0.4.3 fenced blocks); `lib/worktree.js` now owns the git shell-outs
(`runGitWorktreeAdd/Remove`, `listGitWorktrees`) so `bin/cp.js` handlers stay
pure dispatch.

**v0.4.x — planned** — multi-workspace; further dogfood cycles as new
concerns surface.

## Credits

- State-management patterns forked and stripped down from
  [get-shit-done](https://github.com/gsd-build/get-shit-done) by TÂCHES.
- Workflow provider model designed around
  [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent.

MIT.

