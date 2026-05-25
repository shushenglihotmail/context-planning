---
milestone_slug: "v1-1-workflow-skills"
milestone: v1.1 Workflow Skills
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
---

# Design: v1.1 Workflow Skills

## Status

Accepted on 2026-05-25.

## Context

v1.0 (phases 40–42) shipped the workflow engine: a 14-command `cp run` /
`cp workflow` CLI surface, three built-in templates (`dev` / `debug` /
`quick`), and AI-assisted authoring via `cp workflow brainstorm`. The
runtime, validators, state machine, and CLI ergonomics all landed and
were published as `context-planning@1.0.0` on 2026-05-25.

**The gap:** the v1.0 surface stopped at the terminal. Zero `cp-*` skills
in `commands/cp/` invoke `cp run` or `cp workflow`. Every other
write-side capability in cp (capture, complete-milestone, execute-phase,
new-milestone, new-project, plan-phase, quick, write-summary,
autonomous) has both a terminal command **and** a matching agent-side
skill. The workflow engine missed that pairing.

**Observed UX consequence:** to drive any workflow today, a user must
context-switch terminal ↔ agent. Open terminal, run `cp run <wf>
<name>`, switch to Copilot CLI / Claude Code, manually instruct the
agent to pick up the run by slug, return to terminal for status
checks. This violates the established convention and was the explicit
critique that motivated this milestone.

**Adjacent reality:** two pre-existing skills — `cp-quick` and
`cp-autonomous` — already do workflow-driven work, but neither goes
through the v1.0 engine. `cp-quick` predates the engine and hardcodes
its own custom-tier flow. `cp-autonomous` is the milestone-bound loop
driver, structurally equivalent to `cp run dev`. Two execution paths
exist for the same conceptual operation.

## Decision

Ship a `cp-workflow-*` skill family that wraps the v1.0 CLI and
collapses both pre-existing skills onto the same path.

**New skills (5):**

| Skill | Wraps | Purpose |
|---|---|---|
| `cp-workflow-run` | `cp run <workflow> [<name>]` + mark-complete loop | Generic driver — start any workflow and drive it to completion |
| `cp-workflow-resume` | `cp run resume / retry / status` | Resume a paused or failed run |
| `cp-workflow-list` | `cp workflow ls` + `cp workflow show` | Discoverability — list available templates with descriptions |
| `cp-workflow-new` | `cp workflow new` + `cp workflow brainstorm` | AI-assisted custom template authoring (blank start or `--from <built-in>`) |
| `cp-workflow-customize` | `cp workflow export` (new) → edit → `cp workflow import` | Round-trip customize a built-in: export, hand-edit, import as new |

**Refactored skills (2):**

- `cp-quick` → thin shim invoking `cp-workflow-run quick`, preserving
  the pre-v1.1 argv contract (`<task>`, `list`, `resume <slug>`) and
  the `.planning/quick/<dir>/` transcript location for back-compat.
- `cp-autonomous` → thin shim invoking `cp-workflow-run dev` for the
  active milestone, preserving `--scope`, `--check`, and the smart-gate
  stop semantics.

**No CLI changes.** Skills are pure consumers of the v1.0 CLI; the
engine, runtime, validators, and CLI surface stay frozen.

## Consequences

### Positive
- Convention restored — every write-side cp capability now has matching
  terminal + agent surfaces.
- Single execution path — one place to fix bugs, one place to add
  features (smart-gates, model overrides, persist_output) that benefit
  every workflow.
- Discoverability — `cp-workflow-list` removes the "what workflows do I
  have" guesswork.
- Future workflows (e.g. v1.2 named accumulators) instantly inherit the
  full agent surface; no per-workflow skill needed.

### Negative
- Two refactor risks: `cp-quick` and `cp-autonomous` are mature, tested
  paths. Collapsing them to shims requires careful back-compat tests so
  existing argv invocations don't regress.
- Slight indirection cost — a `cp-workflow-run` invocation now spawns
  the v1.0 CLI, which spawns the runtime; previously `cp-autonomous`
  ran its loop in-skill.

### Neutral
- v1.1 ships zero new CLI commands. All changes are markdown skill
  files + installer wiring + tests.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Agent CLI (Copilot CLI / Claude Code / Cursor)         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │   cp-workflow-run  cp-workflow-resume            │   │
│  │   cp-workflow-list cp-workflow-new               │   │
│  │   cp-workflow-customize                          │   │
│  │                                                    │   │
│  │   cp-quick ──────────► (shim)                     │   │
│  │   cp-autonomous ─────► (shim)                     │   │
│  └────────────────┬─────────────────────────────────┘   │
└───────────────────┼──────────────────────────────────────┘
                    │ shell out
                    ▼
