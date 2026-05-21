---
phase: "22"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [user, copilot]
supersedes: []
superseded_by: null
---

# Design: Phase 22 — scaffold-phase prior-summary check

## Status

Accepted on 2026-05-21.

## Context

The v0.8 milestone DESIGN identifies **drift cause #5: starting a new phase
before completing the prior one**. Concretely, the user runs
`cp scaffold-phase N+1 --name ...` while phase N still has plans without
SUMMARY.md files. Two bad things happen:

1. The base-commit on N+1's PLAN.md gets stamped at a HEAD that already
   includes N's unfinished work — so when N's SUMMARY.md is eventually
   written, the diff is wrong (P2 auto-fill blames the wrong phase) and
   N+1's expected-vs-actual check (P5) sees N's churn as drift.
2. STATE.md derived block (P4) advances to N+1 because all of N's plans
   are checked (tick was honest), but no SUMMARY exists, so the
   prior-art trail is incomplete. `complete-milestone` (phase 23) will
   later refuse — but by then the user has done more work that needs
   unwinding.

cp already has a P4 derived state showing "Phase N: ready to write summary"
when all of N's plans are ticked but SUMMARY.md is missing. This phase
turns that signal into a hard gate at scaffold-time: refuse to scaffold
N+1 until N is documented.

**Why a guard, not just a warning?** Drift defense is "fail-loud, allow
opt-out". A stderr warning is too easy to miss in agent-driven workflows
where tool output is summarised aggressively. A hard refusal with a clear
`--force` flag forces an explicit decision.

## Decision

`scaffoldPhase(root, phaseNum, options)` refuses to scaffold phase N when
the immediately preceding phase has any ticked plan that lacks a
corresponding `{NN-MM}-SUMMARY.md` file.

- **Predicate "immediately preceding phase"**: the largest phase number
  strictly less than N that exists as a directory under
  `.planning/phases/`. If no prior phase exists (N is the first phase),
  the check skips silently.
- **Predicate "ticked plan without SUMMARY"**: any plan id `NN-MM` that
  appears as `- [x] NN-MM:` in either ROADMAP.md OR the prior phase's
  PLAN.md, AND no file `{NN-MM}-SUMMARY.md` exists in the prior phase
  directory.
- **Refusal**: return `{ ok: false, reason: 'prior-phase-incomplete',
  priorPhase: N-1, ticked: [...], missingSummaries: [...] }`. The CLI
  prints a human-readable message and exits 2.
- **Escape hatch**: `--force` (CLI) / `force: true` (option) bypasses
  the check entirely. The CLI emits a stderr `cp: --force used, skipping
  prior-summary check` notice so the override is at least auditable.
- **Reason field for telemetry**: `'prior-phase-incomplete'` distinct
  from existing `'phase-exists'`, `'milestone-not-found'`,
  `'no-active-milestone'`.

A separate `--continue` flag (planned for phase 26 — Repair commands) is
explicitly NOT introduced here; it has different semantics (resume a
half-scaffolded phase after a crash) and conflates with `--force`.

## Consequences

### Positive
- Removes drift cause #5 entirely for the happy path. The user can't
  accidentally start phase N+1 with N undocumented.
- Plays well with P2 (auto key-files), P4 (derived STATE), and P5
  (expected-vs-actual): all of them rely on SUMMARY.md existing per
  ticked plan, and now scaffolding can't outrun summary-writing.
- Surfaces a clear remediation: "write the missing SUMMARY.md, then
  re-run scaffold-phase".

### Negative
- Adds friction for users who legitimately want to plan ahead (write
  PLAN.md for several phases before executing any). Mitigated by the
  `--force` flag with audit-log stderr notice.
- One more filesystem walk on scaffold (cheap — bounded by plan count
  in the prior phase).

### Neutral
- Existing `cp scaffold-phase --planned` shape doesn't change; the
  refusal only fires when actual plan ticks exist without summaries.
- Tests in `unit-lifecycle.js` that scaffold phase 2 without writing
  phase 1 summaries will need to either (a) write the missing SUMMARYs,
  (b) pass `force: true`, or (c) not tick phase 1's plans first.

---

## Architecture

```
scaffoldPhase(root, N, options)
   |
   |--- (existing: validate args, find roadmap, check phase-exists,
   |     resolve active milestone)
   |
   |--- NEW: priorPhaseAudit(root, N)
   |        |
   |        |--- find largest phase < N in .planning/phases/
   |        |--- read its PLAN.md, extract `- [x] NN-MM:` lines
   |        |--- list expected SUMMARY filenames
   |        |--- glob phase dir for actual SUMMARYs
   |        |--- return { priorPhase, ticked, missingSummaries }
   |
   |--- if (audit.missingSummaries.length > 0 && !options.force)
   |        return { ok: false, reason: 'prior-phase-incomplete', ... }
   |
   |--- (existing: insert into ROADMAP, write PLAN/DESIGN/REVIEW-LOG,
   |     stamp base-commit, regenerate STATE.md)
```

## Components

### `lib/lifecycle.js::_priorPhaseAudit(root, phaseNum)`

- **Purpose**: detect ticked-without-summary plans in the largest
  phase strictly less than `phaseNum`.
