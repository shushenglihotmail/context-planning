---
plan_id: "107"
phase_num: "107"
phase_name: "Bug C — STATE.md banner stale after complete-milestone"
tier: phase
status: pending
created: 2026-06-01
updated: 2026-06-01
---

# Plan 107: Bug C — Regenerate STATE.md banner in `cp complete-milestone`

## Problem

**Current symptom:** After running `cp complete-milestone` to close a milestone, users
see stale data in the `<!-- cp:current-focus -->` banner in STATE.md:

```markdown
## Current Position

Phase: 3 (Sharing)  ← should be "Phase: 0 (ready for next milestone)" now
Status: In progress ← should be "Idle"
```

**Root cause:** `completeMilestone()` in `lib/lifecycle.js` resets individual STATE
fields (phase, status, progress) via `state.updatePosition()`, but does NOT call
`state.regenerate(root)` to rewrite the full derived block. The derived block
("## Current Position" + progress bar + metadata) is rendered from ROADMAP +
on-disk phase state by `state.deriveState()`, so manual piecemeal updates leave
stale markers.

**Impact:** Users must manually run `cp state regen` after every milestone close to
see accurate STATE. This is a papercut but breaks the principle that `cp
complete-milestone` is a complete, self-contained operation.

## Approach

**Fix:** Call `state.regenerate(root)` after all STATE piecemeal updates in the
`completeMilestone()` flow, immediately before commit. This ensures the derived
block reflects the post-close milestone state (no active milestone, idle status).

**Implementation style** (from DESIGN.md line 174–175):
- Wrap call in `try { state.regenerate(root) } catch (err) { /* WARN, no throw */ }`
- Log WARN to stderr on failure but do NOT rollback the milestone close
- Never block `complete-milestone` on state regeneration — it's a nice-to-have

**Flow:**
1. `completeMilestone()` applies transactional batch writes (ROADMAP collapse, MILESTONES append, STATE reset)
2. After `writeBatch(actions)` succeeds and before `gitCommit()`, call `state.regenerate(root)`
3. Regenerate reads the already-updated ROADMAP + STATE, derives fresh position, rewrites banner
4. If regenerate fails (e.g. malformed ROADMAP), log and continue — do not throw

## Tasks

### T1. Call state.regenerate() in completeMilestone (atomic commit)

**Scope:** `lib/lifecycle.js` line ~1325 (just after `writeBatch(actions)`).

**Work:**
1. Add `state.regenerate(root)` call after the transactional batch writes
2. Wrap in `try { } catch (err) { }` with WARN log to stderr
3. Include phase context in log: `cp: state regen failed after close-milestone: <reason>`
4. Do not set any flag or state; the close is complete regardless

**Validation:**
- Dry-run completeMilestone still produces correct action list
- Live run regenerates STATE so next `cp progress` shows idle state + cleared banner
- Failure in regenerate does not corrupt MILESTONES.md or ROADMAP

### T2. Test: fixture milestone with stale banner → complete-milestone → assert banner cleared

**Scope:** `test/dryrun-complete-milestone.js` or new fixture suite.

**Setup:**
1. Build fixture project with `.planning/ROADMAP.md`, `.planning/STATE.md`, phases 1–2 complete
2. Write `.planning/STATE.md` with stale phase/status (e.g. "Phase: 2", "Status: In progress")
3. Complete active milestone via `lifecycle.completeMilestone(root, { dryRun: false })`

**Assertions:**
- STATE.md `## Current Position` block shows `Phase: 0` (or `-`) and `Status: Idle`
- Progress bar shows `[░░░░░░░░░░] 0%`
- No exceptions thrown
- MILESTONE.md digest is appended correctly
- ROADMAP milestone is collapsed correctly

**Test name:** `"complete-milestone: regenerate STATE.md banner after close"`

## Done-When Checklist

- [ ] **Code change committed**: `lib/lifecycle.js` lines ~1325–1330 add `state.regenerate()` call with try/catch and WARN log
- [ ] **Test written and passing**: new test fixture in `test/dryrun-complete-milestone.js` verifies banner refresh
- [ ] **Dry-run verified**: `cp complete-milestone --dry-run` output unchanged
- [ ] **Live run verified**: manual `cp complete-milestone` on test fixture clears banner, emits no errors
- [ ] **Failure case verified**: intentionally corrupt ROADMAP, run complete-milestone, confirm WARN log + no crash
- [ ] **npm test passing**: all existing tests still pass, new test green
- [ ] **Audit clean**: `cp audit` against this project's `.planning/` produces no new findings
- [ ] **Single atomic commit**: `cp: bug-C regenerate STATE after complete-milestone`

## Notes

- State regeneration is implemented as a pure function that never throws; it returns `{ action, reason }` tuples. This is by design (v0.8 P4 design).
- The existing `writeBatch()` ensures all file mutations are durable before regenerate is called, so a mid-state regenerate is safe.
- WARN log (not ERROR) is correct because the milestone close itself succeeds; stale STATE is a minor stale-data issue, not a fatal error.

## Reference

- `.planning/milestones/v1-9-framework-bug-fixes-from-v1-8-1-retro/DESIGN.md` — Bug C section (line ~35–38)
- `lib/lifecycle.js` line 1143–1338 — `completeMilestone()` function
- `lib/state.js` line 308–359 — `regenerate()` function signature & contract
- `test/dryrun-complete-milestone.js` — existing complete-milestone test fixture
