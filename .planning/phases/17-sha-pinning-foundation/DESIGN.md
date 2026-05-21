---
# Tier marker: cp scaffold substitutes one of:
#   phase: "17"     (for phase-tier DESIGN.md)
#   milestone_slug: "v0-8-consistency"  (for milestone-tier DESIGN.md)
phase: "17"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [sli]
supersedes: []
superseded_by: null
---

# Design: Phase 17: SHA pinning foundation

## Status

Accepted on 2026-05-21. Foundation phase for v0.8 Consistency milestone —
every other phase (18-31) depends on the frontmatter fields established here.

## Context

The milestone DESIGN.md (`.planning/milestones/v0-8-consistency/DESIGN.md`)
identifies SHA pinning as the lynchpin: it converts "what changed in
phase N?" from a fuzzy `git log --since=<SUMMARY-mtime>` heuristic into
a deterministic `git diff base-commit..end-commit` query.

Without it, all downstream detection (P8 audit) and repair (P9 audit --fix,
P10 reconcile) suffer from false positives whenever:
- multiple phases progress in parallel (worktrees)
- commits happen between `cp write-summary` runs without `cp tick`
- a `git rebase` or `git cherry-pick` reorders history

## Decision

Add two optional git-SHA fields to PLAN.md and SUMMARY.md frontmatter:

| Field | Lives on | Stamped by | Stamped to |
|---|---|---|---|
| `base-commit: <sha>` | PLAN.md | `cp scaffold-phase` | `git rev-parse HEAD` at scaffold time |
| `end-commit: <sha>` | SUMMARY.md | `cp write-summary` | `git rev-parse HEAD` at write-summary time |

Both fields are **optional and forward-only**: pre-v0.8 phases keep null
values; downstream code treats null as `confidence: low` and falls back
to the v0.7 heuristic. No migration of existing files.

A new pure helper `lib/git.js::headSha()` wraps `git rev-parse HEAD` with
graceful no-git fallback (returns null + emits one-line warning, never
throws). Co-located with the existing `lib/git.js` helpers used by
`lib/worktree.js`.

## Consequences

### Positive
- Every cp operation that needs "what changed in phase N" becomes a single
  deterministic git diff invocation — no heuristics, no false positives.
- Forward-only compatibility means zero breaking-changes for existing v0.7
  users; nothing to migrate.
- The frontmatter shape stays YAML — readable in any editor, parseable by
  every existing cp helper without schema changes elsewhere.

### Negative
- One more frontmatter key per phase. Mitigated by being optional.
- If `git` is unavailable, the field stays null and downstream confidence
  drops. Mitigated by clear `confidence: low` tagging in audit output.

### Neutral
- No change to ROADMAP.md, PROJECT.md, STATE.md shapes — purely a
  phase-artefact frontmatter addition.

---

## Architecture

```
                  ┌────────────────────────┐
   cp scaffold-phase 17 ──────────────────►│ lib/git.js::headSha()  │
                  │                        │   └─ git rev-parse HEAD │
                  │                        └────────────┬───────────┘
                  │                                     │
                  ▼                                     ▼
   .planning/phases/17-…/PLAN.md            base-commit: abc123…
   frontmatter rewritten in-place


                  ┌────────────────────────┐
   cp write-summary 17 ───────────────────►│ lib/git.js::headSha()  │
                  │                        └────────────┬───────────┘
                  ▼                                     │
   .planning/phases/17-…/17-01-SUMMARY.md               ▼
   frontmatter rewritten in-place             end-commit: def456…
```

## Components

| Unit | Purpose | Public interface | Depends on |
|---|---|---|---|
| `lib/git.js::headSha(opts?)` | Get current git HEAD SHA or null | `headSha({ cwd?: string }) → string \| null` | `child_process` |
| `lib/lifecycle.js::scaffoldPhase` ext | Stamp `base-commit` into new PLAN.md frontmatter | (internal) | `lib/git.js::headSha` |
| `lib/milestone.js::writeSummary` ext | Stamp `end-commit` into SUMMARY.md frontmatter | (internal) | `lib/git.js::headSha` |
| `templates/phase-PLAN.md` schema | Add optional `base-commit:` line in frontmatter (commented if unstamped) | (template) | (none) |
| `templates/SUMMARY.md` schema | Add optional `end-commit:` line in frontmatter | (template) | (none) |

