---
milestone_slug: "v1-4-workflow-driven-quick-and-milestone"
milestone: v1.4 Workflow-driven quick and milestone
status: accepted
created: 2026-05-27
updated: 2026-05-27
deciders: [maintainer]
supersedes: []
superseded_by: null
---

# Design: v1.4 Workflow-driven quick and milestone

## Status

Accepted on 2026-05-27. Supersedes the pre-discussion draft of the same
date.

## Context

In v1.3 the workflow engine became the canonical execution surface for
phase work (parent/child fan-out, phase-templates, workflow-templates).
But the three user-facing lifecycle commands still bypass it entirely:

- `/cp-new-milestone` — skill-driven; brainstorms goals, scaffolds
  ROADMAP, updates PROJECT/STATE.
- `/cp-quick` — skill-driven; scaffolds a quick task dir, delegates to
  provider's execute skill, writes SUMMARY.
- `/cp-complete-milestone` — skill-driven; aggregates SUMMARYs, collapses
  ROADMAP block, appends MILESTONES.md entry.

This split is architecturally inconsistent and limits reuse. Three
parallel mini-engines (one per skill) drift over time, can't share
checkpoint / resume semantics, and prevent user interruption mid-flow.

This milestone routes all three flows through `cp run <workflow>` so the
workflow engine becomes the single execution substrate. Along the way we
overhaul the YAML grammar (a non-breaking simplification while there are
no external workflow authors yet) and introduce an opt-in agentic
supervisor for conversational, long-running workflows.

There are no external customers of the v1.3 grammar yet — this milestone
takes the opportunity to lock the grammar before the surface freezes.

## Decision

Eleven design decisions, locked in order during the v1.4 brainstorm:

| # | Decision |
|---|---|
| 1 | YAML grammar: top-level array entries are either `phase:` or `template:` wrappers. Inline + on-disk templates supported for both phase-templates and workflow-templates. Workflow-template **resolution** deferred to v1.5; v1.4 reserves the grammar slot and rejects use with a clear "not yet implemented" error. |
| 2 | Required `description:` field on every phase. Replaces all declarative interrupt-handler shapes (`on:`, event enums, action enums). The description is read by the supervisor when classifying interrupts and re-running phases. |
| 3 | Unified `materialize: inline \| roadmap-phases` directive on parent phases (replaces the earlier "dynamic fan-out" + "scaffold-fanout CLI" split). |
| 4 | `min_children` default = 1, `max_children` default = 10 (was 20). `min_children: 0` retained as an opt-in escape valve. |
| ~~5~~ | ~~Legacy skill rename.~~ Superseded by #10. |
| 6 | Workflow-level `supervised: true \| false` field opts into the two-thread agentic architecture: a persistent supervisor (LLM-driven) coordinates phase sub-agents, mediates user I/O, handles interrupts with L1/L2/L3 confidence levels, and persists checkpoint state. Default false. |
| 7 | Milestone workflow decomposes the legacy "step 3+4+5" brainstorm into **three** phases: `brainstorm`, `propose-project-updates`, `propose-phases`. Each carries a `description:` calling out its re-run scenario. MILESTONE-CONTEXT → DESIGN promotion stays in the existing `cp complete-milestone` CLI. |
| 8 | Under `supervised: true`: one commit per phase, engine is the sole git author, local commits only (never `git push` without explicit user request), phases declare output paths and engine reverts uncommitted writes in those paths on `restart_phase`. Run state persisted at `.planning/runs/<run-id>/state.json`. Coarse-grained restart (full phase only); intra-phase resume deferred to v1.5+. Unsupervised workflows keep their existing v1.3 commit behavior. |
| 9 | `cp abandon <run-id>` is **soft only**: marks the run abandoned, moves state to `.planning/runs/_abandoned/<run-id>/`, leaves all artifacts and commits in place. Always prompts the user with a summary of phases done + commits made before acting. No git operations of any kind — code/commit rollback is the user's manual decision. |
| 10 | The three user-facing slash commands (`/cp-new-milestone`, `/cp-quick`, `/cp-complete-milestone`) stay with familiar names but become **thin wrappers** that delegate to `cp run milestone`, `cp run quick`, `cp run complete-milestone`. No `*-legacy-*` rename. The workflow IS the implementation. |
| 11 | Two CLI tiers: **reserved framework commands** (`cp <verb>` — `cp init`, `cp status`, `cp doctor`, `cp resume`, `cp abandon`, `cp list`, `cp scaffold-*`, `cp complete-milestone`) are imperative Node primitives; **workflows** (`cp run <workflow>`) are declarative YAML. `/cp-resume` skill stays untouched — it is a reserved framework command, not a workflow wrapper. |

