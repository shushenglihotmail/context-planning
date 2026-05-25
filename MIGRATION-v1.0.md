# Migrating to context-planning v1.0

> **New in v1.0.0** — see [CHANGELOG.md](CHANGELOG.md) for a terse bullet summary.

## What's New

v1.0.0 ships the **Workflow Engine**: a reusable YAML format for defining
phase-based workflows, a full CLI surface (`cp run`, `cp workflow`), and three
built-in templates (`dev`, `debug`, `quick`). The engine is additive —
nothing was removed, nothing broke.

Key capabilities:

- **Phase DAGs with parallel waves** — declare `depends_on:` between phases;
  the runtime automatically computes parallel execution waves.
- **Three state tiers** — `milestone`, `phase`, and `custom`; run workflows
  inside your roadmap *or* completely outside it.
- **Top-level `principles:`** — global directives that travel with every
  workflow (e.g. "Don't commit until confirmed with user").
- **AI authoring** — `cp workflow brainstorm` produces a YAML draft via your
  configured provider's brainstorm skill.

---

## Do I Need to Migrate?

**No.** All pre-v1.0 commands and the milestone/phase model continue to work
unchanged. v1.0 is purely additive: nothing was removed, nothing broke. You
can adopt the workflow engine at your pace, or never.

Pre-1.0 projects have no migration steps. Existing `.planning/` files,
ROADMAP.md, STATE.md, and phase directories are untouched by any `cp run` or
`cp workflow` command.

---

## The Big Idea

cp's classic milestone/phase model is great for sustained product work, but
heavy for one-off tasks like "debug this issue" or "quick refactor". v1.0
introduces a third state tier — **custom-tier runs** — that lets you execute a
workflow without touching ROADMAP.md.

```
Classic path:       cp scaffold-milestone → cp scaffold-phase → cp tick → cp complete-milestone
Workflow path:      cp run quick "fix typo"  →  mark-complete loop  →  done
```

Both paths share the same underlying state conventions; you can mix them freely
in one project.

---

## Three State Tiers

| Tier | Binds to | State location | Use when |
|---|---|---|---|
| `milestone` | a milestone slug | `.planning/milestones/<slug>/RUN.yaml` | Running a multi-phase workflow that maps to a ROADMAP milestone |
| `phase` | a phase number | `.planning/phases/<dir>/.workflow-runs/<slug>.yaml` | Running a workflow inside an existing phase |
| `custom` | nothing | `.planning/custom/<slug>/STATE.yaml` | One-off work: debug sessions, quick tasks, spikes |

### Storage layout

```
.planning/
├── milestones/
│   └── <slug>/
│       └── RUN.yaml                  ← milestone-tier run state
├── phases/
│   └── 01-foundation/
│       └── .workflow-runs/
│           └── <slug>.yaml           ← phase-tier run state
└── custom/
    └── 2026-05-24-fix-auth-bug/
        ├── STATE.yaml                ← custom-tier run state
        ├── 01-collect-symptoms.md    ← per-phase output
        ├── 02-repro.md
        └── ...
```

`cp run resume <slug>` detects the binding tier automatically by scanning all
three locations.

---

## Template Format Reference

```yaml
workflow: my-flow              # unique name (must match filename stem)
version: 1                     # schema version — always 1 for v1.0
binds_to: custom               # milestone | phase | custom  (default: custom)
principles:                    # global directives applied across all phases
  - Run tests after each change
  - Don't commit until user confirms
defaults:                      # default settings inherited by every phase
  model: default               # high | middle | low | default
phases:
  - id: discuss                # unique within workflow
    role: planner              # role name used for provider skill resolution
    prompt: |
      Talk through the change with the user before coding.
    # depends_on: []           # ids of phases that must complete first
  - id: execute
    role: implementer
    depends_on: [discuss]
    prompt: |
      Make the change. Run tests.
  - id: verify
    role: verifier
    depends_on: [execute]
    prompt: |
      Confirm with the user that the change is correct.
```

### Field reference

