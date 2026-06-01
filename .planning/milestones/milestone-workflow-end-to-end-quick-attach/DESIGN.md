---
milestone_slug: "milestone-workflow-end-to-end-quick-attach"
milestone: Milestone workflow end-to-end + quick attach
status: accepted
created: 2026-05-31
updated: 2026-05-31
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
target_version: "1.8.0"
---

# Milestone workflow end-to-end + cp quick attach-by-name

**Slug:** `milestone-workflow-end-to-end-quick-attach`
**Target version:** v1.8.0
**Status:** accepted (brainstorm phase)
**Date:** 2026-05-31

---

## Problem

Two unrelated rough edges discovered while dogfooding the v1.7 workflow engine:

### 1. `milestone` workflow stops after planning

`templates/workflows/milestone.yaml` declares `materialize: roadmap-phases` and
`max_children: 10` on `propose-phases`, but defines no child phase template
under it. The result: running `cp run milestone "X"` plans the milestone
(brainstorm → propose-phases → finalize), writes rows into `ROADMAP.md`, and
**stops**. Execution of those rows is left to the user to drive manually via
`/cp-execute-phase` or `/cp-autonomous`.

This contradicts the v1.4 workflow contract, where a `materialize:
roadmap-phases` parent is supposed to fan out into N runtime children using
a `parent: <id>` child template (the same pattern `dev.yaml` uses for
`plan-execute` children of `propose-plans`). The validator already documents
this (see `test/unit-workflow-schema-v14.js:81-85`); only the template itself
is missing the children.

Symptom in the wild: the project ROADMAP now contains stale rows like
`### Phase 96: setup`, `### Phase 97: brainstorm`, etc. — bleed-through from
the milestone workflow's own internal phase ids being recorded as if they
were the children. This is the bug surfacing visibly.

### 2. `cp quick --project-path <path>` is awkward

The current attach flag for `cp quick` takes a filesystem path. Users want
to attach by **project name** (and optionally **milestone name**) instead.
Paths are noisy to type, environment-specific, and break when worktrees
move. Names are stable, short, and match how users actually refer to their
work.

There's also no discovery surface today: no `cp project list`, no
`cp milestone list`. So even path-based attach requires the user to remember
exactly where each project lives.

---

## Goal

1. The `milestone` workflow drives every ROADMAP row to commit + `SUMMARY.md`
   end-to-end, without the user manually invoking `/cp-execute-phase`.
2. Workflow validation hard-fails any `materialize: roadmap-phases` parent
   that doesn't have both `supervised: true` and at least one child phase
   template — so the milestone bug class cannot recur in user-authored
   workflows.
3. `cp quick` accepts `--project <name>` and `--milestone <name>`, resolving
   via a lightweight registry (projects) and on-disk glob (milestones).
   `cp project list` and `cp milestone list` make discovery trivial.
   `--project-path` keeps working with a deprecation warning.

---

## Scope

### Workstream A — Milestone workflow template fix

**File:** `templates/workflows/milestone.yaml`

- Add two new params to the `params:` block (matching `quick.yaml` 1:1):
  ```yaml
  - name: execute_skill
    default: "execute"
  - name: execute_role
    default: "developer"
  ```

- Add two child phases after `propose-phases`:

  ```yaml
  - phase:
      id: child-plan
      parent: propose-phases
      role: "{{plan_role}}"
      skill: "{{plan_skill}}"
      prompt: |
        Produce a detailed implementation plan for this ROADMAP phase.
        Write it to .planning/phases/<phase-id>/PLAN.md.

  - phase:
      id: child-execute
      parent: propose-phases
      after: [ child-plan ]
      role: "{{execute_role}}"
      skill: "{{execute_skill}}"
      prompt: |
        Execute the plan for this ROADMAP phase. Implement, verify,
        commit atomically. Write SUMMARY.md and mark the row complete
        in ROADMAP.md.
  ```

- Reuse existing `plan_skill` / `plan_role` for `child-plan` — do not
  introduce a parallel `write-plan-skill` param. Symmetric with `quick.yaml`.