## Consequences

### Positive
- One execution substrate for all lifecycle flows; resume + checkpoint + interrupt semantics inherited uniformly.
- Slash-command muscle memory preserved (Decision #10).
- Grammar simplification (Decision #1) reduces three v1.3 phase shapes to two symmetric wrappers.
- `supervised:` (Decision #6) makes the agentic supervisor an opt-in feature — workflows that don't need it (`dev`, `complete-milestone`) pay no cost.
- Decision #7 gives the supervisor sharp re-run targets for the most common "user changed their mind" scenarios.
- Decision #8 makes git history clean and audit-friendly under supervised mode (one commit per phase, engine-owned).
- Decision #9 keeps cp in its lane — context management only, never destructive to user's code.

### Negative
- Engine grows: supervisor runtime + message broker + checkpoint protocol + new YAML fields. ~3 phases of new infrastructure.
- Quick loses legacy "atomic commit per substantive change" granularity (Q-quick-1 acceptable trade — quick tasks are short, ~3 phase commits is fine).
- Grammar change is breaking for anyone (no one yet) authoring v1.3-style workflow YAML; we take the break before any external authors exist.

### Neutral
- Slash command output ordering changes (workflows phase-by-phase vs. monolithic skill).
- Existing `dev.yaml` and other unsupervised workflows continue working unchanged.

---

## Architecture

```
              user
                │
        cp run <workflow>
                │
                ▼
   ┌────────────────────────────────────────────────────┐
   │      cp workflow engine (extended in v1.4)         │
   │                                                    │
   │   if workflow.supervised:                          │
   │   ┌────────────────────────────────────────────┐   │
   │   │  Supervisor thread (persistent LLM)        │   │
   │   │   - reads phase descriptions               │   │
   │   │   - classifies user messages (L1/L2/L3)    │   │
   │   │   - persists state to runs/<id>/state.json │   │
   │   │   - owns git commits at phase end          │   │
   │   └─────────────┬──────────────────────────────┘   │
   │                 │ spawn / message                  │
   │                 ▼                                  │
   │   ┌────────────────────────────────────────────┐   │
   │   │  Phase sub-agent (ephemeral, per phase)    │   │
   │   │   - declared output paths only             │   │
   │   │   - no git, no network outside provider    │   │
   │   │   - emits structured events                │   │
   │   └────────────────────────────────────────────┘   │
   │                                                    │
   │   else (supervised: false):                        │
   │   ┌────────────────────────────────────────────┐   │
   │   │  v1.3 deterministic phase dispatcher       │   │
   │   └────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────┘
                │
                ▼
   .planning/{runs,phases,quick,milestones,ROADMAP.md,STATE.md,...}
```

## YAML grammar (Decision #1)

```yaml
workflow: <name>
version: 1
binds_to: milestone | quick | phase | run-id
supervised: false      # default — omit for v1.3-compatible runs

phase_templates:       # inline phase-template definitions (optional)
  - name: <template-name>
    params: [...]
    description: ...
    role: ...
    skill: ...
    prompt: ...

workflow_templates:    # inline workflow-template definitions (v1.5 resolution)
  - name: <template-name>
    params: [...]
    phases: [...]

phases:
  # Inline phase
  - phase:
      id: <required>
      description: <required>      # NEW Decision #2
      role: <optional>
      skill: <optional>
      kind: skill | scaffold       # default skill
      command: <required if scaffold>
      prompt: <optional>
      after: [...]
      depends_on: [...]
      parent: <id>
      materialize: inline | roadmap-phases   # Decision #3
      max_children: 10             # Decision #4 default
      min_children: 1              # Decision #4 default
      outputs: [...]               # declared writable paths (Decision #8)

  # Phase using a phase-template
  - phase:
      id: <required>
      description: <required>
      after: [...]
      template:
        name: <template-name>
        args: { ... }

  # Workflow-template instance (grammar reserved, v1.5 resolution)
  - template:
      id: <namespace-id>           # dotted: <id>.<inner-phase-id>
      name: <template-name>
      args: { ... }
      after: [...]
```

Lookup order for both template kinds (closer scope wins):
1. Inline in current workflow file
2. `<projectDir>/.planning/phase-templates/<name>.yaml` (or `/workflow-templates/`)
3. `<repoRoot>/templates/phase-templates/<name>.yaml` (or `/workflow-templates/`)

## Workflow: milestone (Decision #7)

`templates/workflows/milestone.yaml`:

```yaml
workflow: milestone
version: 1
binds_to: milestone
supervised: true

params:
  - name: brainstorm_skill
    default: "${config.provider.brainstorm_skill}"
  - name: plan_skill
    default: "${config.provider.plan_skill}"

phases:
  - phase:
      id: setup
      description: |
        Validate prerequisites (PROJECT.md exists), resolve milestone
        name, run cp doctor. Re-run if doctor flags a fixable
        configuration issue mid-workflow.
      kind: scaffold
      command: "cp milestone-setup-check {{milestone_slug}}"

  - phase:
      id: brainstorm
      description: |
        Brainstorm milestone scope conversationally with the user.
        Produces DESIGN.md and MILESTONE-CONTEXT.md. Re-run if the user
        wants to fundamentally rethink the milestone goal, scope, or
        approach.
      after: [setup]
      role: brainstormer
      skill: "{{brainstorm_skill}}"
      outputs:
        - ".planning/milestones/{{milestone_slug}}/DESIGN.md"
        - ".planning/MILESTONE-CONTEXT.md"

  - phase:
      id: propose-project-updates
      description: |
        Propose updates to PROJECT.md from the brainstorm: which
        requirements move to validated, which become active. Re-run if
        the user changed requirement framing without changing the
        milestone goal itself.
      after: [brainstorm]
      role: planner
      skill: "{{plan_skill}}"
      outputs:
        - ".planning/milestones/{{milestone_slug}}/project-update.json"

  - phase:
      id: apply-project-updates
      description: |
        Apply the proposed PROJECT.md mutations. Re-run safely (CLI is
        idempotent against the JSON input).
      after: [propose-project-updates]
      kind: scaffold
      command: "cp project update --from .planning/milestones/{{milestone_slug}}/project-update.json"

  - phase:
      id: propose-phases
      description: |
        Decompose milestone into 2-10 phases for ROADMAP.md. Re-run if
        the user wants a different granularity, phase split, or
        sequencing without redoing brainstorm.
      after: [apply-project-updates]
      role: planner
      skill: "{{plan_skill}}"
      materialize: roadmap-phases
      max_children: 10

  - phase:
      id: finalize
      description: |
        Update project STATE.md (current focus, phase counter), print
        next-step banner.
      after: [propose-phases]
      kind: scaffold
      command: "cp milestone-finalize {{milestone_slug}}"
```

## Workflow: quick

`templates/workflows/quick.yaml`:

```yaml
workflow: quick
version: 1
binds_to: quick
supervised: true

params:
  - name: design_skill
    default: "${config.provider.quick_design_skill}"
  - name: execute_skill
    default: "${config.provider.execute_skill}"

phases:
  - phase:
      id: setup
      description: |
        Generate slug from task description, create
        .planning/quick/<date>-<slug>/ dir, scaffold DESIGN.md and
        STATE.md. Re-run only if scaffolding got corrupted.
      kind: scaffold
      command: "cp quick-setup --task '{{task_description}}'"

  - phase:
      id: design
      description: |
        Discuss the task with the user, agree on Approach + Done-When,
        write into DESIGN.md, set status=ready. Re-run if user wants to
        redo the approach without abandoning the task. Honors --full
        flag by switching to ${plan_skill}.
      after: [setup]
      role: planner
      skill: "{{design_skill}}"
      outputs:
        - ".planning/quick/{{slug_with_date}}/DESIGN.md"

  - phase:
      id: execute
      description: |
        Implement the agreed change. Engine commits at phase end
        (Decision #8). Append progress to STATE.md.
      after: [design]
      role: implementer
      skill: "{{execute_skill}}"
      outputs:
        - "**/*"   # broad — execute writes code

  - phase:
      id: finalize
      description: |
        Write SUMMARY.md (files changed, commits, duration). Set
        DESIGN/STATE status=complete. Append row to project STATE.md
        Quick Tasks Completed table.
      after: [execute]
      kind: scaffold
      command: "cp quick-finalize {{slug_with_date}}"
```

## Workflow: complete-milestone

`templates/workflows/complete-milestone.yaml`:

```yaml
workflow: complete-milestone
version: 1
binds_to: milestone
# supervised omitted = false (deterministic; no agentic supervision)

phases:
  - phase:
      id: verify
      description: |
        Dry-run: verify all phases have all plans ticked and a SUMMARY
        on disk. Prints action list. Exits non-zero with a clear
        explanation if anything is missing.
      kind: scaffold
      command: "cp complete-milestone --dry-run {{milestone_name}}"

  - phase:
      id: complete
      description: |
        Aggregate SUMMARY frontmatter, render digest, append to
        MILESTONES.md, collapse milestone in ROADMAP under <details>,
        delete MILESTONE-CONTEXT.md, reset STATE.md, atomic commit.
      after: [verify]
      kind: scaffold
      command: "cp complete-milestone {{milestone_name}}"
```

The user-confirmation gate between `verify` and `complete` is handled by
the deterministic engine (prompts user with verify output, awaits Y/n)
— no supervisor needed.

## Slash command wrappers (Decision #10)

Each slash command's SKILL.md becomes ~10 lines:

```markdown
---
name: cp-new-milestone
description: Start a new milestone — gather goals, break into phases.
argument-hint: "<milestone name>"
---

# /cp-new-milestone

You are running `cp-new-milestone`. Delegate to the milestone workflow:

    cp run milestone "$ARGUMENTS"

Stream the workflow output. Do not perform any brainstorm or phase
breakdown inline — the workflow's supervisor handles it.
```

Same shape for `/cp-quick` (→ `cp run quick`) and `/cp-complete-milestone`
(→ `cp run complete-milestone`).

`/cp-resume` is NOT changed — it is a reserved framework command, not a
workflow wrapper (Decision #11).

## Reserved CLI commands (Decision #11)

New / formalized in v1.4:

| Verb | Purpose |
|---|---|
| `cp run <workflow> [args]` | Start a workflow run |
| `cp resume <run-id>` | Resume a paused/interrupted run |
| `cp abandon <run-id>` | Soft-abandon a run (Decision #9) |
| `cp list [--workflow <id>] [--status <s>]` | List runs |
| `cp status <run-id>` | Show run state |
| `cp milestone-setup-check <slug>` | (new helper used by milestone.yaml) |
| `cp milestone-finalize <slug>` | (new helper used by milestone.yaml) |
| `cp project update --from <json>` | Declarative PROJECT.md mutations |
| `cp quick-setup --task <txt>` | (new helper used by quick.yaml) |
| `cp quick-finalize <slug>` | (new helper used by quick.yaml) |

Existing reserved verbs (unchanged): `cp init`, `cp status`,
`cp doctor`, `cp scaffold-*`, `cp complete-milestone`, `cp deviate`,
`cp reconcile`, `cp autonomous`, `cp audit`, `cp worktree`, `cp capture`,
`cp inbox`, etc.

## Supervisor architecture (Decision #6, #8)

```
            user messages
                  │
                  ▼
   ┌─────────────────────────────┐
   │   Supervisor (LLM thread)   │
   │                             │
   │  classify message:          │
   │    in-flow conversation  ──► forward to sub-agent
   │    side comment          ──► inject as note
   │    control signal        ──► reason about action
   │                                │
   │   confidence:                  │
   │     L1 — execute autonomously  │
   │     L2 — suggest, await Y/n    │
   │     L3 — ask user (menu)       │
   └──────────────┬──────────────────┘
                  │ spawn / message
                  ▼
   ┌─────────────────────────────┐
   │  Phase sub-agent            │
   │  events: awaiting_input,    │
   │          phase_complete,    │
   │          phase_failed,      │
   │          escalating         │
   └─────────────────────────────┘
```

State persisted at `.planning/runs/<run-id>/state.json` (between phases
AND on every supervisor decision).

Sub-agents:
- Have access only to declared output paths (Decision #8)
- No git commands, no network calls outside provider
- Always escalate to supervisor; never read stdin directly

Engine ↔ git contract:
- Engine snapshots HEAD before phase
- On `phase_complete` → stage + commit declared outputs with
  engine-controlled message: `cp run <workflow>: <phase-id> ({{run-id}})`
- On `phase_failed` or interrupt → revert uncommitted changes in declared
  output paths only
- Never `git push`

## Interrupt handling (Decision #2, #6)

Supervisor reads `description:` field on each phase to choose restart
targets. Three flows:

1. **In-phase user message** during a `skill:` phase → supervisor
   classifies (in-flow / side comment / control signal) and routes.
2. **Cross-phase interrupt** (Ctrl-C) → supervisor pauses sub-agent,
   shows phase menu with descriptions, asks user.
3. **Process death / crash** → next `cp resume <run-id>` rehydrates
   supervisor from state.json, inspects artifacts, asks user (L3).

No declarative `on:` blocks. No event/action enums. Descriptions +
supervisor reasoning carry the load.

## Abandon flow (Decision #9)

`cp abandon <run-id>`:

1. Read state.json, build summary (phases done, commits since start,
   current status).
2. Prompt user with summary, single-keypress confirmation. No `--yes`
   bypass.
3. On confirm: move `.planning/runs/<run-id>/` to
   `.planning/runs/_abandoned/<run-id>/`, mark milestone abandoned in
   ROADMAP.md (`### 🛑 ... (Abandoned)` heading), commit that single
   bookkeeping change. Leave all other artifacts + commits untouched.
4. No git operations on user's code commits. Rollback is the user's
   manual `git revert` decision.

## Testing strategy

- **Unit (engine):**
  - YAML grammar: `phase:` / `template:` wrapper parsing, inline templates,
    rejection of bare-shape phases.
  - `description:` required validation.
  - `materialize:` directive: inline vs. roadmap-phases dispatch.
  - `min_children` / `max_children` defaults + opt-in zero.
  - Supervisor: state persistence, restart_phase output reversion,
    classification stubs.
- **Unit (CLI):** new reserved commands (`cp abandon`, `cp list`,
  `cp project update`, `cp milestone-setup-check`, `cp milestone-finalize`,
  `cp quick-setup`, `cp quick-finalize`).
- **Integration:** `cp run quick`, `cp run milestone`,
  `cp run complete-milestone` end-to-end against fixture providers.
  Interrupt + resume scenarios.
- **Back-compat:** existing `dev.yaml` continues to run unchanged.
  Slash command wrappers behave identically from user perspective.

## Phase breakdown (11 phases, ROADMAP authoritative)

1. **YAML grammar overhaul** — `phase:` / `template:` wrappers, inline
   templates, `description:` required, reject v1.3 bare shape.
2. **Engine: `kind: scaffold` + `materialize:` unification + defaults
   change (10/1)** — engine extensions enabling new workflows.
3. **Reserved CLI helpers — set 1** — `cp project update`,
   `cp milestone-setup-check`, `cp milestone-finalize`.
4. **Reserved CLI helpers — set 2** — `cp quick-setup`, `cp quick-finalize`,
   `cp abandon`, `cp list`, `cp status <run-id>`.
5. **Supervisor runtime** — persistent LLM session, sub-agent contract
   (event protocol), output-path enforcement.
6. **Message broker + classifier** — L1/L2/L3 confidence levels, in-flow
   vs side-comment vs control-signal classification, interrupt menu.
7. **Checkpoint protocol** — `.planning/runs/<id>/state.json` schema,
   write timing, restore semantics, restart_phase output reversion.
8. **quick.yaml + `/cp-quick` thin wrapper** — full workflow + slash
   wrapper rewrite.
9. **milestone.yaml + `/cp-new-milestone` thin wrapper** — full workflow
   + slash wrapper rewrite.
10. **complete-milestone.yaml + `/cp-complete-milestone` thin wrapper**
    — workflow + slash wrapper rewrite.
11. **Docs + MIGRATION-v1.4.md + v1.4.0 release** — README, MIGRATION,
    cp doctor updates, version bump.

## Out of scope (deferred to v1.5+)

- Workflow-template **resolution** (grammar slot reserved in v1.4).
- Intra-phase resume (v1.4 = coarse-grained restart_phase only).
- Staging-area artifact writes (v1.4 = revert uncommitted writes on
  restart).
- Conversion of `cp-new-project`, `cp-execute-phase`, `cp-autonomous`,
  `cp-capture`, `cp-map-codebase` to workflows (case-by-case in v1.5+).
- Per-event `on:` blocks (dropped from design; description-driven
  reasoning replaces).
- Hard abandon / rollback CLI (always user's manual git operation).