| Field | Required | Type | Description |
|---|---|---|---|
| `workflow` | yes | string | Template name; must match the filename stem |
| `version` | yes | integer | Schema version; always `1` for v1.0 |
| `binds_to` | no | `milestone\|phase\|custom` | State tier; defaults to `custom` |
| `principles` | no | string[] | Global directives prepended to every wave instruction |
| `defaults` | no | object | Default per-phase values (currently: `model`) |
| `phases` | yes | object[] | Ordered list of phase definitions |
| `phases[].id` | yes | string | Unique identifier within the workflow |
| `phases[].role` | no | string | Provider role for skill resolution |
| `phases[].model` | no | string | Override model tier: `high\|middle\|low\|default` |
| `phases[].skill` | no | string | Explicit skill name (bypasses role resolution) |
| `phases[].prompt` | no | string | Instructions emitted to the agent for this phase |
| `phases[].depends_on` | no | string[] | Phase ids that must complete before this one |
| `phases[].persist_output` | no | boolean | Whether cp saves the phase output file |

### Parallel waves

Phases with no mutual `depends_on` dependency form a parallel wave. The
runtime computes waves automatically using Kahn's algorithm. Example:

```yaml
phases:
  - id: brainstorm
  - id: research-prior-art
    depends_on: [brainstorm]   # wave 2 (parallel with research-constraints)
  - id: research-constraints
    depends_on: [brainstorm]   # wave 2 (parallel with research-prior-art)
  - id: plan
    depends_on: [research-prior-art, research-constraints]  # wave 3
```

Wave plan: `[brainstorm] → [research-prior-art, research-constraints] → [plan]`

The runtime's wave instruction includes a `[parallel]` header when a wave has
more than one phase, signalling the agent to dispatch them concurrently via its
harness's native Task tool.

### Validation

```bash
cp workflow validate <name>            # errors + warnings
cp workflow validate <name> --strict   # warnings also fail (CI-safe)
```

`validate` checks:
- Schema (required fields, correct types)
- DAG: cycle detection (DFS three-color algorithm)
- DAG: dangling-dep detection (unknown `depends_on` ids)
- Warnings: phases declared out of topological order
- Warnings: `principles:` count > 10 (cognitive overload hint)

Exit 0 = clean. Exit 2 = validation error or (with `--strict`) warnings.

---

## Built-in Templates

Three templates ship with cp under `templates/workflows/`:

### `dev.yaml` — Full feature development cycle

```
binds_to: milestone
Wave 1: brainstorm
Wave 2: research-prior-art  ∥  research-constraints   (parallel)
Wave 3: plan
Wave 4: execute
Wave 5: review
```

**Principles:** Understand before building · Parallelise independent work ·
Plan before executing · Review before shipping.

Best for: new features, milestone-scale work that deserves thorough research
and a code review gate before shipping.

### `debug.yaml` — Scientific-method debug cycle

```
binds_to: custom
Wave 1: collect-symptoms
Wave 2: repro
Wave 3: plan
Wave 4: fix
Wave 5: verify
```

**Principles:** Reproduce before diagnosing · Apply scientific method ·
Fix the root cause, not the symptom · Verify the fix holds.

Best for: bug investigations, regressions, environment-specific failures.
Runs as a custom-tier session so it never pollutes ROADMAP.md.

### `quick.yaml` — Minimal three-phase cycle

```
binds_to: custom
Wave 1: discuss
Wave 2: execute
Wave 3: verify
```

**Principles:** Discuss before acting · Verify before closing.

Best for: small tasks, one-off refactors, quick fixes that don't need the
full dev cycle.

---

## AI Authoring

`cp workflow brainstorm --workflow my-flow` delegates to your configured
provider's brainstorm skill (Superpowers by default), giving you a structured
YAML draft. The command emits a starter context block describing the target
workflow and expected YAML structure; the AI fills in the phases interactively.

```bash
cp workflow brainstorm --workflow my-flow     # starts brainstorm session
# AI produces .planning/workflows/my-flow.yaml
cp workflow validate my-flow                  # verify the draft
cp workflow show my-flow                      # inspect resolved template
cp run my-flow "first run"                    # execute it
```

