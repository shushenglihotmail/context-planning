---
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
# Design: v0.7 — Design Capture (cp ↔ SP)

## Status

**Accepted** — 2026-05-20. Target milestone: **v0.7.0**, single phase (16), three plans (16-01 / 16-02 / 16-03).

## Context

### The gap

cp delegates the design / plan / execution loop to Superpowers (SP) and owns
the state layer (PROJECT / ROADMAP / STATE / phases / SUMMARY / MILESTONES).
After shipping v0.6 "Quality Wave", a retrospective on cp ↔ SP integration
surfaced three concrete capture gaps:

1. **Design rationale is transient.** `cp-new-milestone` Step 3 delegates to
   SP `brainstorming` and dumps the output into top-level
   `.planning/MILESTONE-CONTEXT.md` — but that file is intentionally
   transient (deleted/moved at `cp complete-milestone`). Architectural
   rationale, rejected alternatives, and gray-area decisions disappear from
   the repo when the milestone closes; only a compressed summary survives in
   `MILESTONES.md`.

2. **Subagent review chain is lost.** SP `subagent-driven-development`
   dispatches fresh subagents per task with a two-stage review (spec
   compliance, then code quality). When a reviewer rejects three approaches
   before approving the fourth, that rejection history lives only in the
   orchestrator's session transcript — never on disk. Code review feedback
   that drove the final implementation is unrecoverable after context
   reset.

3. **`key-decisions` is silently optional.** `cp write-summary` accepts an
   empty/missing `key-decisions` array without complaint. The schema is
   *human-curated*: orchestrators routinely omit it under time pressure,
   then the milestone roll-up has nothing to aggregate.

### Constraints

- **No upstream SP changes.** The user explicitly does not want to fork or
  PR against `obra/superpowers-marketplace`. All capture must happen on
  the cp side — either at scaffold time, in cp CLI commands, or in cp's
  own skill files that instruct the orchestrator.
- **No new SP coupling.** Existing SP skills (`brainstorming`,
  `writing-plans`, `subagent-driven-development`) already accept
  output-path overrides for the files they write — that's leveraged, but
  no API surface beyond that is consumed.
- **Back-compat.** Existing `.planning/` trees with no `DESIGN.md` /
  `REVIEW-LOG.md` continue to work; the aggregator skips silently.

## Decision

Introduce a **three-tier persistent design-capture layer** parallel to the
existing state docs, owned by cp but written by SP-delegated agents:

| Tier         | File                                                        | Captures                                       | Written by                                                                 |
|--------------|-------------------------------------------------------------|------------------------------------------------|----------------------------------------------------------------------------|
| Milestone    | `.planning/milestones/<slug>/DESIGN.md`                     | Cross-phase architecture, milestone-wide ADRs  | SP `brainstorming` via `/cp-new-milestone` Step 3 (path-override)          |
| Phase        | `.planning/phases/NN-slug/DESIGN.md`                        | Cross-plan decisions within a phase            | SP `brainstorming` via `/cp-plan-phase` Step 3.5 (NEW, path-override)      |
| Plan         | `NN-MM-PLAN.md` `<objective>` block                         | Per-plan tactical rationale                    | Already exists — no change                                                 |

Plus:

- **`.planning/phases/NN-slug/REVIEW-LOG.md`** — phase-level, append-only
  record of every subagent review verdict for every task. Populated by the
  orchestrator following an explicit instruction in
  `.github/skills/cp-execute-phase/SKILL.md` Step 4.5 (NEW). One file per
  phase (not per plan) — append-only with plan-id-tagged entries.

- **`cp write-summary` validation hardened** — empty `key-decisions` /
  `key_decisions` is now a hard block (exit code 2) with an actionable
  error message pointing at the spec.

- **`templates/DESIGN.md` is the union** of classical ADR (Status, Context,
  Decision, Consequences, References) and SP brainstorming output
  (Architecture, Components, Data Flow, Error Handling, Testing,
  Alternatives Considered, Open Questions). This is a deliberate superset
  so neither audience loses information.

## Consequences

### Positive

- Design rationale survives milestone close. Future contributors (and
  future LLM sessions with fresh context) can reconstruct *why* something
  was built, not just *what*.
- Review history becomes inspectable. A new reviewer can grep
  `REVIEW-LOG.md` to see "this approach was rejected three times — here's
  why" before re-proposing the same solution.
- `key-decisions` becomes a real field. Empty-by-default is replaced by
  must-fill-or-fail, forcing the orchestrator to record at least one
  decision per plan.
- Existing files unchanged. `MILESTONE-CONTEXT.md` keeps being written
  for back-compat but is now promoted into the milestone DESIGN.md at
  close (transcript appendix) instead of deleted.
