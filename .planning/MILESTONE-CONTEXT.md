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