- Add a **milestone-level `review` phase** between `propose-phases` and
  `finalize`. It runs once after all children have completed and asks
  the review agent to inspect and code-review the milestone's changes.
  New params (mirror `plan_*` / `execute_*`):

  ```yaml
  - name: review_skill
    default: "code-review"
  - name: review_role
    default: "reviewer"
  ```

  ```yaml
  - phase:
      id: review
      after: [ propose-phases ]
      role: "{{review_role}}"
      skill: "{{review_skill}}"
      prompt: |
        Review all changes made during this milestone. Run the code-review
        skill against the diff vs the milestone base commit. Summarize
        findings and flag any blockers before finalize.
  ```

  Note: per-child review (a `child-review` sibling of `child-execute`) is
  **deferred** to a later milestone. v1.8 covers milestone-level review only.

**Resolution on this machine** (superpowers provider):
- `plan` → `superpowers/writing-plans`
- `execute` → `superpowers/subagent-driven-development`
- `code-review` → `superpowers/requesting-code-review`

### Workstream B — Runtime + validator hardening

**Files:** `lib/workflow.js` (validator), `lib/checkpoint.js` (dispatch),
supervisor-prompt template.

1. **Validator: hard-fail bad `materialize: roadmap-phases` configurations.**
   - If a phase has `materialize: roadmap-phases`, the workflow MUST have
     `supervised: true`. Hard error: `"materialize: roadmap-phases requires
     supervised: true (no supervisor agent to dispatch children)"`.
   - That phase MUST have at least one phase with `parent: <its id>`.
     Hard error: `"materialize: roadmap-phases parent <id> has no child
     phase template (use parent: <id> on a child)"`.
   - Add unit tests for both failure cases AND for the corrected
     milestone.yaml passing.

2. **Supervisor dispatch contract.**
   - Verify whether the current supervisor (LLM) actually dispatches
     `parent:` children when a `materialize: roadmap-phases` parent
     completes. Today's wave-block prompt format is the contract.
   - If gap: update wave-prompt template to explicitly instruct the
     supervisor to spawn `<child-id>` waves for each ROADMAP row, in
     parallel where safe.
   - Document the contract in `commands/cp/cp-workflow-run.md` so it's
     visible to authors of new supervised templates.

3. **Status write-back to ROADMAP.**
   - When a child phase completes, the supervisor MUST tick the matching
     ROADMAP row and append a SUMMARY reference. May already work via
     existing `cp run mark-complete` plumbing — verify on the corrected
     milestone.yaml end-to-end.
   - Parallel children: each completion logs independently; order doesn't
     matter; documented in the supervisor contract.

### Workstream C — `cp quick` attach-by-name + project/milestone registry

**Files:** `bin/commands/quick.js`, `bin/commands/project.js` (new),
`bin/commands/milestone.js` (new or extended), `lib/registry.js` (new),
`commands/cp/quick.md`.

1. **Project registry:** `~/.config/cp/projects.json`
   ```json
   [
     {
       "name": "context-planning",
       "path": "C:\\src\\github\\context-planning",
       "registered_at": "2026-05-31T...",
       "last_seen_at": "2026-05-31T..."
     }
   ]
   ```
   - Project name = first H1 of `.planning/PROJECT.md`.
   - Auto-insert on `cp init`.
   - Auto-update `last_seen_at` on any `cp` invocation inside a project root.
   - Name collisions: error on `cp init`; suggest renaming the PROJECT.md H1.

2. **`cp project list`** — table of name, path, last seen.
   **`cp project rm <name>`** — remove a stale entry (does not touch disk).

3. **`cp milestone list`** (within current project) — table of slug, name,
   status (from ROADMAP), last activity. No registry needed; reads from
   `.planning/milestones/*/DESIGN.md`.

4. **`cp quick --project <name>`** — resolves via registry.
   - Exact name match (case-insensitive).
   - Error with candidate list on miss.