- No SP coupling. Path overrides + skill-level instructions only. SP can
  update without breaking cp.

### Negative

- File-count growth. Each phase grows from `PLAN.md + N×SUMMARY.md` to
  `PLAN.md + DESIGN.md + REVIEW-LOG.md + N×SUMMARY.md`. For tiny phases
  (1 plan, 1 task), DESIGN.md may be sparse — acceptable cost of a
  predictable schema.
- Orchestrator burden. Plan 16-02's REVIEW-LOG capture depends on the
  cp-execute-phase skill being followed faithfully. If an orchestrator
  ignores Step 4.5, REVIEW-LOG.md stays empty. Mitigation: skill text is
  explicit + the aggregator surfaces "Phase X had 0 review entries" so
  the gap is visible at milestone close.
- Backfill cost. The 10 SUMMARY files written this session under
  `.planning/phases/*/` predate the `key-decisions` hard-block and will
  need a one-time backfill to keep dogfood tests green. Scoped to plan
  16-03.

### Neutral

- Migration path for old projects: aggregator skips missing files
  silently. No forced migration; new files appear at next scaffold.

## Architecture

```
                  ┌─────────────────────────────────────┐
                  │  /cp-new-milestone "<name>"         │
                  └──────────────┬──────────────────────┘
                                 │ Step 3: delegate to SP brainstorming
                                 │ with path override
                                 ▼
              ┌──────────────────────────────────────────┐
              │  SP brainstorming                        │
              │  writes → milestones/<slug>/DESIGN.md   │
              │  also dumps → MILESTONE-CONTEXT.md      │
              └──────────────────────────────────────────┘

                  ┌─────────────────────────────────────┐
                  │  cp scaffold-phase N                │
                  └──────────────┬──────────────────────┘
                                 │ creates from templates
                                 ▼
              ┌──────────────────────────────────────────┐
              │  phases/NN-slug/                         │
              │    PLAN.md          (existing)           │
              │    DESIGN.md        (NEW, empty)         │
              │    REVIEW-LOG.md    (NEW, empty)         │
              └──────────────────────────────────────────┘

                  ┌─────────────────────────────────────┐
                  │  /cp-plan-phase N  (Step 3.5 NEW)   │
                  └──────────────┬──────────────────────┘
                                 │ delegate to SP brainstorming
                                 │ path → phases/NN-slug/DESIGN.md
                                 ▼
                       (DESIGN.md filled)
                                 │
                                 │ Step 4: existing — delegate to SP writing-plans
                                 │ DESIGN.md passed as context input
                                 ▼
                       (PLAN.md <tasks> filled)

                  ┌─────────────────────────────────────┐
                  │  /cp-execute-phase N (Step 4.5 NEW) │
                  └──────────────┬──────────────────────┘
                                 │ after each subagent review:
                                 │   orchestrator appends entry
                                 ▼
                       (REVIEW-LOG.md grows append-only)

                  ┌─────────────────────────────────────┐
                  │  cp write-summary  (HARDENED)       │
                  └──────────────┬──────────────────────┘
                                 │ key-decisions empty? → exit 2
                                 ▼
                       (NN-MM-SUMMARY.md written)

                  ┌─────────────────────────────────────┐
                  │  cp complete-milestone (EXTENDED)   │
                  └──────────────┬──────────────────────┘
                                 │ aggregator now folds:
                                 │   phase DESIGN.md refs
                                 │   REVIEW-LOG.md highlights
                                 │   MILESTONE-CONTEXT.md → milestone DESIGN appendix
                                 ▼
                       (MILESTONES.md + final DESIGN.md)
```

## Components

### `templates/DESIGN.md` (NEW)

Union template combining ADR header (Status / Context / Decision /
Consequences / References) and SP brainstorming sections (Architecture /
Components / Data Flow / Error Handling / Testing / Alternatives Considered
/ Open Questions). Frontmatter: `status`, `created`, `updated`,
`deciders`, `supersedes`, `superseded_by`, plus `phase` or `milestone`
key depending on tier.

### `templates/REVIEW-LOG.md` (NEW)

Append-only Markdown with structured entries:

```markdown
## 2026-05-21T14:32 — 16-01
- **reviewer:** spec-reviewer
- **verdict:** ❌ rejected (issues fixed)
- **issues:**
  - DESIGN.md template missing "Status" field
  - Date placeholder not substituted
- **resolved-in:** abc1234
```

### `lib/paths.js` extensions (NEW helpers)

