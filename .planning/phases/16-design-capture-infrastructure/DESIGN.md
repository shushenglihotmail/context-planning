---
phase: "16"
milestone_slug: "v0-7-design-capture"
milestone: v0.7 Design Capture
status: accepted
created: 2026-05-20
updated: 2026-05-20
deciders: [user, copilot-cli (cp orchestrator)]
supersedes: []
superseded_by: null
spec_source: docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md
---

# Design: Phase 16 — Design Capture Infrastructure

## Status

**Accepted** — 2026-05-20. Implements the v0.7 milestone design ([milestone DESIGN](../../milestones/v0-7-design-capture/DESIGN.md)) as a single phase with three sequential plans.

## Context

The v0.7 milestone design specifies three persistence gaps (transient design rationale, lost subagent review chain, silently-optional key decisions). Rather than three phases, scope as ONE phase / THREE plans because the changes share a single library surface (lib/lifecycle, lib/milestone, templates/) and one release boundary (v0.7.0). Each plan ships an independent, testable slice.

## Decision

### Plan split

- **16-01 — DESIGN.md infrastructure** (this plan): template + path helpers + scaffold extensions + aggregator + promote-on-close
- **16-02 — REVIEW-LOG.md infrastructure**: template + scaffold-phase wiring + cp-execute-phase Step 4.5 instructing the orchestrator to append + aggregator counts
- **16-03 — key-decisions hard-block**: `writeSummary` validation (exit code 2, exact message) + `cp-write-summary` skill update + backfill 10 existing dogfood SUMMARYs

### Sequencing rationale

16-01 first because both 16-02 and 16-03 depend on the milestone-tier DESIGN.md existing (16-02 references it, 16-03 backfill will check it). 16-02 and 16-03 are independent — could be done in either order or in parallel.

## Consequences

### Positive
- Atomic v0.7 release; one CHANGELOG entry, one tag.
- Each plan is independently revertable.
- Single phase keeps lifecycle overhead minimal.

### Negative
- 16-01 must land before 16-02 / 16-03 can start (creates a ~1-day critical path).

### Neutral
- Plan splitting decision is reversible: if 16-02 turns out to be small, can fold into 16-03.

---

## Architecture

```
Phase 16 (one phase, three plans, all shipping in v0.7.0)
├── Plan 16-01  templates/DESIGN.md + lib/paths + lib/lifecycle + lib/milestone + test/unit-design.js
│      └─ exit: scaffoldPhase + scaffoldMilestone emit DESIGN.md; aggregateSummaries surfaces phaseDesignRefs
├── Plan 16-02  templates/REVIEW-LOG.md + lib/lifecycle.scaffoldPhase wiring + cp-execute-phase Step 4.5
│      └─ exit: scaffoldPhase emits REVIEW-LOG.md; aggregator counts reviews
└── Plan 16-03  lib/milestone.writeSummary validation + skill doc + backfill
       └─ exit: cp write-summary exits 2 if key-decisions empty; all v0.6 SUMMARYs backfilled
```

## Components

- **lib/paths** — pure helpers (`designFile`, `milestoneSlug`, `milestoneDir`, `milestoneDesignFile`). No I/O outside `findPhaseDir`.
- **lib/lifecycle** — scaffold + complete pipeline. Extended at `scaffoldPhase`, `scaffoldMilestone`, `completeMilestone`.
- **lib/milestone** — aggregator + new `promoteMilestoneContext` helper. Existing `readSummaries` extended with `phasePath` field.
- **templates/DESIGN.md** — single union template (ADR + SP brainstorm sections). Tier-differentiated via `{{TIER_KEY}}` substitution.

## Data Flow

1. **At /cp-new-milestone:** SP brainstorm writes verbatim transcript to `.planning/MILESTONE-CONTEXT.md` AND ADR summary to `.planning/milestones/<slug>/DESIGN.md` via `path:` override.
2. **At /cp-plan-phase Step 3.5 (NEW):** SP brainstorm fills phase DESIGN.md.
3. **At /cp-complete-milestone:** `promoteMilestoneContext` appends transcript to milestone DESIGN.md, then deletes the transient file (atomic write batch).

## Error Handling

- Missing template → bubble up `paths.readTemplate` error (matches existing PLAN.md behavior).
- `promoteMilestoneContext` returns `null` when MILESTONE-CONTEXT.md absent or empty (back-compat path retained in `completeMilestone`).
- `findPhaseDir` returning null → `designFile` returns null (callers handle).

## Testing Strategy

- New `test/unit-design.js` (40 assertions): path helpers, scaffold extensions, aggregator dedup, promotion (created + appended branches + null cases).
- Existing `test/unit-lifecycle.js` updated for new action counts.
- Existing `test/dryrun-complete-milestone.js` verified to pass without modification.
- Coverage gate: ≥85L / ≥75B held (post-Task 9: 88.92L / 78.74B).

## Alternatives Considered

### Option A — Three phases (one per gap)
**Cons:** Triples cp lifecycle overhead; three release boundaries delays v0.7 ship.
**Verdict:** rejected.

### Option B — Skip Plan 16-03 (defer hard-block)
**Cons:** Without the validator, the new DESIGN/REVIEW-LOG infrastructure can be ignored by future plans.
**Verdict:** rejected; ship together.

## Open Questions

- [ ] Should `cp progress` surface DESIGN.md presence/emptiness? Deferred to v0.8.
- [ ] Milestone DESIGN.md frontmatter `phases:` back-link array? Deferred to v0.8.

## References

- Milestone design: `.planning/milestones/v0-7-design-capture/DESIGN.md`
- Spec source: `docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md`
- Plan 16-01: `docs/superpowers/plans/2026-05-20-v0-7-plan-16-01-design-md-infrastructure.md`