5. **`cp quick --milestone <value>`** — resolves within the resolved (or
   cwd's) project. Resolution order:
   1. Exact slug match (directory exists).
   2. Exact H1 name match (case-insensitive).
   3. Unique prefix match on slug OR name.
   4. No match or ambiguous → error with candidate list.

   Default when omitted: current milestone from `STATE.md`'s
   `<!-- cp:current-focus -->` block.

6. **`--project-path <path>` deprecation:**
   - Keeps working this release.
   - Runtime warning: `"--project-path is deprecated; use --project <name>
     instead. See: cp project list"`.
   - Slated for removal in v2.0.

7. **Docs:** revise `commands/cp/quick.md` to lead with the new flags; add
   a "Name resolution" section; document `cp project list` and
   `cp milestone list`.

---

## Out of scope (parked)

- `dev.yaml` issues (user flagged but didn't elaborate). Capture as an
  inbox item for future triage.
- ROADMAP cleanup of stale bleed-through rows (Phase 96–101, 86–91, etc.).
  Likely auto-resolves once workstream A lands; otherwise a follow-up
  quick task.
- Workflow chaining primitive (`chains_to: <workflow>`). Better long-term
  design for cross-workflow execution; defer to v1.9+.
- Cross-project navigation beyond `cp quick` (e.g., `cd $(cp project
  path foo)`). Could come later if the registry proves useful.

---

## Success criteria

1. `cp run milestone "X"` plans AND drives every ROADMAP row to commit +
   `SUMMARY.md` without the user manually invoking `/cp-execute-phase`.
2. `cp workflow validate` hard-fails a YAML with `materialize:
   roadmap-phases` that lacks `supervised: true` OR lacks a `parent: <id>`
   child template. Passes on corrected `milestone.yaml`.
3. `cp quick "thing" --project context-planning --milestone "v1.8
   hardening"` attaches correctly.
4. `cp quick "thing" --project-path C:\src\...\context-planning` still
   works but prints a deprecation warning.
5. `cp project list` and `cp milestone list` produce useful tables.
6. `npm test` passes (baseline: 122 → expected +~15 new assertions).

---

## Version target

**v1.8.0** — workflow-runtime semantics change (milestone now end-to-end) +
new flags + new commands. Minor bump per project convention.

---

## Open questions (to resolve during planning)

1. **Parallel child execution:** does the current supervisor run children
   sequentially or in parallel? If parallel, what's the safe concurrency
   ceiling for `cp quick`-grade tasks (file-write contention)?
2. **Registry write-locking:** concurrent `cp` invocations from multiple
   shells could race on `projects.json`. Use atomic write + file lock, or
   accept last-write-wins?
3. **Worktree handling:** if `cp` is invoked in a `git worktree` of a
   registered project, do we register the worktree as a separate entry or
   alias to the main? (Likely alias — name = PROJECT.md H1 is shared.)

These don't block design approval; they're for the planner.

## Brainstorm transcript

# Milestone Context — milestone-workflow-end-to-end-quick-attach

**Active milestone:** Milestone workflow end-to-end + cp quick attach-by-name
**Slug:** `milestone-workflow-end-to-end-quick-attach`
**Target version:** v1.8.0
**DESIGN.md:** `.planning/milestones/milestone-workflow-end-to-end-quick-attach/DESIGN.md`

## One-paragraph summary

Fix the milestone workflow so `cp run milestone "X"` actually drives every
planned ROADMAP row to commit + SUMMARY (today it stops after planning,
leaving execution to manual `/cp-execute-phase` calls). Add validator rules
that hard-fail any `materialize: roadmap-phases` parent missing
`supervised: true` or a `parent: <id>` child template, so this bug class
cannot recur. Separately, give `cp quick` a `--project <name>` /
`--milestone <name>` UX backed by a lightweight `~/.config/cp/projects.json`
registry and new `cp project list` + `cp milestone list` commands;
deprecate the existing `--project-path` flag.

## Three workstreams

- **A. Template fix** — milestone.yaml gains `child-plan` + `child-execute`
  children (mirrors quick.yaml) and `execute_skill` / `execute_role` params.
- **B. Runtime + validator hardening** — enforce supervised + has-children
  invariants; verify supervisor dispatch + ROADMAP write-back.
- **C. cp quick attach-by-name** — project registry, name resolution,
  `cp project list`, `cp milestone list`, deprecate `--project-path`.

## Why now

Surfaced by dogfooding v1.7. Symptom: ROADMAP currently has stale rows
(`Phase 96: setup`, `Phase 97: brainstorm`, etc.) from the milestone
workflow's internal phase ids leaking through — visible proof that the
fan-out isn't happening.