- `designFile(phaseNumOrSlug)` → `.planning/phases/NN-slug/DESIGN.md`
- `reviewLogFile(phaseNumOrSlug)` → `.planning/phases/NN-slug/REVIEW-LOG.md`
- `milestoneDesignFile(milestoneSlug)` → `.planning/milestones/<slug>/DESIGN.md`

### `lib/lifecycle.js` extensions

- `writeSummary()` validates `key-decisions` non-empty; throws structured
  error with exit code 2.
- `aggregateSummaries()` extended to:
  - Read all phase DESIGN.md files; emit "Phase N design: see
    phases/NN-slug/DESIGN.md" refs into the milestone DESIGN.md.
  - Read all REVIEW-LOG.md files; count entries; surface "Phase N had M
    review iterations across K tasks" in MILESTONES.md.
  - Detect transient `MILESTONE-CONTEXT.md`; promote its content into the
    milestone DESIGN.md as a "Brainstorm transcript" appendix; delete the
    transient file.

### `bin/commands/scaffold-phase.js` extension

After writing `PLAN.md`, also write `DESIGN.md` and `REVIEW-LOG.md` from
their respective templates with phase metadata pre-substituted.

### `bin/commands/scaffold-milestone.js` extension

After writing milestone heading in ROADMAP.md, create
`.planning/milestones/<slug>/` directory with empty `DESIGN.md` scaffolded
from the milestone-flavored template.

### `.github/skills/cp-*.md` updates

- `cp-new-milestone/SKILL.md` Step 3: delegate to SP brainstorming with
  output path override `→ milestones/<slug>/DESIGN.md`. Keep
  MILESTONE-CONTEXT.md as full transcript.
- `cp-plan-phase/SKILL.md` Step 3.5 (NEW, between current Step 3 and
  Step 4): "Before delegating to writing-plans, delegate to brainstorming
  with output path `→ phases/NN-slug/DESIGN.md`. Pass the phase Goal +
  Success Criteria + Requirements as context. SP fills the DESIGN.md
  template; you do NOT touch frontmatter keys cp populated (phase,
  milestone, status, created)."
- `cp-execute-phase/SKILL.md` Step 4.5 (NEW): "After each subagent review
  verdict (spec-reviewer, code-quality-reviewer, final-reviewer), append
  an entry to `phases/NN-slug/REVIEW-LOG.md` in the documented format.
  Even if the verdict is ✅ on the first try, log it — empty REVIEW-LOG
  signals broken capture, not no-issues."
- `cp-execute-phase/SKILL.md` Step 6: "key-decisions REQUIRED. At least
  one entry. Empty → `cp write-summary` exits 2."

## Data Flow

```
SP brainstorming output  ──path-override──▶  milestones/<slug>/DESIGN.md
                          ──path-override──▶  phases/NN-slug/DESIGN.md

SP writing-plans  ──reads──▶  phases/NN-slug/DESIGN.md (as context)
                  ──writes─▶  phases/NN-slug/NN-MM-PLAN.md <tasks>

SP subagent-driven-dev review verdict
   ──(via orchestrator following skill)──▶  phases/NN-slug/REVIEW-LOG.md (append)

cp write-summary  ──validates──▶  key-decisions array
                  ──writes────▶  phases/NN-slug/NN-MM-SUMMARY.md

cp complete-milestone
   ──reads─────▶  ALL phases/*/DESIGN.md, REVIEW-LOG.md, *-SUMMARY.md
   ──promotes──▶  .planning/MILESTONE-CONTEXT.md → milestone DESIGN appendix
   ──writes────▶  milestones/<slug>/DESIGN.md (cross-refs + transcript)
   ──writes────▶  .planning/MILESTONES.md (rolled-up)
```

## Error Handling

- **Missing template file:** scaffold fails atomically; no partial writes
  (uses existing `lib/atomic-write`).
- **Empty `key-decisions`:** `cp write-summary` exits 2 with message
  `Error: 'key-decisions' is required and must have ≥1 entry. See spec at docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md`.
- **Aggregator finds no DESIGN.md for a phase:** silently skips (back-compat).
- **Aggregator finds no REVIEW-LOG.md for a phase:** silently skips +
  emits "Phase X had no review log (orchestrator did not capture)"
  diagnostic in MILESTONES.md so the gap is visible.
- **MILESTONE-CONTEXT.md promotion failure:** logs error, leaves transient
  file in place, continues with rest of aggregation. Non-blocking.
