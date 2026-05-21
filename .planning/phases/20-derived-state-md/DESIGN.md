---
phase: "20"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [sli]
supersedes: []
superseded_by: null
---

# Design: Phase 20: Derived STATE.md

## Status

Accepted on 2026-05-21. Fourth "prevent" phase of v0.8 Consistency.
Addresses drift cause #2: "Stale STATE — STATE.md says Phase 11 but
ROADMAP shows Phase 16 done".

## Context

STATE.md currently has two kinds of content tangled together:

| Kind | Examples | Source of truth |
|---|---|---|
| **Derivable** | Current Position (Phase, Plan, Status, Current focus, Progress %) | ROADMAP.md + phase dirs |
| **Curated** | Recent Decisions, Pending Todos, Blockers, Quick Tasks, Session Continuity | user-written |

The derivable parts are currently mutated by every cp lifecycle command
(`scaffoldPhase`, `tickPlan`, `writeSummary`, `completeMilestone`)
via `state.updatePosition` + `state.updateProgressBar` calls. This is
the #2 drift source:

- User pulls colleague's commits → STATE.md shows old phase
- `cp tick` runs but `auto_update_state_after_phase` toggle is off
- Manual edit to ROADMAP without a cp command
- Worktree A's STATE collides with worktree B

`statusReport()` (`lib/lifecycle.js`) already derives the correct
position from ROADMAP + phase dirs every time it's called. It's the
canonical source of truth. STATE.md is just a stale mirror.

## Decision

Make STATE.md's "Current Position" + "Progress" sections **derived
output**, regenerated on every cp command. User-curated sections are
preserved byte-for-byte.

Mechanism:
- Add `lib/state.js::deriveState(root)` that returns a struct with the
  same shape `updatePosition` accepts (`phase`, `plan`, `status`,
  `progressPercent`, `currentFocus`, `lastActivity`).
- Add `lib/state.js::regenerate(root, options?)` that:
  1. Calls `deriveState(root)` → derived block
  2. Reads existing STATE.md → preserves curated sections
  3. Writes back the merged document
- Wire `regenerate(root)` into every cp lifecycle command as the LAST
  step after the underlying mutation (replacing the scattered
  `updatePosition` calls).

Backward compatibility:
- `state.updatePosition` / `state.updateProgressBar` keep working
  (lifecycle tests use them); marked deprecated in JSDoc.
- New `regenerate()` is the canonical path going forward.

## Consequences

### Positive
- Drift cause #2 eliminated: derivable fields cannot diverge from
  ROADMAP because they're computed from it on every command.
- Single code path for "update STATE" — no more scattered fragile
  `updatePosition` calls.
- Pulling colleague's commits is automatically reflected on next cp run.
- Tests of derived position can use ROADMAP fixtures directly without
  having to also seed STATE.md.

### Negative
- The "Last activity" line — currently set by each command with its own
  human-readable note — now must derive from git log (most recent cp
  commit). Lose some narrative specificity. Acceptable: status of "what
  shipped" is more informative than the imperative verb used.
- Tests that snapshot STATE.md must use `regenerate` for stability.

### Neutral
- "Performance Metrics" + "Recent Decisions" + "Pending Todos" +
  "Blockers" + "Deferred Items" + "Quick Tasks Completed" +
  "Session Continuity" stay user-curated → preserved verbatim.

---

## Architecture

```
ROADMAP.md ──┐
phase dirs ──┼─► deriveState(root) ──► { phase, plan, status, ... }
   git log ──┘                                  │
                                                ▼
                       regenerate(root) ──► merge with existing
                                            curated sections
                                                ▼
                                            write STATE.md
```

Section ownership in STATE.md:

| Section heading | Owner | After Phase 20 |
|---|---|---|
| `## Current Position` | derived | rewritten every cp command |
| `Progress: [...]` line | derived | rewritten every cp command |
| `## Performance Metrics` | curated | preserved |
| `## Accumulated Context` (Decisions, Todos, Blockers) | curated | preserved |
| `## Deferred Items` | curated | preserved |
| `## Quick Tasks Completed` | curated | preserved |
| `## Session Continuity` | curated | preserved |

## Components