┌─────────────────────────────────────────────────────────┐
│  cp CLI (bin/commands/run.js, workflow.js) — v1.0       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ lib/runtime  │  │ lib/workflow │  │ lib/state    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
       .planning/runs/<slug>/STATE
       .planning/runs/<slug>/SUMMARY.md (per phase)
       .planning/quick/<slug>/    (for custom-tier runs)
       .planning/phases/<NN>/     (for phase-tier runs)
```

## Components

### `commands/cp/workflow-run.md`
- **Purpose:** Generic workflow driver. Reads argv, calls `cp run
  <wf> <name>`, parses emitted wave prompts, dispatches to role skills,
  generates summaries, calls `cp run mark-complete`, loops until
  `STATE.status == complete`.
- **Public interface:** `cp-workflow-run <workflow> [<name>] [--scope=...] [--check]`
- **Dependencies:** `cp run`, provider role skills (planner/implementer/verifier).

### `commands/cp/workflow-resume.md`
- **Purpose:** Resume / retry / inspect existing runs.
- **Public interface:** `cp-workflow-resume [<slug>] [--retry <phase>]`
- **Dependencies:** `cp run resume`, `cp run retry`, `cp run status`.

### `commands/cp/workflow-list.md`
- **Purpose:** Discoverability. Lists built-in + project templates with
  descriptions and binding type.
- **Public interface:** `cp-workflow-list [<name>]` (with name → shows template YAML).
- **Dependencies:** `cp workflow ls`, `cp workflow show`.

### `commands/cp/workflow-new.md`
- **Purpose:** AI-assisted custom workflow authoring.
- **Public interface:** `cp-workflow-new <name> [--from <built-in>]`
- **Dependencies:** `cp workflow new`, `cp workflow brainstorm`, provider's brainstorm skill.

### `commands/cp/workflow-customize.md` (renamed from workflow-import.md, 2026-05-25)
- **Purpose:** Round-trip customize a built-in template — export, edit, validate, import as new name. The user-facing task that v1.0's `cp workflow show > file` + `cp workflow import` *almost* enabled but with three UX paper-cuts (header strip, name rewrite, default path) that this skill + the new `cp workflow export` CLI close together.
- **Public interface:** `cp-workflow-customize <built-in> [<new-name>] [--out <path>] [--force]`
- **Dependencies:** `cp workflow export` (new in 44-01), `cp workflow validate`, `cp workflow import`.

### ~~Refactored: `commands/cp/quick.md`~~ (deferred to v1.2)
- **Status:** Deferred from v1.1 after phase 44 design review. `cp-quick` and
  `cp-workflow-run quick` use different state layouts
  (`.planning/quick/<dir>/` vs `.planning/runs/<slug>/`); a true shim would
  break back-compat. Keeping `cp-quick` as-is for v1.1.

### ~~Refactored: `commands/cp/autonomous.md`~~ (deferred to v1.2)
- **Status:** Deferred from v1.1 after phase 44 design review. `cp-autonomous`
  drives milestone phases via `cp autonomous` + `/cp-plan-phase` +
  `/cp-execute-phase`; `cp-workflow-run dev` drives a workflow's waves via
  `cp run`. Fundamentally different orchestrators. Keeping `cp-autonomous`
  as-is for v1.1.

### `install/copilot.js`, `install/claude.js`
- **Purpose:** register the 5 new `cp-workflow-*` skills into both
  harnesses. No API changes — these files already iterate
  `commands/cp/`.

## Data Flow

```
1. user types in agent CLI:
     "use cp-workflow-run debug for the failing login test"

2. agent loads commands/cp/workflow-run.md

3. skill body:
     a. parse argv → workflow="debug", name="failing-login-test"
     b. shell out: `cp run debug "failing-login-test"`
        → creates .planning/runs/failing-login-test/STATE.json
        → emits Wave 1 prompt to stdout

4. skill parses stdout:
     - extract phase id, role, model hint, prompt body