## Data Flow

**On `cp scaffold-phase 17`:**
1. Existing code: create phase dir, write PLAN.md/DESIGN.md/REVIEW-LOG.md, append to ROADMAP, commit.
2. New: between step 1's PLAN.md template render and the commit, call `headSha()`.
3. If non-null, rewrite PLAN.md frontmatter with `base-commit: <sha>`.
4. If null (no git), leave frontmatter without the key (it's optional).

**On `cp write-summary 17`:**
1. Existing code: validate, render SUMMARY.md, run hard-blocks, commit.
2. New: between SUMMARY.md render and the commit, call `headSha()`.
3. Rewrite SUMMARY.md frontmatter with `end-commit: <sha>`.

## Error Handling

| Failure | Behavior |
|---|---|
| `git` not on PATH | `headSha()` returns null; warning to stderr "cp: git not found — SHA pinning skipped"; PLAN/SUMMARY written without the field |
| Repo is not a git repo | `headSha()` returns null; same warning; same outcome |
| HEAD is detached but valid | `headSha()` returns the SHA normally |
| Repo has no commits yet | `git rev-parse HEAD` fails; `headSha()` returns null |
| Re-running scaffold-phase on an existing phase | Phase 22 (prior-summary check) will block this anyway; for now no special handling — operation continues to be refused as it is in v0.7 |

## Testing Strategy

| Test | Coverage | File |
|---|---|---|
| `headSha` returns string in a git repo | unit | `test/unit-git-sha.js` (new, ~5 assertions) |
| `headSha` returns null with no git binary (mock PATH) | unit | same |
| `headSha` returns null in non-git dir | unit | same |
| `scaffoldPhase` writes `base-commit` to frontmatter in git repo | unit | extends `test/unit-lifecycle.js` (~5 assertions) |
| `scaffoldPhase` omits `base-commit` cleanly when `headSha` returns null | unit | extends `test/unit-lifecycle.js` (~3 assertions) |
| `writeSummary` writes `end-commit` to frontmatter | unit | extends `test/unit-milestone.js` (~5 assertions) |
| Existing v0.7 PLAN/SUMMARY without these keys still parse | unit | extends round-trip test (~2 assertions) |

Target: +~25 test assertions (suite goes from 750 → ~775 after phase 17).

## Alternatives Considered

### Option A — Stamp via `git notes`

**Pros:** Doesn't touch frontmatter; SHA stays in git, not markdown.

**Cons:** `git notes` is obscure, not committed by default, lost on
`git push` without `--push-options`. Defeats the "everything in
`.planning/` is reviewable diff" principle.

**Verdict:** rejected.

### Option B — Auto-backfill historical phases on first run

**Pros:** Uniform shape across the whole repo immediately.

**Cons:** Heuristic and lossy (best-effort timestamps). Would surprise
existing users with a silent rewrite of `.planning/`.

**Verdict:** rejected for phase 17 — provided as opt-in
`cplan reconcile --infer-shas` in phase 29 instead.

### Option C — Stamp at every `cp tick`

**Pros:** Finest granularity (per-plan SHAs).

**Cons:** Plans tick in any order; multiple ticks per commit produce
ambiguity. Per-phase is the right granularity since SUMMARY.md is the
audit unit.

**Verdict:** rejected.

## Open Questions

- [ ] Should `headSha()` cache its result within a single cp command
      invocation? Defer — not needed for phase 17, may matter when audit
      calls it across many phases.
- [ ] Should we also stamp `base-commit` on `cp scaffold-milestone`?
      Probably yes — milestone-level pinning enables milestone-wide
      diffs. Defer to phase 23 (complete-milestone audit gate) when
      milestone-level audit lands.

## References

- Milestone DESIGN: `.planning/milestones/v0-8-consistency/DESIGN.md`
  (Architecture diagram top box; Components row 17; Data Flow happy-path)
- Brainstorm transcript: `.planning/MILESTONE-CONTEXT.md` (Q1 SHA pinning
  backward compatibility)
- Prior git shell-out pattern: `lib/worktree.js::runGitWorktreeAdd`
  (basis for `headSha` style — pure helper, no globals, returns
  primitive value)
