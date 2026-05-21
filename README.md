# context-planning (`cplan` / `cp`)

> **GSD's brain. Superpowers' hands.**
> A lightweight, harness-agnostic plugin that keeps long-lived AI development
> work — milestones, phases, plans, summaries — coherent across sessions, while
> handing the actual "how do I write this code" workflow to whatever
> coding-agent skill set you already use.

[![npm](https://img.shields.io/npm/v/context-planning?color=brightgreen)](https://www.npmjs.com/package/context-planning)
[![ci](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml/badge.svg)](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-751%20passing-brightgreen)]()
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
cp --version    # should print 0.9.x
```

### Node CLI (from source — for development)

```bash
git clone https://github.com/shushenglihotmail/context-planning
cd context-planning
npm install         # only dep: yaml
npm test            # ~1400 assertions; should all pass
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
| `/cp-new-milestone <name>` | Append milestone shell to ROADMAP, write MILESTONE-CONTEXT.md | `brainstorm` → spec the milestone → break into phases |
| `/cp-plan-phase <N>`     | Create `phases/{NN-slug}/`, scaffold `PLAN.md` | `plan` → produce per-plan files |
| `/cp-execute-phase <N>`  | For each plan: hand off, on success tick ROADMAP, write SUMMARY.md, update STATE.md | `execute` → write & verify code |
| `/cp-quick <task>`       | Create `quick/{YYYYMMDD-slug}/PLAN.md`, atomic-commit on done | `execute_simple` → quick fix |
| `/cp-progress`           | Read STATE + ROADMAP → "you are here, next is X" | — |
| `/cp-resume`             | Restore from `.continue-here.md` + STATE | `execute` or whatever role was paused |
| `/cp-complete-milestone` | Verify all phases done, aggregate SUMMARY frontmatter, append digest to MILESTONES.md, collapse milestone in ROADMAP, clear MILESTONE-CONTEXT.md, reset STATE | — |
| `/cp-map-codebase`       | Scaffold `.planning/codebase/` (7 GSD-compatible docs: STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS); dispatch 4 parallel sub-agents to fill them. **cp-native** — no provider required. | Harness sub-agent dispatch (Copilot CLI `task` / Claude `Task` tool) |
| `/cp-capture`            | Walk `.planning/INBOX.md` open items and route each to a quick task / phase note / seed / discard. cp tracks state; harness performs the routing edits. **cp-native** — no provider required for capture/list/tick. | Harness-driven routing; optional provider for `quick:*` items |

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
│       ├── PLAN.md              # Phase-level plan (cp-friendly short form)
│       ├── 01-01-PLAN.md        # GSD-shape per-plan file: {phase}-{plan}-PLAN.md
│       └── 01-01-SUMMARY.md     # written on execute completion
└── quick/
    └── 20260519-fix-login-test/
        ├── PLAN.md
        └── SUMMARY.md
```

`.continue-here.md` is written inside the active phase dir when work is
paused (`/cp-pause` or LLM session ends mid-execute). `/cp-resume` reads it.

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