5. skill dispatches to role skill (e.g. for role=debugger →
   provider's systematic-debugging skill)

6. role skill returns a SUMMARY.md draft

7. skill shells out:
     `cp run mark-complete failing-login-test <phase> < SUMMARY.md`
     → STATE advances, next wave prompt printed (or "complete")

8. loop steps 4–7 until STATE.status == complete

9. report to user: "run failing-login-test complete, summary at <path>"
```

## Error Handling

- **Template not found** — surface `cp workflow ls` output for triage.
- **Workflow requires run name** — re-raise `cp run`'s existing error
  verbatim; skill prompts the user for the missing name.
- **Test failure / audit HIGH / executor deviation during a wave** —
  reuse `cp-autonomous`'s smart-gate semantics. Write
  `.planning/.continue-here.md` with current STATE so `cp-resume` picks
  up. Exit the skill loop and surface the failure to the user.
- **CLI exits non-zero** — display stderr, do not advance STATE
  (mark-complete only runs on agent success), prompt user for next
  action.

## Testing Strategy

**Unit (`test/unit-*.js`):**
- Extend `test/unit-installers.js` to assert all 5 new skill files are
  wired into copilot + claude installers.
- No new unit tests for skill bodies themselves (markdown, no logic).

**Dry-run (`test/dryrun-*.js`):**
- Already exist for `cp run` and `cp workflow` (added in phase 41-03).
  Reuse — they validate the CLI surface the skills depend on.

**Integration (`test/integration-*.js`):**
- New: `test/integration-workflow-skills.js`. Simulates a full
  quick-workflow round-trip by spawning `cp run quick "demo"`, piping
  synthetic summaries to `cp run mark-complete`, asserting STATE
  transitions (`in_progress` → `complete`) and resulting file layout
  (`.planning/runs/demo/STATE`, `SUMMARY.md` per phase).

**Back-compat (`test/unit-installers.js` + new `test/dryrun-shim-compat.js`):**
- Assert refactored `cp-quick` and `cp-autonomous` skill bodies still
  parse pre-v1.1 argv shapes without regression.

**Coverage target:** maintain v1.0 baseline (85% lines / 75% branches
in `coverage:ci`). No new threshold — this milestone adds little
runtime code.

## Alternatives Considered

### Option A — Single mega-skill `cp-workflow`

A single skill that takes a subcommand (e.g. `cp-workflow run debug`,
`cp-workflow list`).

**Pros:**
- Smallest skill count (1 file).
- Mirrors the `cp workflow` CLI subcommand shape.

**Cons:**
- Violates convention. Every other agent surface (cp-new-milestone,
  cp-plan-phase, cp-execute-phase) is one skill per verb.
- Worse discoverability — agents surface skills by name in their UIs.
  `cp-workflow-run` is more findable than `cp-workflow` with hidden
  subcommands.
- Argv parsing in markdown is brittle; per-verb skills avoid it.

**Verdict:** rejected.

### Option B — Per-built-in shortcuts

Ship `cp-quick-debug`, `cp-quick-dev` etc. as named aliases.

**Pros:**
- Lowest cognitive load for the three built-ins.

**Cons:**
- Doesn't scale to user-authored workflows.
- N+1 skills for N built-ins; today 3, tomorrow more.
- Still need `cp-workflow-run` for the user-defined case, so this just
  adds files without removing complexity.

**Verdict:** rejected.

### Option C — Leave `cp-quick` and `cp-autonomous` untouched

Ship only the 5 new skills, don't refactor.

**Pros:**
- Lowest risk for v1.1 — no mature code touched.

**Cons:**
- Two execution paths persist for the same conceptual operation. Bug
  fixes and feature additions must land in both, indefinitely.
- The "convention restored" goal of this milestone is only partially
  met — agents still have two ways to do the same thing.

**Verdict:** rejected. Accept the refactor risk; mitigate with
back-compat tests in phase 45.

## Open Questions

- [ ] (none — all design decisions captured in Q1–Q4 of the brainstorm
  transcript at `.planning/MILESTONE-CONTEXT.md`)

## References

- v1.0 Workflow Engine milestone DESIGN — `.planning/milestones/v1-0-workflow-engine/DESIGN.md`
- v1.0 runtime — `lib/runtime.js`, `lib/workflow.js`
- v1.0 CLI — `bin/commands/run.js`, `bin/commands/workflow.js`
- Built-in templates — `templates/workflows/{quick,dev,debug}.yaml`
- Existing skill conventions — `commands/cp/{quick,autonomous,new-milestone,plan-phase,execute-phase}.md`
- Brainstorm transcript — `.planning/MILESTONE-CONTEXT.md`

## Brainstorm transcript

# Milestone Brainstorm: v1.1 Workflow Skills

_Transcript captured 2026-05-25. Promoted into milestone DESIGN.md at
`cp complete-milestone`._

## Source conversation

Brainstorm conducted in the same Copilot CLI session that published
v1.0.0 (`context-planning@1.0.0`) earlier today. The milestone emerged
from a UX critique by the user immediately after publish:

> "let's in reality, no body run workflow instruction outside of CLI,
> however what you provide is a set of outside commands, however no in
> CLI commands to invoke them. That is very very against customer
> convention. … shall not provide write operation without agent CLI
> like run command. People have to cp run outside CLI, then start CLI,
> then do something to continue? It is very very ridiculous
> speculation. The realistic workflow is providing a set of in CLI
> commands like cp new milestone to start workflow like cp-new-workflow
> <workflow name>."

The agent verified the gap by inventorying `commands/cp/*.md` and
grepping `install/` for `cp run|cplan run` invocations. Confirmed: 13
skills installed, zero invoke the v1.0 workflow CLI.

## Q&A

### Q1 — Skill set scope

> Which skill set should v1.1 ship?

**Options offered:**

- A. Full set (5 skills): cp-run, cp-resume-run, cp-list-workflows,
  cp-new-workflow, cp-workflow-import + refactor cp-quick to shim
  **(recommended)**
- B. Core (3 skills): cp-run, cp-resume-run, cp-list-workflows — defer
  authoring/import to v1.2
- C. Minimum (2 skills): cp-run + cp-list-workflows
- D. Full set + per-built-in shortcuts (cp-quick-debug, cp-quick-dev)

**User selected:** A (full set + cp-quick shim).

**Rationale:** A complete, conventional surface lands in one milestone
rather than dribbling across v1.1 / v1.2; refactoring cp-quick
unifies the execution path.

### Q2 — Naming convention

> Which naming convention?

**Options offered:**

- A. cp-run, cp-resume-run, cp-list-workflows, cp-new-workflow,
  cp-workflow-import (matches CLI verbs, parallel to cp-new-milestone)
- B. cp-workflow-run, cp-workflow-resume, cp-workflow-list,
  cp-workflow-new, cp-workflow-import (all under cp-workflow-* prefix)
- C. cp-run, cp-resume, cp-workflows, cp-new-workflow,
  cp-import-workflow (shortest; cp-resume collides with existing)

**User selected:** B (cp-workflow-* prefix).

**Rationale:** Grouping all workflow operations under one prefix
improves discoverability in agent UIs that surface skills
alphabetically, avoids cp-resume collision, makes the conceptual
boundary visible.

### Q3 — Fate of cp-quick

> Today cp-quick is a standalone skill that predates the workflow
> engine and doesn't go through `cp run`. What should we do with it?

**Options offered:**

- A. Refactor cp-quick to be a thin shim that calls cp-workflow-run
  quick internally **(recommended)**
- B. Deprecate cp-quick with a sunset notice
- C. Leave cp-quick alone as its own hardcoded skill

**User selected:** A (refactor to shim).

**Rationale:** Single execution path; users keep the familiar name; no
breaking change.

### Q4 — Fate of cp-autonomous

> Should v1.1 also refactor cp-autonomous to be a thin shim over
> cp-workflow-run dev, parallel to what we're doing with cp-quick?

**Options offered:**

- A. Yes — refactor cp-autonomous to call cp-workflow-run dev
  internally **(recommended)**
- B. No — leave cp-autonomous alone
- C. Partial — add a note/deprecation, don't refactor in v1.1

**User selected:** A (refactor to shim).

**Rationale:** Same reasoning as Q3. cp-autonomous is structurally a
milestone-bound workflow driver; collapsing onto `cp run dev` removes
the second execution path entirely.

### Discoverability follow-up

After Q1, the user added:

> by the way, if add a cp-run <workflow> skill for agent cli, should
> have a list workflow command as well so that customer knows what
> workflow available.

This was already in scope (cp-workflow-list in the full set) but
captured as an explicit requirement of the milestone.

## Design synthesis (presented and approved)

Presented as inline message in the same conversation, covering:

- Intent
- Architecture (5 new skills + 2 refactors, no CLI changes)
- Components and boundaries
- Data flow (skill → cp run → state files)
- Error handling (smart-gate reuse)
- Testing strategy (unit/dryrun/integration/back-compat)
- Phase breakdown (4 phases: 43 consumer, 44 creator, 45 refactor, 46 docs+release)

**User response:** "Approve — write the design doc and start
scaffolding."

## Key decisions captured

1. Five new `cp-workflow-*` skills under a unified prefix.
2. Refactor `cp-quick` and `cp-autonomous` to thin shims over the
   generic driver.
3. Zero CLI changes — skills are pure consumers of v1.0 surface.
4. Phase breakdown: 43 (consumer) / 44 (creator) / 45 (refactor) / 46
   (docs + release).
5. Back-compat tests in phase 45 to guard the shim refactor.
6. Coverage target unchanged (85% lines / 75% branches).

## Carry-forward to phase planning

- Each phase will produce its own PLAN.md via `cp scaffold-phase` (done
  during milestone scaffold).
- `/cp-plan-phase 43` is the next step.
- Refactor risk is concentrated in phase 45 — schedule extra REVIEW-LOG
  attention there.
