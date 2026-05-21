---
# Tier marker: cp scaffold substitutes one of:
#   phase: "18"     (for phase-tier DESIGN.md)
#   milestone_slug: "v0-8-consistency"  (for milestone-tier DESIGN.md)
phase: "18"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [sli]
supersedes: []
superseded_by: null
---

# Design: Phase 18: Auto key-files at write-time

## Status

Accepted on 2026-05-21. Depends on Phase 17 (SHA pinning foundation),
which is shipped.

## Context

The single biggest cause of `.planning/` ↔ code drift identified in
brainstorming was **drift cause #1 — forgetful executor**: a plan
modifies files A, B, C, but the SUMMARY's `key-files` list only
mentions A and B because the executor forgot C. This silently breaks
every downstream audit, milestone aggregation, and future-phase
context-selection.

Phase 17 (SHA pinning) now stamps `base-commit` on PLAN.md and
`end-commit` on SUMMARY.md. That makes "what files actually changed
during phase N" a single deterministic git diff:
`git diff --name-only <base-commit>..<end-commit>`.

We can use this to auto-fill `key-files` at write-summary time so the
executor never has to remember.

Brainstorm Q2 locked the UX:
- Default ON (silent auto-fill)
- Opt-out via `--no-auto-key-files`
- One-line stdout notice when auto-fill triggers
- Caller-supplied `key-files` entries are preserved and merged
  (not overwritten)

## Decision

Add an auto-key-files step to `lib/milestone.js::writeSummary` (and the
mirror in `lib/lifecycle.js::writeSummary`) that:

1. Reads `base-commit` from the phase's PLAN.md frontmatter.
2. Reads the `end-commit` it's about to stamp (from `git.headSha()`,
   computed once before the existing stamping path).
3. Runs `git diff --name-only <base>..<end>` via a new
   `lib/git.js::diffNameOnly(base, end, opts?)` helper.
4. Partitions the result into "created" vs "modified" by checking
   each path's status via `git diff --name-status` (or by examining
   whether the file existed at `base`).
5. Merges the result into `normalised['key-files']`, **union-style**:
   - Caller-supplied entries always preserved (de-duped).
   - Auto-discovered entries appended only if not already present.
6. If at least one auto-fill happened, emits a one-line stderr notice:
   `cp: key-files auto-filled (N files: K created, M modified)`.
   (Stderr, not stdout — keeps stdout clean for `--from -` JSON pipes.)
7. If `options.autoKeyFiles === false`, skip the whole step (used by
   `cp write-summary --no-auto-key-files`).
8. If `base-commit` is missing on PLAN.md (pre-v0.8 phase or non-git
   dir at scaffold time), skip silently — fall back to caller-supplied
   `key-files` only.

`.planning/` paths are filtered out — they're cp's own state, not
phase deliverables, and including them would cause noise on every
SUMMARY.

## Consequences

### Positive
- Drift cause #1 disappears for users on the default path. The
  executor literally can't forget — git remembers.
- One-line stderr notice gives feedback without prompting (per Q2
  decision); preserves automation friendliness.
- Caller-supplied entries take precedence, so manual overrides (e.g.
  "we deleted X but I want to keep it listed for traceability") work.
- The `.planning/` filter keeps noise out of `key-files`.

### Negative
- Adds one extra git invocation per `cp write-summary` call. Cheap
  (low ms) — not in any hot loop.
- Files moved via `git mv` show as deletion + creation in
  `--name-status`; treated as `modified` in our merge (deletion path
  preserved in `key-files.modified` array). Acceptable for v0.8;
  Phase 24 audit will surface deletes as a separate finding type.

### Neutral
- `--no-auto-key-files` flag exists as escape hatch but is expected
  to be rarely used.

---

## Architecture

