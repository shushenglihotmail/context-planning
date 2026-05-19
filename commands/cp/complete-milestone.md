---
name: cp-complete-milestone
description: Close out a milestone — verify all phases done, roll up SUMMARYs, collapse in ROADMAP, archive to MILESTONES.md.
argument-hint: "<milestone name, optional — defaults to current>"
requires: []
---

# /cp-complete-milestone

You are running `cp-complete-milestone`. A milestone has finished all its
phases; your job is to archive it cleanly so the project state shows the
milestone shipped and the next milestone has a clean slate.

**This command is destructive in the GSD-compatible way:** it COLLAPSES the
shipped phases inside `<details>` in ROADMAP.md (does NOT delete them),
APPENDS a digest to MILESTONES.md, and DELETES `.planning/MILESTONE-CONTEXT.md`
(since GSD treats this file as transient per-milestone).

## TL;DR — use the `cp` CLI wrapper

The entire 7-step close-out is wrapped by **`cp complete-milestone`**. The
wrapper handles verification, digest aggregation, ROADMAP collapse,
MILESTONE-CONTEXT deletion, STATE reset, AND the atomic git commit.

**Recommended flow:**

```bash
# 1. Confirm what's about to change (no writes)
cp complete-milestone --dry-run "$MILESTONE_NAME"
# (omit name to use the current in-progress milestone)

# 2. Show the user the action plan and the rendered digest preview
#    (Get the rendered digest from MILESTONES.md after the dry-run? No —
#     dry-run doesn't write. Use --json to get the agg object and render
#     a preview inline, OR just describe the actions list and run real.)

# 3. Run real
cp complete-milestone "$MILESTONE_NAME"

# 4. Confirm
cp status        # should now show "(none in-progress)" for milestone
```

**Exit-code contract:**
- `0` → milestone successfully closed (or dry-run produced an action list)
- `1` → blocking error (incomplete phases, missing SUMMARYs, milestone not found, etc.)

If the wrapper fails, read the structured error and tell the user exactly
which phase / plan / SUMMARY is missing.

## Step 1 — Resolve the milestone name

- If `$ARGUMENTS` is provided, use it as the milestone name.
- Else, read `.planning/MILESTONE-CONTEXT.md` and pull its name.
- Else, let `cp complete-milestone` (with no arg) detect the current
  in-progress milestone via `cp status`.
- If `cp` returns `reason: no-current-milestone`, stop and ask the user.

## Step 2 — Dry-run preview

```bash
cp complete-milestone --dry-run [<milestone name>]
```

The CLI prints:
```
Milestone:   v0.1 MVP
Phases:      1, 2
Subsystems:  storage, search
Files:       5 created, 1 modified

Actions (dry-run):
  ✓ write  .planning\MILESTONES.md
  ✓ write  .planning\ROADMAP.md
  ✗ delete .planning\MILESTONE-CONTEXT.md
  ✓ write  .planning\STATE.md
```

If `--dry-run` exits non-zero, the milestone isn't complete — `cp` lists
which phases still have unticked plans or missing SUMMARYs. Tell the user
and stop; suggest `/cp-execute-phase {N}` for any incomplete phase.

## Step 3 — Show the user; ask for sign-off

Present the action list + a short summary (which milestone, how many
phases, what subsystems). Ask for explicit confirmation. **Do not auto-run
the real `cp complete-milestone` without it.**

## Step 4 — Run for real

```bash
cp complete-milestone [<milestone name>]
```

The CLI does everything atomically:
1. Verifies every phase has all plans `[x]` and a SUMMARY on disk.
2. Reads + aggregates every SUMMARY frontmatter (union-and-dedupe of
   `subsystem`, `tags`, `requires/provides/affects`, `tech-stack`,
   `key-files`, `key-decisions`, `patterns-established`,
   `requirements-completed`).
3. Renders the milestone digest (heading, requirements delivered,
   subsystems touched, key decisions/patterns with phase tags, files
   created/modified, phase-summary links).
4. Appends the digest to `.planning/MILESTONES.md` (preserves prior
   content; adds blank line before the new entry).
5. Collapses the milestone in `.planning/ROADMAP.md` — wraps the
   `### {emoji} {name} (In Progress)` heading and every `### Phase N: ...`
   block inside a single `<details>` element with
   `<summary>✅ {name} (Phases X-Y) — SHIPPED {today}</summary>`.
   Preserves every phase block byte-for-byte for GSD round-tripping.
6. Deletes `.planning/MILESTONE-CONTEXT.md` if present.
7. Resets `.planning/STATE.md` Current Position to `Idle`, Last activity
   to `shipped {milestone}`, Session Continuity Stopped at →
   `shipped {milestone}`.
8. Runs `git add -A && git commit -m "cp: /cp-complete-milestone {name}"`
   (unless `--no-commit` is passed).

The CLI prints the actions list and the commit hash.

## Step 5 — Report

After the wrapper completes, print:

```
✓ Milestone "{name}" shipped.
  Phases:        X-Y ({plan count} plans)
  Archived to:   .planning/MILESTONES.md
  Roadmap:       collapsed inside <details>
  Cleared:       .planning/MILESTONE-CONTEXT.md
  Committed:     {short hash}

Next:
  /cp-new-milestone "{suggested next}"   # start the next milestone
  cp status                              # confirm the new "you are here"
```

## Fallback — when `cp` CLI is not available

If `cp` is not on PATH (e.g. the user installed cp into a harness without
the Node CLI), drive the same flow by calling the lib functions directly.
**Beware of the lib contracts** — these were the bugs the wrapper hides:

- `milestone.aggregateSummaries(summaries)` takes `[{fm, phaseNum}]`
  — NOT raw strings. Use `milestone.readSummaries(phaseNums, root)` to
  build that shape.
- `milestone.collapseMilestoneInRoadmap(content, name, isoDate)` returns
  `{content, changed, reason?}`. Always use `.content`.
- `milestone.renderDigest(name, isoDate, phaseNums, agg, phaseNames)` —
  positional args, not an options object.
- SUMMARY frontmatter uses **kebab-case**: `subsystem` (singular!),
  `key-files.{created,modified}`, `key-decisions`,
  `patterns-established`, `requirements-completed`, `tech-stack.added`.
- `state.updatePosition(content, opts)` takes `content`, NOT a path.
- Append to `MILESTONES.md` AFTER all other edits succeed, so a mid-flight
  failure leaves the archive intact.

## Notes

- **GSD-compat hard contract:** do NOT change phase numbering, do NOT
  remove any phase block, do NOT alter frontmatter inside SUMMARY/PLAN
  files. Everything stays parseable by GSD's `gsd-complete-milestone`.
- This command is the only one in cp that DELETES a file
  (`MILESTONE-CONTEXT.md`). Show the user the dry-run actions list before
  running real.
- If the user wants to undo, the atomic commit makes `git revert HEAD` a
  one-shot rollback.