| Name | Purpose | Interface |
|---|---|---|
| `lib/state.js::deriveState(root)` | Pure derivation from ROADMAP + phase dirs | returns `{ phase, plan, status, currentFocus, progressPercent, lastActivity }` |
| `lib/state.js::regenerate(root, opts?)` | Merge derived + curated; write STATE.md | returns `{ action: 'rewritten'\|'unchanged', diff?: string }` |
| `lib/state.js::_splitState(content)` | Internal: parse STATE.md into derived-block + curated-tail | returns `{ derivedBlock, curatedSections }` |

## Data Flow

`deriveState(root)`:
1. Read ROADMAP.md → find active milestone via existing logic.
2. List phases of that milestone → count ticks.
3. Find next unticked plan → derive `phase` + `plan`.
4. Compute progress %: ticked plans / total plans in milestone.
5. Derive "Current focus" from active phase name.
6. Derive "Last activity" from most recent `cp:` commit message via
   `git log -1 --format=%s --grep=^cp:` (or fallback to today's date).
7. Status: if next plan exists → "Ready to execute"; if all ticked
   but no SUMMARY → "Ready to write summary"; if all SUMMARYs → "Phase
   complete".

`regenerate(root)`:
1. `deriveState(root)` → derived struct.
2. If STATE.md missing → scaffold from template using derived values.
3. Else: `_splitState` to find boundary between derived ("Current
   Position" block + "Progress" line) and curated (everything else).
4. Compose new derived block + preserved curated tail.
5. If equal to existing → return `{ action: 'unchanged' }` (no write).
6. Else write atomically (via `lib/atomic.js`).

## Error Handling

- Missing ROADMAP.md → returns derived with `phase: null, status: 'no-roadmap'`.
- Malformed STATE.md (no recognisable `## Current Position` header) →
  scaffold fresh from template, write to STATE.md.bak first.
- Git log unavailable → "Last activity" falls back to file mtime of
  ROADMAP.md.
- `regenerate` never throws on derivation failure — emits stderr warning
  and returns `{ action: 'skipped', reason }`.

## Testing Strategy

| Layer | Coverage | File |
|---|---|---|
| Unit: `deriveState` with various phase trees | +8 | `test/unit-state.js` (new) |
| Unit: progress % calculation | +4 | `test/unit-state.js` |
| Unit: `_splitState` preserves curated sections | +5 | `test/unit-state.js` |
| Unit: `regenerate` unchanged when up to date | +2 | `test/unit-state.js` |
| Unit: `regenerate` overwrites stale derived block | +3 | `test/unit-state.js` |
| Integration: `cp tick` triggers regenerate | +3 | extends `test/unit-lifecycle.js` |
| Integration: pulled-commits scenario (ROADMAP says 19, STATE says 11) → next cp command syncs | +2 | extends `test/unit-lifecycle.js` |

Target: ~27 new assertions.

## Alternatives Considered

### Option A — Replace STATE.md entirely with derived output

**Pros:** Simplest model. No merging required.
**Cons:** Loses user-curated sections (Decisions, Todos, Blockers).
  These are not derivable and provide real value (cross-session
  continuity, manual notes).
**Verdict:** rejected. Hybrid model preserves what only humans know.

### Option B — Read-only view command (`cp state show`)

**Pros:** Zero risk to existing STATE.md.
**Cons:** STATE.md stays stale on disk; doesn't help agents that read
  STATE.md directly. Doesn't fix the actual drift.
**Verdict:** rejected. The drift fix requires STATE.md to be accurate
  on disk, not just queryable.

### Option C — Trigger regenerate from git hook (post-checkout)

**Pros:** Catches "pulled colleague's commits" case automatically.
**Cons:** Hooks not yet installed (that's Phase 27). Adding hook
  dependency now would invert the milestone order. The "regenerate on
  every cp command" rule already covers this case the next time the
  user runs ANY cp command.
**Verdict:** rejected — solved by Phase 27 hooks layer on top of
  the same regenerate primitive.

## Open Questions

- [ ] Should `cp regenerate` be exposed as its own CLI verb for
      explicit refresh? **Decision:** yes, ship as `cp state regen`
      in Plan 20-02 for users who want to refresh without running
      a real lifecycle command. Low cost; high discoverability.

## References

- Drift cause #2 (Milestone DESIGN.md line 32)
- `lib/lifecycle.js::statusReport` — existing derivation logic
- `lib/state.js` — current mutation primitives
- `lib/atomic.js::writeFile` — atomic write helper to use
