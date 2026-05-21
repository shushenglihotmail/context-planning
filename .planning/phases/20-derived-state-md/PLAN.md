---
phase: "20"
name: Derived STATE.md
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: 0706110dd0ba1b4f9f344de36ee862c0a18acd08
---

# Phase 20: Derived STATE.md

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Design**: see [DESIGN.md](./DESIGN.md)

## Goal

STATE.md's "Current Position" + "Progress" sections become **derived
output**, regenerated on every cp command from ROADMAP + phase tree.
User-curated sections (Decisions, Todos, Blockers, Quick Tasks,
Session Continuity) preserved byte-for-byte. Eliminates drift cause
#2 ("stale STATE").

## Success Criteria

1. `deriveState(root)` returns correct phase/plan/status/progress for a
   given ROADMAP + phase tree.
2. `regenerate(root)` rewrites only the derived block, preserves curated
   sections verbatim.
3. After `cp tick`, STATE.md reflects the new tick count automatically.
4. Pulling colleague's commits (ROADMAP says Phase 19, STATE says
   Phase 11) → next cp command resyncs STATE.
5. `cp state regen` CLI verb explicitly refreshes STATE.md.
6. All existing tests still pass (no regressions in updatePosition path).

## Plans

- [x] 20-01: `deriveState` + `regenerate` + lifecycle integration
- [ ] 20-02: `cp state regen` CLI verb + integration test

---

## Plan 20-01 — deriveState + regenerate + lifecycle wiring

**Files (new):**
- `test/unit-state.js` — ~22 assertions (deriveState, _splitState, regenerate)

**Files (modified):**
- `lib/state.js`:
  - Add `deriveState(root)` — pure, returns `{ phase, plan, status, currentFocus, progressPercent, lastActivity }`.
  - Add `_splitState(content)` — internal, splits derived-block vs curated-tail.
  - Add `regenerate(root, opts?)` — merge + atomic write; returns `{ action, diff? }`.
  - Keep `updatePosition`/`updateProgressBar` for backward compat (mark JSDoc deprecated).
- `lib/lifecycle.js`:
  - `tickPlan`: call `state.regenerate(root)` at end (replacing the existing position-update logic).
  - `writeSummary`: same.
  - `scaffoldPhase` (in lifecycle.js): same.
  - `completeMilestone`: same after the close-out is done.
- `test/unit-lifecycle.js`:
  - +3 integration assertions: pulled-commits scenario, tick triggers regen, etc.

**Helper signatures:**
```js
function deriveState(root) {
  // 1. Read ROADMAP.md, find active milestone
  // 2. List phases of that milestone, count plan ticks
  // 3. Compute current phase = first with incomplete plans (or last if all done)
  // 4. Compute plan = first unticked plan in current phase
  // 5. Compute progressPercent = ticked / total across milestone
  // 6. Derive currentFocus from active phase name
  // 7. lastActivity from `git log -1 --grep="^cp:" --format=%s` (or fallback)
  return { phase, plan, status, currentFocus, progressPercent, lastActivity };
}

function _splitState(content) {
  // Returns { derivedBlock: string, curatedSections: string }
  // Boundary = end of "Progress: [...]" line; everything after = curated
}

function regenerate(root, opts = {}) {
  // 1. deriveState
  // 2. Read existing STATE.md (or scaffold if missing)
  // 3. _splitState to get curated tail
  // 4. Render new derived block from template
  // 5. Compose + atomic write if changed
  // Returns { action: 'rewritten' | 'unchanged' | 'skipped', reason? }
}
```

**Tests (test/unit-state.js, +22):**
- `deriveState` happy path: 1 milestone, 2 phases, half ticked → correct %
- `deriveState` first phase, no ticks → status='Ready to execute', plan='01-01'
- `deriveState` all plans done, no SUMMARY → status='Ready to write summary'
- `deriveState` all plans + SUMMARY → status='Phase complete'
- `deriveState` no active milestone → status='idle'
- `deriveState` missing ROADMAP → returns null phase + error reason
- Progress %: 0/4 = 0%, 4/4 = 100%, 1/3 = 33%
- `_splitState` finds the Progress line boundary correctly
- `_splitState` preserves curated sections (Decisions, Todos, Blockers)
- `_splitState` malformed STATE (no `## Current Position`) → returns derivedBlock='', curatedSections=fullContent
- `regenerate` unchanged when current → action='unchanged', no disk write
- `regenerate` overwrites stale derived block, preserves curated
- `regenerate` scaffolds when STATE.md missing
- `regenerate` returns diff string in 'rewritten' result

**Tests (test/unit-lifecycle.js, +3):**
- After `tickPlan`, STATE.md has updated progress bar
- "Pulled colleague's commits" scenario: edit ROADMAP to add ticks
  without touching STATE → next `tickPlan` regenerates STATE correctly
- `regenerate` is called from `writeSummary` (mock or end-state assertion)

**Verify:** `node test/unit-state.js` green; `node test/unit-lifecycle.js` green; `npm test` green.

**Commit:** `cp(20-01): derive STATE.md from ROADMAP + phase tree`

---

## Plan 20-02 — `cp state regen` CLI verb + integration test

**Files (new):**
- `bin/commands/state.js` — subcommand dispatcher (regen)
- `test/dryrun-state.js` — integration test (~6 assertions)

**Files (modified):**
- `bin/cp.js` — register `state` command
- `package.json` — append `test/dryrun-state.js` to test script

**CLI shape:**
```
cp state regen [--dry-run] [--quiet]
```

- `--dry-run`: compute regenerate diff, print to stdout, no write
- `--quiet`: suppress "STATE.md unchanged" notice

**Tests (test/dryrun-state.js, +6):**
- `cp state regen` on up-to-date STATE → exit 0 + "unchanged" notice
- `cp state regen` after editing ROADMAP → rewrites + diff to stdout
- `cp state regen --dry-run` → no write
- `cp state regen --quiet` → no "unchanged" notice
- Usage string mentions regen + flags
- Exit code 0 on success

**Dogfood:**
After 20-01+20-02 ship, run `cp state regen` and verify STATE.md gets a
correct derived block. Then deliberately edit ROADMAP.md to add a tick
to phase 20 plans, re-run `cp state regen`, and verify STATE updates.

**Commit:** `cp(20-02): cp state regen CLI verb + integration test`

---

## Notes

- This phase RESHAPES STATE.md but does not introduce a new file format
  — the existing template stays the source of truth.
- The "Last activity" line currently has bespoke phrasing per command
  (e.g. "started phase 17", "shipped phase 19"). Deriving from
  `git log` loses some of that. Trade-off documented in DESIGN.md
  consequences.
- `lib/atomic.js::writeFile` (Phase 6) provides the atomic write —
  re-use it for STATE.md regen to avoid partial-write corruption.
- Keep `updatePosition` / `updateProgressBar` exported for backward
  compatibility; lifecycle tests + external callers still use them.
  `regenerate` is the new canonical path going forward.
- The `_splitState` boundary detection is the most fragile part — must
  handle: missing sections, extra blank lines, the Progress line being
  the LAST line in the file (edge case).
