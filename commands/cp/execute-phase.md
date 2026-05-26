---
name: cp-execute-phase
description: Execute a planned phase by handing PLAN.md to the provider's execute skill, then record SUMMARY.md and update STATE.md/ROADMAP.md.
argument-hint: "<phase number>"
requires: []
---

# /cp-execute-phase

You are running `cp-execute-phase`. PLAN.md exists; your job is to drive it
through to a green build and atomic commits via the configured workflow
provider, then record the result back into the state layer.

**The state-layer bookkeeping is wrapped by `cp tick` and
`cp write-summary`** — you don't need to touch `lib/roadmap.setPlanDone` or
write SUMMARY files by hand. Use the wrappers; they validate frontmatter,
keep ROADMAP + phase PLAN.md in sync, and commit atomically.

## Step 1 — Resolve the phase + plan

- `PHASE_NUM` = `$ARGUMENTS` (digits only, optionally `N.M`).
- Run `cp status --json` to confirm the milestone, current phase, and the
  **next pending plan** (`.nextPlan.planId`). If `nextPlan` is null, all
  plans in this phase are done — suggest `/cp-autonomous` (drives the
  next phase) or `/cp-complete-milestone`.
- If `cp status` reports a *different* phase than `PHASE_NUM`, ask the user
  whether to switch.
- Read the phase's `PLAN.md` and each `{NN-MM}-PLAN.md` per-plan file to
  pull tasks + acceptance criteria. Read the milestone's ROADMAP block for
  Goal / Success Criteria / Requirements.

## Step 2 — Set the start markers

Update PLAN.md frontmatter for the current plan: add `status: in-progress`,
`started: {ISO timestamp}`. Update STATE.md is OPTIONAL here — the wrappers
in steps 6-7 will reset it correctly on completion.

If `cp.behavior.atomic_commits` is true, commit:
```
cp: start {phase}-{plan} execution
```

## Step 3 — Resolve the execute skill

```bash
cp doctor
```

Find the resolved `execute` role under "Roles -> resolved skill":

- Default: Superpowers' `subagent-driven-development` — fires one fresh
  subagent per task with two-stage review.
- Alternative: Superpowers' `executing-plans` (simpler batch execution).
- If the resolved provider is `manual`: walk through each task one at a
  time, confirming intent, doing the work, running verification, committing.

## Step 4 — Delegate execution

Invoke the execute skill with:
- The current plan's `{phase}-{plan}-PLAN.md` as the work plan
- The phase Goal, Success Criteria, and Requirements as the must-haves
- An instruction: each task gets an atomic commit using Conventional
  Commits style (feat/fix/refactor/test/docs), prefixed with
  `({phase}-{plan}) ` (e.g. `feat(01-02): add JWT verifier`).

The execute skill OWNS what happens during the work — TDD, verification,
code review between tasks, deviations. Do not intervene unless it returns
control.

## Step 4.5 — Append to REVIEW-LOG.md (v0.7)

After EACH review cycle returned by SP `subagent-driven-development`
(spec-compliance OR code-quality), append one block to
`.planning/phases/{phase-dir}/REVIEW-LOG.md` BEFORE the
`<!-- REVIEW-LOG-ENTRIES-BELOW -->` marker is irrelevant — APPEND after
the marker:

```
## {{DATE}} {{TIME}} — Plan {{PLAN-ID}} Task {{TASK-N}} — {{REVIEWER-ROLE}}

**Verdict:** {approved | rejected | needs-revision}

**Findings:**

- {bullet list of substantive findings}

**Resolution:**

{what changed; commit SHA if applied; "N/A — accepted on first pass" allowed}

---
```

