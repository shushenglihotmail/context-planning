# Architecture

> **Audience:** contributors who want to understand cp's internals and
> the boundaries between its subsystems. End-users should start with the
> [top-level README](../README.md) and the
> [workflow docs](./workflow/).

## TL;DR

cp is **two cleanly-separated pillars sharing one CLI surface**:

1. A **YAML workflow engine** that walks a phase DAG and emits an
   invocation contract per wave.
2. A **file-based state layer** that owns `.planning/` — Markdown
   artefacts every command (and every human, and every other agent)
   can read and write.

A thin **provider routing layer** maps role/skill names declared in
workflow YAML to real skill paths inside whatever agent harness you
use. A guaranteed `manual` fallback means cp runs end-to-end with no
external provider installed.

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLI + slash skills                        │
│  cp run | cp workflow | cp status | cp audit | /cp-quick ...       │
└────────────────────────────────────────────────────────────────────┘
              │                                       │
              ▼                                       ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│      WORKFLOW ENGINE         │        │       STATE LAYER            │
│  templates/workflows/*.yaml  │        │  .planning/                  │
│  .planning/workflows/*.yaml  │        │    PROJECT.md                │
│                              │        │    ROADMAP.md                │
│  lib/workflow*.js            │        │    STATE.md                  │
│  lib/runtime*.js             │ ─────► │    MILESTONES.md             │
│  lib/supervisor.js           │ reads  │    phases/{NN-slug}/         │
│  lib/run-lifecycle.js        │   &    │    quick/{YYYY-MM-DD-...}/   │
│                              │ writes │    runs/{wf}/{slug}/         │
│  • phase DAG → waves         │        │    workflows/                │
│  • supervised / unsupervised │        │    phase-templates/          │
│  • fan-out (1 → N children)  │        │    workflow-templates/       │
│  • template expansion        │        │                              │
│  • invocation contract       │        │  lib/milestone.js            │
└──────────────────────────────┘        │  lib/state.js                │
              │                         │  lib/quick-helpers.js        │
              ▼                         │  lib/persist.js              │
┌──────────────────────────────┐        │  lib/frontmatter.js          │
│   PROVIDER ROUTING LAYER     │        └──────────────────────────────┘
│  lib/provider.js             │                       ▲
│                              │                       │
│  role/skill → real skill     │        ┌──────────────────────────────┐
│  config.json:cp.providers    │        │     DRIFT DEFENCE            │
│                              │        │  cp audit / reconcile /      │
│  built-in: superpowers       │        │     supersede / deviate      │
│            echo-provider     │        │  lib/audit*.js               │
│            manual (fallback) │        │  lib/reconcile.js            │
└──────────────────────────────┘        │  lib/hooks.js (git hooks)    │
                                        └──────────────────────────────┘
```

## Design principles

1. **Files are the API.** Every long-lived fact lives in `.planning/`
   as plain Markdown with deterministic structure. No database, no
   lock files, no opaque state. Git is the audit log.
2. **Workflows are declarative.** Phase DAGs live in YAML, not in
   procedural code. The engine reads them; you (or your harness)
   execute them; cp records the outcome.
3. **Provider-agnostic.** Workflow YAML never names a concrete skill
   path. It names a routing key (`skill: plan`). The active provider
   resolves it. Swap providers without rewriting workflows.
4. **Harness-agnostic.** The CLI is the source of truth. Each harness
   installer writes thin slash-skill shims that shell out to `cp`.
   No harness-specific logic lives in the engine.
5. **Always runnable.** The `manual` provider resolves every role to
   an inline prompt (`cp:manual/<role>`), so cp works even with no
   external workflow provider installed.
6. **Round-trip with humans.** Every Markdown file is hand-editable.
   `cp audit` + `cp reconcile` detect and repair drift so humans and
   agents can both edit `.planning/` without stepping on each other.

## Pillar 1 — Workflow engine

### Template lookup and shadowing

A workflow template is a YAML file at one of:

| Source           | Path                              | Precedence |
| ---------------- | --------------------------------- | ---------- |
| Project (custom) | `.planning/workflows/<name>.yaml` | Wins       |
| Built-in (cp)    | `templates/workflows/<name>.yaml` | Fallback   |

Project templates shadow built-ins of the same name. You can also pass
an arbitrary path directly to any `cp workflow` subcommand.

Reusable building blocks:

| Kind              | Project path                                | Built-in path                              |
| ----------------- | ------------------------------------------- | ------------------------------------------ |
| Phase template    | `.planning/phase-templates/<id>.yaml`       | `templates/phase-templates/<id>.yaml`      |
| Workflow template | `.planning/workflow-templates/<id>.yaml`    | `templates/workflow-templates/<id>.yaml`   |

Phases reference these via `template: <id>` + `with: { … }`. Whole
workflows can include other workflows the same way. Loaders live in
`lib/phase-template-loader.js` and `lib/workflow-template-loader.js`.

### Template expansion

`lib/workflow-template-expand.js` resolves the template tree in three
passes:

1. **Inline phase/workflow template expansion** — replace `template:`
   references with their bodies, applying `with:` overrides.
2. **Param substitution** — `{{param_name}}` and `${config.path.to.value}`
   tokens are interpolated. `lib/template-substitute.js` enforces a
   whitelist: only `[skill, role, prompt, description, command,
   outputs, max_children, min_children]` accept tokens. (The doc-comment
   in `lib/workflow-template-validate.js:11-12` predates `outputs`
   being allowed — trust the `ALLOWED_PARAM_FIELDS` constant at lines
   25–34, not the comment.)
3. **Auto-injected finalize** — if no phase declares
   `id: <binds_to>-finalize`, the engine appends one whose `command:`
   is `cp <binds_to>-finalize` so the run always lands in a closed
   state.

### Validation

`lib/workflow-template-validate.js` runs two passes:

- **Pre-expand**: top-level envelope (workflow/version/binds_to/
  supervised/principles/params), allowed fields per phase, no unknown
  keys, kebab-case IDs.
- **Post-expand**: DAG well-formedness (no cycles, all `depends_on:`
  references resolve), token whitelist enforcement, fan-out config
  sanity (`max_children >= min_children >= 1`), template ID matches
  filename stem.

`cp workflow validate` exits non-zero on any failure with a precise
field path.

### Scheduling: waves and topo

`lib/workflow.js:computeWaves` does a Kahn-style topological pass over
the post-expansion DAG and groups phases into **waves** — sets where
all members' `depends_on:` are satisfied by earlier waves. Members of
the same wave have no inter-dependencies and may run in parallel.

`cp workflow inspect <name>` prints the wave grouping; `cp workflow
diagram <name>` emits a Mermaid flowchart.

### Supervised vs. unsupervised runs

`supervised: true` (the default for every built-in) means `cp run`:

1. Prints the **first wave** as an invocation contract block.
2. Exits.
3. Waits for `cp run mark-complete <slug> <phase-id>` to advance.
4. Re-prints the next wave (or the next-wave block).
5. Repeats until the finalize phase, then exits clean.

`supervised: false` is the legacy/CI mode: the engine prints every
wave's contract in one shot and exits. You're responsible for driving
them yourself.

The supervisor's per-run state lives in
`.planning/runs/<workflow>/<slug>/STATE.md` (frontmatter + recent
history) plus per-phase output files. `lib/supervisor.js` +
`lib/run-lifecycle.js` own the lifecycle.

### Fan-out

A parent phase declares `max_children:` (and optionally `min_children:`).
On `mark-complete`, the parent's summary is parsed for an `items:`
list; each item becomes a **child phase instance** with synthesized
ID (`<parent-id>:<item-id>`) and inherits the parent's role/skill/
prompt with item-specific param overrides.

If the parent's summary sets `optimizable: true` AND every item
declares `depends_on:` (use `[]` for no deps), the children become a
single parallel wave. Otherwise the runtime falls back to sequential
execution in declared order — safe-by-default.

`lib/runtime-fanout.js` materializes the child instances;
`lib/fanout.js` parses and validates the items list.

### Invocation contract (v1.6)

Each wave's printed block is machine-readable. For each phase:

```
=== PHASE: <id> ===
role:        <role>
skill:       <resolved-skill-path>    (e.g. writing-plans, or cp:manual/plan)
description: <description>
depends_on:  [<parent ids>]
outputs:     [<output file paths if declared>]

PROMPT:
<the phase's prompt body, with all {{param}} / ${config.x} resolved>

ADVANCE WITH:
  cp run mark-complete <slug> <id> [--summary path/to/SUMMARY.md]
```

An agent harness can parse this deterministically. The full grammar is
in [`docs/workflow/reference.md`](./workflow/reference.md).

## Pillar 2 — State layer

### File responsibilities

| File / directory                  | Owner                  | Mutated by                              | Purpose                                                       |
| --------------------------------- | ---------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `PROJECT.md`                      | author / `/cp-new-project` | `cp scaffold-codebase`, manual edits | What this project is. One page.                               |
| `ROADMAP.md`                      | cp + author            | `cp scaffold-milestone/-phase`, `cp tick`, `cp reconcile` | Active milestone + phase tree. Single source of truth for "what's planned." |
| `STATE.md`                        | cp                     | `cp state regen`, `cp tick`, lifecycle hooks | "You are here" pointer. Always derivable from ROADMAP + phase tree. |
| `MILESTONES.md`                   | cp                     | `cp complete-milestone`                 | Archive of closed milestones with their aggregate digest.     |
| `MILESTONE-CONTEXT.md`            | author                 | milestone brainstorm, free-form edits   | Scratchpad for the active milestone (goals, scope, constraints). |
| `INBOX.md`                        | cp                     | `cp capture`, `cp inbox --tick`         | Captured ideas awaiting triage.                               |
| `REVIEW-LOG.md`                   | author                 | external review notes                   | External review history; cp reads but doesn't modify.         |
| `config.json`                     | cp + author            | `cp init`, `cp update`, hand-edits      | Resolved settings (provider, behavior, harnesses, GSD compat). |
| `codebase/`                       | cp + author            | `cp scaffold-codebase`, `/cp-map-codebase` | Static codebase intel: STACK, ARCHITECTURE, STRUCTURE, etc.   |
| `phases/{NN-slug}/PLAN.md`        | cp + author            | `cp scaffold-phase`, planner agent      | Per-phase plan with `<task>` blocks + `<verify>` commands.    |
| `phases/{NN-slug}/SUMMARY.md`     | cp + author            | execute agent, `cp write-summary`       | Per-phase summary with validated frontmatter.                 |
| `phases/{NN-slug}/{NN-MM}-SUMMARY.md` | cp + author        | `cp write-summary <plan-id>`            | Per-plan summary (one per `<task>`).                          |
| `quick/{YYYY-MM-DD-slug}/DESIGN.md` | cp + author          | `cp quick-setup`, design phase          | One-page design for a quick task.                             |
| `quick/{YYYY-MM-DD-slug}/STATE.md` | cp                    | quick supervisor                        | "You are here" inside the quick task.                         |
| `quick/{YYYY-MM-DD-slug}/SUMMARY.md` | cp + author          | `cp quick-finalize`                     | What the quick task shipped.                                  |
| `runs/{workflow}/{slug}/`         | cp                     | workflow supervisor (`lib/supervisor.js`) | Per-workflow-run state: STATE.md + per-phase outputs.         |
| `workflows/`                      | author                 | `cp workflow new/import`                | Project-local workflow YAMLs (shadow built-ins).              |
| `workflow-templates/`             | author                 | manual                                  | Project-local reusable whole-workflow templates.              |
| `phase-templates/`                | author                 | manual                                  | Project-local reusable phase templates.                       |

### Aggregator primitives

- `lib/milestone.js` — read/write ROADMAP, count phases, locate
  active milestone, compute progress.
- `lib/state.js` — derive STATE.md from ROADMAP + phase dirs;
  enforce STATE as a *derived* artefact.
- `lib/persist.js` — atomic file writes (write-tmp + rename).
- `lib/frontmatter.js` — parse/validate YAML frontmatter, normalise
  snake_case ↔ kebab-case aliases.
- `lib/run-lifecycle.js` — workflow-run lifecycle (create, advance,
  resume, abandon).
- `lib/quick-helpers.js` — quick-task lifecycle parallel to phase
  lifecycle but lighter-weight.

### Atomicity guarantees

Every state mutation:

1. Validates input (frontmatter, schema).
2. Writes to a `.tmp` sibling.
3. `rename()` atomically.
4. Optionally commits (`cp.behavior.atomic_commits: true` in config).

Concurrent `cp` invocations against the same `.planning/` are safe as
long as they touch different files; they will not corrupt the same
file because of the rename-atomic pattern.

## Pillar 3 — Provider routing

A **provider** is a routing table mapping canonical role/skill names
to concrete skill paths inside an agent harness or plugin. The schema
lives in `templates/config.json:cp.providers` and is merged with any
project-level overrides in `.planning/config.json`.

```jsonc
"providers": {
  "superpowers": {
    "detect": { "any_of": [".github/skills/writing-plans", ...] },
    "skills": {
      "plan": "writing-plans",
      "execute": "subagent-driven-development",
      "review": "requesting-code-review",
      // ...
    }
  },
  "manual": {
    "detect": { "always": true },        // always wins as fallback
    "skills": {
      "plan": "cp:manual/plan",          // resolves to an inline prompt
      // ...
    },
    "prompts": {
      "plan": "You are running the cp MANUAL plan fallback. ..."
    }
  }
}
```

`lib/provider.js`:

1. Loads the merged provider table.
2. Walks the configured provider list (default: superpowers, then
   manual) and runs each provider's `detect:` block.
3. The first provider that matches becomes active.
4. When a workflow phase asks "what's `plan`?", the active provider's
   `skills.plan` value is returned (falling back to `manual` if the
   active provider doesn't declare that role).

`cp doctor` prints the resolved provider plus the role-by-role
resolution table so you can see exactly which skill paths each role
will route to.

To write your own provider, drop a `providers.<name>` block into your
config. See [`docs/writing-providers.md`](./writing-providers.md).

## Drift defence

Humans and agents both edit `.planning/`. Drift is inevitable.
cp ships a four-verb playbook for keeping the state honest:

| Verb                                | What it does                                                                                  | Module                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| `cp audit`                          | Read-only sweep. Detect missing SUMMARY.md, dangling ticks, frontmatter mismatch, etc.        | `lib/audit.js`          |
| `cp audit --fix`                    | Classify findings, apply safe auto-fixes one atomic commit at a time. Caps at `--max N`.      | `lib/audit-fix.js`      |
| `cp reconcile <phase\|--all\|--phase R>` | Repair phase-level drift: infer missing commit SHAs from git log, accept SUMMARY-derived expected files. | `lib/reconcile.js`     |
| `cp supersede` / `cp deviate`       | Honest history rewrites for plans that turned out wrong (supersede) or phases that drifted from PLAN.md (deviate). | `lib/supersede-deviate.js` |

A pre-commit git hook (`cp install --hooks`) can block commits that
would introduce HIGH-severity drift. The post-commit hook auto-ticks
ROADMAP for commits matching the cp commit message format.

## Lifecycle: end-to-end

A typical milestone:

```
1. /cp-new-milestone <goal>
     ├─ cp run milestone <slug>           (supervised)
     │    ├─ brainstorm  (role: product-thinker)
     │    ├─ phase-break (role: planner; fans out)
     │    └─ finalize    (cp milestone-finalize: writes ROADMAP + STATE)
     │
2. /cp-execute-phase   (for each phase 01, 02, ...)
     ├─ cp scaffold-phase N --name X --continue
     ├─ planner agent writes phases/NN-X/PLAN.md
     ├─ executor agent walks <task> blocks; cp tick + cp write-summary per task
     └─ cp state regen
     │
3. /cp-complete-milestone
     ├─ cp run complete-milestone <slug>
     │    ├─ audit (cp audit --strict; refuses on HIGH/MED)
     │    ├─ aggregate (collect every SUMMARY into a milestone digest)
     │    ├─ archive  (append to MILESTONES.md)
     │    └─ reset    (clear MILESTONE-CONTEXT.md, reset STATE banner)
     └─ commit
```

Every step writes to `.planning/`. Every step is resumable. Every
step is auditable.

## What cp explicitly does NOT do

- **Execute code or call LLMs directly.** cp's job is to emit
  invocation contracts. Your harness (Copilot CLI, Claude Code,
  Cursor, Aider) dispatches the named skill and drives the model.
- **Mandate a specific provider or harness.** Workflows reference
  routing keys, not concrete paths. Any provider mapping those keys
  to real skills works.
- **Own a project's source code.** cp lives in `.planning/` (plus
  `.github/skills/cp-*` for the slash-skill shims and optional git
  hooks). Everything else is yours.
- **Replace your CI.** `cp audit` is a useful pre-commit / CI gate
  but is not a replacement for proper test and build pipelines.
- **Persist secrets.** All state is plain Markdown intended for
  commit. Anything sensitive belongs elsewhere.

## GSD compatibility

cp inherited its `.planning/` shape from
[get-shit-done](https://github.com/gsd-build/get-shit-done) and is
designed to **round-trip with GSD installs without data loss**:

- Same filenames (`PROJECT.md`, `ROADMAP.md`, `STATE.md`,
  `MILESTONES.md`, `phases/{NN-slug}/`, etc.).
- Same frontmatter conventions for SUMMARY.md.
- Same `config.json` keys for the GSD-managed sections. cp's
  additions all live under `cp.*`, which GSD ignores.
- `cp gsd-import` audits an existing GSD project before any
  destructive edit; `--apply` runs `cp init` on top.

This is a **compatibility contract**, not an identity claim. cp has
its own workflow engine, drift-defence verbs, run lifecycle, and
slash-skill surface; GSD does not. Either tool can read the other's
files; cp adds capabilities GSD doesn't have without breaking
anything GSD does.

## Further reading

- [README.md](../README.md) — user-facing entry point.
- [docs/workflow/](./workflow/) — workflow engine docs (quickstart,
  reference, recipes).
- [docs/writing-providers.md](./writing-providers.md) — how to write
  a new provider.
- [docs/drift-playbook.md](./drift-playbook.md) — drift-defence
  patterns.
- [docs/MIGRATION-v0.5.md](./MIGRATION-v0.5.md) and other
  `MIGRATION-*.md` — per-version upgrade notes.
- `CHANGELOG.md` — version-by-version history.