```
                            ┌──────────────────────────┐
   cp write-summary 18-NN  ─►  lib/milestone.js        │
                            │   writeSummary           │
                            │                          │
                            │   1. read PLAN.md FM     │
                            │      → base-commit       │
                            │                          │
                            │   2. headSha(root)       │
                            │      → end-commit        │
                            │                          │
                            │   3. diffNameOnly(b, e)  │
                            │      → [{path, status}]  │
                            │                          │
                            │   4. filter .planning/   │
                            │                          │
                            │   5. merge into          │
                            │      normalised.key-files│
                            │      (union, caller wins)│
                            │                          │
                            │   6. one-line stderr     │
                            │      notice (if added)   │
                            │                          │
                            │   7. existing            │
                            │      end-commit stamping │
                            │      + fm.stringify      │
                            └──────────────────────────┘
```

## Components

| Unit | Purpose | Public interface | Depends on |
|---|---|---|---|
| `lib/git.js::diffNameOnly(base, end, opts?)` | Returns `[{ path, status: 'A'\|'M'\|'D' }]` from `git diff --name-status base..end`. Returns `[]` if base/end null, or empty on error. Never throws. | `diffNameOnly(base: string, end: string, opts?: { cwd?: string }) → Array<{path, status}>` | child_process spawnSync |
| `lib/milestone.js::_extractPhaseBaseCommit(phaseDir)` | Pure helper: reads phase PLAN.md, returns `base-commit` value or null | `_extractPhaseBaseCommit(phaseDir: string) → string\|null` | `lib/frontmatter.js::parse` |
| `lib/milestone.js::_autoFillKeyFiles(normalised, root, phaseDir, endSha, opts?)` | Mutates `normalised['key-files']` in-place by union-merging git-diff entries. Returns `{ added: number, created: [], modified: [] }` for the notice. | (internal) | `git.diffNameOnly`, `_extractPhaseBaseCommit` |
| `lib/milestone.js::writeSummary` ext | Wires `_autoFillKeyFiles` into the flow; emits one-line stderr notice | (none — internal) | above |
| `lib/lifecycle.js::writeSummary` ext | Mirror for the internal helper path | (none — internal) | above |
| `bin/commands/write-summary.js` ext | Parses `--no-auto-key-files` flag, passes `{ autoKeyFiles: false }` | CLI flag | the lib paths |

## Data Flow

**Happy path (default on):**
1. User runs `cp write-summary 18-01 --from /tmp/sum.json`.
2. CLI calls `milestone.writeSummary(root, '18-01', data, { ... })`.
3. writeSummary normalises, backfills, then enters auto-key-files step:
   a. `_extractPhaseBaseCommit` reads PLAN.md → `base-commit: abc123`.
   b. `headSha(root)` → `end-commit: def456` (used both for autofill diff
      AND for the existing end-commit stamping, computed once).
   c. `diffNameOnly('abc123', 'def456', { cwd: root })` returns
      `[{path: 'lib/foo.js', status: 'A'}, {path: 'lib/bar.js', status: 'M'}]`.
   d. Filter out any path starting with `.planning/`.
   e. `normalised['key-files']` starts as `{ created: [], modified: [] }`
      (or whatever caller supplied). Merge:
      - Add `lib/foo.js` to `created` if not already there.
      - Add `lib/bar.js` to `modified` if not already there.
   f. 2 entries added → write to stderr:
      `cp: key-files auto-filled (2 files: 1 created, 1 modified)`
4. Existing end-commit stamping → fm.stringify → disk write.

**Opt-out path (`--no-auto-key-files`):**
1-2. As above.
3. writeSummary skips step a–f entirely. Caller-supplied `key-files`
   is the only source.
4. As above.

**Pre-v0.8 phase / non-git path:**
1-2. As above.
3a. `_extractPhaseBaseCommit` returns null (no `base-commit` field).
3b. Skip the diff. No notice. No merge.
4. As above.

## Error Handling