Skip empty findings on clean approvals (use "Resolution: approved on
first pass" and omit findings bullet list).

If the file does not exist (older milestones), create it from
`templates/REVIEW-LOG.md` with substituted frontmatter first.

The cp aggregator counts these entries (via `aggregateSummaries`
`reviewCount`) when rolling up the milestone summary.

## Step 5 — Verify Success Criteria

When the execute skill reports the plan complete:

1. Verify Success Criteria from ROADMAP.md actually hold. (Ask the
   provider's `verify` skill, e.g. `verification-before-completion`, or
   do an inline check.)
2. If any criterion fails: **do not** tick or write SUMMARY. Tell the user
   and pause for instructions.

## Step 6 — Write SUMMARY with `cp write-summary`

Collect the per-plan facts into a JSON blob, then call:

```bash
cp write-summary {phase}-{plan} --from /tmp/summary-{phase}-{plan}.json [--body /tmp/summary-{phase}-{plan}-body.md]
```

The CLI:
- Writes to `.planning/phases/{phase-dir}/{phase}-{plan}-SUMMARY.md`
  (correct GSD-compatible filename — NO slug in the middle).
- Validates and **normalises both kebab-case AND snake_case** field names
  (`subsystem`/`subsystems`, `key-files.created`/`files_created`,
  `requirements-completed`/`requirements_completed`,
  `key-decisions`/`key_decisions`, etc.).
- Backfills `phase`, `plan`, and `completed` if absent.

Required JSON fields (kebab-case canonical names — snake_case also accepted):

```json
{
  "subsystem": "<pick one: auth, payments, ui, api, database, infra, testing, docs, tooling — ask user if ambiguous>",
  "tags":      ["jwt", "prisma", "react"],
  "requires":  ["..."],
  "provides":  ["..."],
  "affects":   ["src/..."],
  "tech-stack": { "added": ["..."], "patterns": ["..."] },
  "key-files":  { "created": ["..."], "modified": ["..."] },
  "key-decisions":         ["decision 1", "decision 2"],
  "patterns-established":  ["pattern 1"],
  "requirements-completed":["REQ-04"],
  "duration": "32min"
}
```

The body markdown file should contain the human-readable
**Accomplishments / Task Commits / Files Created / Decisions Made /
Deviations / Issues / Next Phase Readiness** sections — derive from
`git log --oneline {start_sha}..HEAD` and `git diff --name-only`.

After `cp write-summary` succeeds, update the per-plan PLAN.md frontmatter:
`status: complete`, `completed: {ISO ts}`.

## Step 7 — Tick the plan with `cp tick`

```bash
cp tick {phase}-{plan}
```

The CLI:
- Marks the plan `[x]` in BOTH `.planning/ROADMAP.md` AND
  `.planning/phases/{phase-dir}/PLAN.md` (one command, not two).
- Idempotent — no-op if already ticked.
- Commits as `cp: tick plan {phase}-{plan}` (pass `--no-commit` to skip).

## Step 8 — Status check + next step

```bash
cp status
```

If `cp status` shows another pending plan in the same phase:
```
Next:     /cp-execute-phase {N}    # continues with next plan
```

If `nextPlan` is null for this phase but other phases remain pending:
```
Next:     /cp-autonomous           # auto-drive remaining phases
```

If all plans across all phases are done:
```
Next:     /cp-complete-milestone   # ship it!
```

## Step 9 — Report

```
✓ Plan {phase}-{plan} complete: {phase name}
  Duration: {X} min, {tasks} tasks, {files} files
  SUMMARY:  .planning/phases/{phase-dir}/{phase}-{plan}-SUMMARY.md
  Next:     {derived from `cp status` in Step 8}
```

## Fallback — when `cp` CLI is not available

If `cp` is not on PATH, write the SUMMARY manually using the exact
filename `{phase}-{plan}-SUMMARY.md` (NOT `{phase}-{plan}-{slug}-SUMMARY.md`)
and tick the plan in BOTH `ROADMAP.md` AND the phase `PLAN.md` using
`lib/roadmap.setPlanDone(content, '{phase}-{plan}', true)`. Frontmatter
**must** use kebab-case canonical names (`subsystem` singular,
`key-files.created`, etc.) for `aggregateSummaries` to pick them up at
milestone close.

## Notes

- Never write SUMMARY.md if Success Criteria aren't met.
- If the execute skill pauses mid-task, leave PLAN.md `status: in-progress`
  so the user can resume by re-invoking `/cp-execute-phase {N}`.
- Don't re-implement the execute skill. Delegate. Your job is the state
  layer + bookkeeping.
- Filenames are GSD-compatible: `{phase}-{plan}-PLAN.md` and
  `{phase}-{plan}-SUMMARY.md`. The `cp` wrappers enforce this.
- Frontmatter is the canonical cross-tool interop surface — GSD's
  gsd-planner relies on these fields, so populate them faithfully. The
  `cp write-summary` wrapper validates this.