- **Existing `.planning/phases/*/SUMMARY.md` with empty key-decisions:**
  one-time backfill in plan 16-03 (this session's 10 dogfood SUMMARYs);
  documented in the migration notes.

## Testing Strategy

- **Unit (extends `test/unit-libs.js` or new `test/unit-design.js`)**
  - `designFile()` / `reviewLogFile()` / `milestoneDesignFile()` path helpers
  - `aggregateSummaries()` correctly folds DESIGN refs + REVIEW-LOG counts
  - `aggregateSummaries()` correctly promotes MILESTONE-CONTEXT.md
  - `writeSummary()` rejects empty `key-decisions` (positive + negative case)
  - Back-compat: aggregator on phase with no DESIGN/REVIEW-LOG produces
    sane output (no crash, no spurious refs)
- **CLI dry-run (extends existing `dryrun-*.js` files)**
  - `cp scaffold-phase --dry-run` previews DESIGN.md + REVIEW-LOG.md creation
  - `cp scaffold-milestone --dry-run` previews milestone DESIGN.md
  - `cp complete-milestone --dry-run` previews promotion + cross-refs
- **Coverage:** maintain 85% lines / 75% branches gate from v0.6.

## Alternatives Considered

### Option A — Upstream PR against `obra/superpowers-marketplace`

**Pros:** Cleanest integration; SP itself emits REVIEW-LOG entries; no
orchestrator burden.

**Cons:** Depends on upstream maintainer accepting (could be weeks/months);
cp v0.7 release blocks on external dependency; couples cp release cadence
to SP.

**Verdict:** Rejected. User explicitly requires no SP changes.

### Option B — Per-plan DESIGN.md (`NN-MM-DESIGN.md`)

**Pros:** Granular; each plan owns its design rationale; matches existing
per-plan PLAN.md / SUMMARY.md pattern.

**Cons:** 3× file count growth; SP brainstorming per plan is heavy; mostly
duplicates `<objective>` block already in PLAN.md; misses cross-plan
architecture decisions.

**Verdict:** Rejected. Plan-level rationale stays in PLAN.md `<objective>`.

### Option C — DESIGN at phase level only (skip milestone tier)

**Pros:** Simpler — one new tier instead of two.

**Cons:** Doesn't fix the core gap (transient MILESTONE-CONTEXT.md loses
cross-phase design); milestone-wide architectural decisions have no home.

**Verdict:** Rejected. Three-tier is the correct scope.

### Option D — REVIEW-LOG.md captured at SUMMARY-time, not real-time

(Reviews collected into a `reviews:` array passed to `cp write-summary`
at end-of-plan, not appended task-by-task.)

**Pros:** No mid-execution writes; single file (SUMMARY.md, no new type);
simpler skill change.

**Cons:** Reviews lose timestamp granularity; context-reset mid-plan loses
all prior reviews; harder to grep "what was rejected" across a long phase.

**Verdict:** Rejected. Append-only real-time wins on durability.

### Option E — Soft warning for empty key-decisions (instead of hard block)

**Pros:** Less friction; orchestrator can still ship if they really meant
zero decisions.

**Cons:** "Soft" = will be ignored. Hard block is what changes behavior.

**Verdict:** Rejected. Hard block, exit code 2.

## Open Questions

- [ ] Should milestone-tier DESIGN.md frontmatter expose a `phases:` array
      linking back to each phase that contributed? (Deferred to v0.8 if so.)
- [ ] Should `cp progress` / `cp status` surface "DESIGN.md exists/empty"
      as a phase-level signal? (Deferred to v0.8.)
- [ ] If a phase has no DESIGN.md at execute-time, should `/cp-execute-phase`
      warn or block? (Plan 16-01 starts with warn; revisit after one milestone of
      dogfooding.)

## References

- `.planning/PROJECT.md` — project Core Value and current state
- `.planning/ROADMAP.md` — v0.7 milestone block (will be appended by `cp scaffold-milestone`)
- `.github/skills/cp-new-milestone/SKILL.md` — Step 3 (delegate to brainstorming)
- `.github/skills/cp-plan-phase/SKILL.md` — Step 3 (current) and Step 3.5 (new)
- `.github/skills/cp-execute-phase/SKILL.md` — Step 4 (current) and Steps 4.5 + 6 (changes)
- `lib/lifecycle.js` — `writeSummary()`, `aggregateSummaries()`
- `lib/paths.js` — path helper conventions
- `bin/commands/scaffold-phase.js`, `bin/commands/scaffold-milestone.js`
- SP brainstorming skill output-path-override convention
  (`~/.copilot/installed-plugins/superpowers-marketplace/superpowers/skills/brainstorming/SKILL.md`)
- SP subagent-driven-development verdict format
  (`~/.copilot/installed-plugins/superpowers-marketplace/superpowers/skills/subagent-driven-development/SKILL.md`)
- v0.6 retrospective conversation (this session) — original gap identification