- **Public interface**:
  ```
  _priorPhaseAudit(root, '22')
    -> null                     // no prior phase exists
    -> { priorPhase: '21',
         priorPhaseDir: '.../21-...',
         ticked: ['21-01','21-02'],
         missingSummaries: [] }  // all good
    -> { ..., missingSummaries: ['21-02'] }  // drift
  ```
- **Dependencies**: `paths.planningDir`, `paths.findPhaseDir`,
  `fs.readdirSync`, `fs.existsSync`.

### `lib/lifecycle.js::scaffoldPhase` (modified)

- Accept new option: `force` (default false).
- Insert audit call after the `phase-exists` check, before the
  ROADMAP mutation.
- Return new failure shape `{ ok: false, reason: 'prior-phase-incomplete', priorPhase, missingSummaries, actions: [] }` on detected drift.

### `bin/commands/scaffold-phase.js` (modified)

- Parse `--force` flag.
- Forward to `scaffoldPhase(root, n, { ..., force })`.
- On `prior-phase-incomplete` failure: print
  ```
  cp: cannot scaffold phase 22 — prior phase 21 has ticked plans without SUMMARY.md:
    - 21-02

  Write the missing summaries with:
    cp write-summary 21-02 --from <json>

  Or override with --force (not recommended).
  ```
  Exit 2.
- On `--force` success: print stderr notice
  `cp: --force used, skipping prior-summary check`.

## Data Flow

1. User: `cp scaffold-phase 22 --name "..."`
2. CLI parses args, calls `lifecycle.scaffoldPhase(root, '22', opts)`
3. scaffoldPhase: validate → check phase-exists → call `_priorPhaseAudit('22')`
4. _priorPhaseAudit: find phase 21 dir → read PLAN.md → extract ticked
   plans → check each `{NN-MM}-SUMMARY.md` exists → return audit object
5. scaffoldPhase: if `missingSummaries.length > 0 && !force`, return
   refusal object (no filesystem mutation)
6. CLI: pretty-print refusal, exit 2

## Error Handling

- **Prior phase has no PLAN.md**: treat as `ticked: []`, no refusal.
  (Edge case: external phase dir created by hand.)
- **Prior phase PLAN.md unparseable**: best-effort regex over `- [x]
  NN-MM:` lines; if empty, no refusal. Won't throw.
- **`_priorPhaseAudit` raises unexpectedly**: log, treat as "no
  refusal" (fail open). Drift defense should never block on its own
  bug.
- **`force: true` always wins**: skip the audit entirely (don't even
  compute it — saves a directory scan).

## Testing Strategy

Unit tests in `test/unit-lifecycle.js`:
1. `_priorPhaseAudit`: no prior phase → null
2. `_priorPhaseAudit`: prior has all SUMMARYs → empty missingSummaries
3. `_priorPhaseAudit`: prior has 1 ticked without SUMMARY → 1 missing
4. `_priorPhaseAudit`: prior PLAN.md missing → empty ticked
5. `scaffoldPhase` integration: refuses when prior incomplete
6. `scaffoldPhase` integration: succeeds when prior complete
7. `scaffoldPhase` integration: `force: true` bypasses refusal
8. `scaffoldPhase` integration: scaffolding phase 1 (no prior) works
9. `scaffoldPhase` integration: failed refusal makes no filesystem changes

Dryrun integration test in `test/dryrun-scaffold-phase.js` (new):
- Default refusal exit 2 + stderr message
- `--force` succeeds + stderr override notice
- `--force` no-drift case still succeeds silently

## Alternatives Considered

### Option A — Warn only, never refuse

**Pros:** No new flag; less friction.

**Cons:** Easy to miss in agent contexts. Defeats the purpose of
drift PREVENTION (this is Tier 1/2 of the three-tier defense — Tier 3
detection covers the warn-only role via `cplan audit`).

**Verdict:** rejected. Tier 2 must be a hard gate by design.

### Option B — Check ALL prior phases, not just N-1

**Pros:** Even tighter consistency — if phase 15 has missing
summaries, refuse to scaffold phase 22.

**Cons:** False positives are likely (legacy phases from before P5 may
genuinely lack SUMMARY.md for ticked plans). Hard refusal becomes
annoying. Tier 3 `cplan audit` will catch these eventually.

**Verdict:** rejected — only check N-1. (Phase 23 `complete-milestone
--strict` covers the full sweep.)

### Option C — Skip the check entirely when N is non-sequential (e.g. user explicitly skipped a number)

**Pros:** Honors deliberate phase-number skips (1, 2, 5).

**Cons:** Phase numbering is forward-only; the "immediately preceding"
predicate already handles this naturally (largest phase < N). No
special logic needed.

**Verdict:** rejected as redundant.

## Open Questions

- [ ] Should `--force` also be available as a config option
  (`cp.behavior.scaffold_phase_force = true`)? Defer to user demand.
- [ ] Should the refusal message link to a docs URL? Defer until
  `docs/drift-playbook.md` lands in phase 31.

## References

- Milestone DESIGN: `.planning/milestones/v0-8-consistency/DESIGN.md` (drift cause #5, row 22)
- Related code: `lib/lifecycle.js::scaffoldPhase` (existing)
- Related: `lib/state.js::deriveState` (P4 — surfaces same signal as informational)