| Failure | Behavior |
|---|---|
| `base-commit` missing on PLAN.md | Skip auto-fill silently. No notice. |
| `headSha` returns null at write time | Skip auto-fill silently. (The existing end-commit stamping also gets skipped — already handled in Phase 17.) |
| `git diff` non-zero exit (e.g., base SHA no longer exists in repo) | Treat as empty diff. No notice. Caller-supplied entries written as-is. Phase 24 audit will surface this as a finding. |
| `git diff` returns no entries | No notice (silent on no-op). |
| Path contains exotic characters | `git diff -z --name-status` (NUL-separated) used to be robust to spaces/quotes/unicode. |
| Caller supplied `key-files.created = ['lib/foo.js']` and git diff also reports it | De-dupe in merge — entry appears once. |

## Testing Strategy

| Test | Coverage | File |
|---|---|---|
| `diffNameOnly` returns `[{path, status}]` for staged + committed changes | unit | `test/unit-git-sha.js` (extend, ~6 assertions) |
| `diffNameOnly` returns `[]` on bad SHA | unit | same |
| `diffNameOnly` handles paths with spaces / unicode (NUL-separated parser) | unit | same |
| `_extractPhaseBaseCommit` returns null when PLAN.md absent / has no base-commit | unit | `test/unit-lifecycle.js` (~3 assertions) |
| writeSummary auto-fills key-files (default on) and emits stderr notice | unit | `test/unit-lifecycle.js` (~6 assertions) |
| writeSummary skips auto-fill when `autoKeyFiles: false` | unit | same (~2 assertions) |
| writeSummary preserves caller-supplied key-files (union merge, de-dupe) | unit | same (~3 assertions) |
| writeSummary skips auto-fill when PLAN.md has no base-commit | unit | same (~2 assertions) |
| `.planning/` paths are filtered out | unit | same (~2 assertions) |
| CLI `--no-auto-key-files` flag passes through correctly | dryrun | `test/dryrun-write-summary.js` (new, ~3 assertions) |

Target: +~27 test assertions (suite goes from ~860 → ~887).

## Alternatives Considered

### Option A — Prompt user to confirm auto-fill

**Pros:** Most cautious.

**Cons:** Breaks non-interactive `--from` / pipe usage. Slows the
common case. User already approved silent default in Q2.

**Verdict:** rejected per Q2 brainstorm decision.

### Option B — Auto-fill at `cp tick` time instead

**Pros:** Per-plan granularity.

**Cons:** `cp tick` ticks a plan checkbox; it doesn't write
SUMMARY.md (SUMMARY lives at the plan level too but is written by
`cp write-summary`). Auto-fill belongs where SUMMARY is written.

**Verdict:** rejected.

### Option C — Use `git status --porcelain` (working-tree state)

**Pros:** Picks up uncommitted changes too.

**Cons:** Indeterministic (depends on whether user staged everything).
Phase 17 chose committed-only deterministic diffs. Phase 18 should
match. Uncommitted changes will be picked up by Phase 27's pre-commit
hook when they're committed.

**Verdict:** rejected.

## Open Questions

- [ ] Should we also auto-fill `tags` from filename patterns
      (e.g., `lib/*.js` → tag `lib`)? Defer to v0.9 — adds heuristic
      magic without clear consistency benefit.
- [ ] Should we surface a notice when caller-supplied `key-files`
      diverges from git-diff (e.g., caller said `foo.js`, git says
      `bar.js`)? Defer to Phase 24 audit — same problem.

## References

- Milestone DESIGN: `.planning/milestones/v0-8-consistency/DESIGN.md`
  (Architecture diagram middle box; Components row 18)
- Brainstorm transcript: `.planning/MILESTONE-CONTEXT.md` (Q2: auto
  key-files UX)
- Phase 17 SUMMARY: `.planning/phases/17-sha-pinning-foundation/
  17-02-SUMMARY.md` (end-commit pattern + dogfood proof)
- Existing key-files normalisation: `lib/milestone.js::_normaliseSummary`
  (lines ~440-470; `files_created` / `files_modified` aliases)