When no provider is installed, `cp workflow brainstorm` prints the full manual
brainstorm prompt so you can run the session yourself (same fallback as other
cp skills).

---

## Working with the Engine

### Starting a run

```bash
# Custom-tier (most common):
cp run quick "fix typo in README"
# → prints a slug (e.g. 2026-05-24-fix-typo-in-readme) and Wave 1 instruction

# Milestone-bound:
cp run dev "v1.5 Search"
# → scaffolds milestone + phases, emits Wave 1 instruction
```

### Marking phases complete

After the agent completes a phase, mark it done (summary piped via stdin):

```bash
echo "Discussed scope: change line 42 of README.md" | cp run mark-complete <slug> discuss
# → advances to Wave 2, emits execute instruction
```

Or with a file:

```bash
cp run mark-complete <slug> execute < execute-summary.md
```

### Resuming a run

```bash
cp run resume <slug>    # re-emits current wave's instruction
```

Useful after a session boundary or context reset — cp knows exactly where you
left off.

### Retrying a phase

```bash
cp run retry <slug> <phase-id>   # rolls state back to that phase, re-emits instruction
```

### Abandoning a run

```bash
cp run abandon <slug>            # interactive confirmation
cp run abandon <slug> --yes      # non-interactive (CI / scripts)
```

Abandoned runs remain in `.planning/custom/` (or the appropriate tier dir)
until pruned. `cp run status` lists them with `abandoned` state.

### Status

```bash
cp run status              # list all runs (table format)
cp run status <slug>       # show one run's state
cp run status --json       # machine-readable
```

---

## FAQ

**Q: Do I have to convert my existing milestones to workflows?**

A: No. The milestone/phase model is unchanged. Workflows are an alternative
for tasks that don't fit a long-running milestone. Both models coexist in the
same project.

**Q: What happens to my `.planning/` files when I run a custom workflow?**

A: A new `.planning/custom/<slug>/STATE.yaml` is created. Nothing else is
touched. ROADMAP.md, STATE.md, and all phase directories are left alone.

**Q: Can I run multiple workflows in parallel?**

A: Yes — each run gets its own slug and state file. The duplicate-run guard
only prevents two simultaneous runs of the SAME workflow with the SAME name.
Running `cp run quick "task A"` and `cp run quick "task B"` at the same time
is fine.

**Q: How do I write a new built-in or project-local template?**

A: Drop the YAML into `.planning/workflows/<name>.yaml` in your project (these
take precedence over built-ins). Or scaffold from an existing template:

```bash
cp workflow new my-flow --from quick   # copy quick.yaml as starting point
cp workflow validate my-flow           # check it before running
```

To contribute a new built-in, add the file to `templates/workflows/<name>.yaml`
in the cp repo.

**Q: Will workflows ever execute themselves (without a human-in-the-loop)?**

A: Not in v1.0. The engine emits instructions; the harness (Copilot CLI,
Claude Code, etc.) acts on them. This is the same trust model as the rest of
cp's design — cp owns state, the harness owns execution.

**Q: What's the `--plan-only` flag?**

A: `cp run --plan-only <workflow>` prints the full wave plan without writing
any state. Useful for previewing a workflow before committing to a run.

**Q: Why YAML and not Markdown?**

A: Markdown is unstructured for DAG expression — there's no clean way to
declare parallel phases in prose. YAML lets you express `depends_on:` lists
naturally, and a single `yaml` parser (already a cp dependency) handles
loading, validation, and round-trip editing. See the milestone DESIGN.md for
the full alternatives analysis.

---

## References

- [Milestone DESIGN.md](.planning/milestones/v1-0-workflow-engine/DESIGN.md) — locked architecture and full alternatives considered
- [Phase 40 SUMMARYs](.planning/phases/40-core-engine-custom-tier/) — `lib/workflow.js`, `lib/runtime.js`, `lib/custom.js` implementation notes
- [Phase 41 SUMMARYs](.planning/phases/41-cli-surface-built-in-templates-ai-author/) — CLI surface implementation notes
- [CHANGELOG.md](CHANGELOG.md) — version history
