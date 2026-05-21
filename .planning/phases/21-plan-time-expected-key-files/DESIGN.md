---
phase: "21"
name: Plan-time expected-key-files
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
---

# Phase 21 — Plan-time expected-key-files (P5)

**Tier 2 prevent layer.** Catch *intent* drift: when a plan promises
"I'll touch lib/foo.js" but the diff shows lib/bar.js instead.

## Context

Phase 17-20 built the data spine (SHA pins, auto key-files, file-exists
hard-block, derived STATE). Those keep the SUMMARY honest about what
*actually* shipped. But there's still a class of drift those don't
catch:

> The plan said *what we intended to change*. The diff shows *what we
> actually changed*. When these diverge silently, future readers
> believe the plan, find unrelated code, and waste hours.

Examples we've seen during v0.5/v0.6 development:
- Plan 09-02 promised "extend lib/codebase.js" → diff showed
  lib/codebase.js *and* a rename to lib/codebase-new.js (untold).
- Plan 14-01 promised "tweak bin/cp.js" → diff was 4 files; the others
  silently dropped into the SUMMARY via P2 auto-fill (good!) but no
  signal said "hey, you went 4× wider than planned".

P2 (auto key-files) made the SUMMARY truthful about scope. P5 makes
the PLAN's promise auditable against that truth.

## Decision

Add an optional `expected-key-files` array to PLAN.md frontmatter:

```yaml
---
phase: "21"
plan: "21-01"
expected-key-files:
  - lib/milestone.js          # extend with diff helper
  - templates/PLAN.md         # add schema
  - test/unit-milestone.js    # +6 assertions
---
```

`writeSummary` (after P2 auto-fill produces actual `key-files`) reads
this list, computes the symmetric difference (unexpected ∪ missing),
and:

1. If sets match → silent, no notice.
2. If unexpected files appeared → stderr `cp: expected-vs-actual
   drift: 3 unexpected (lib/bar.js, ...). Treating as deviation; add
   to expected-key-files in PLAN.md to silence.`
3. If expected files are missing → stderr `cp: expected-vs-actual
   drift: 2 expected-but-untouched (lib/foo.js, ...).`
4. **Soft** by default: writes the deviation as a sentence to the
   SUMMARY's `key-decisions` field so it's preserved in milestone
   digests. Doesn't block.
5. Hard-block with `--strict-expected` (off by default; opt-in for CI
   or paranoia mode).

`expected-key-files` is omitted from PLAN.md by default — the planner
chooses to commit. When omitted, writeSummary silently skips P5 (just
like P2 silently skips when no base-commit). This keeps the migration
ergonomic: existing plans without the field keep working.

## Alternatives rejected

1. **Hard-block by default.** Friction too high for solo/exploratory
   work where the planner is also the executor and the plan is more a
   sketch than a contract. Opt-in via `--strict-expected` is the
   right knob.
2. **Auto-update PLAN.md to match actual.** Defeats the purpose: the
   plan is a *promise*, the summary is a *report*. They should be
   audited against each other, not silently converged.
3. **Per-file optional vs required marker (e.g.
   `expected-key-files: [lib/foo.js, "lib/bar.js?"]`).** Over-engineered
   for v0.8. Keep flat array; revisit if users ask.

## Components

- **lib/milestone.js**
  - `_extractExpectedKeyFiles(phaseDir, planId)` — reads PLAN.md
    frontmatter, returns `string[] | null`. Null = field absent (skip).
  - `_diffExpectedVsActual(expected, normalised)` — computes
    `{ unexpected: string[], missingExpected: string[] }` from
    expected list and `normalised['key-files'].{created,modified}`.
  - `writeSummary` calls both after P2/P3, before stamping end-commit.
    Always emits stderr notice on drift; appends a sentence to
    `normalised['key-decisions']` on drift unless caller passed
    `--no-expected-check`. `--strict-expected` raises ValidationError.

- **lib/lifecycle.js**
  - Mirror via lazy require, same as P2/P3 pattern.

- **templates/phase-PLAN.md** + **templates/PLAN.md** (sub-plan
  template):
  - Add commented-out `# expected-key-files: []` line in frontmatter
    showing the schema.

- **bin/commands/write-summary.js**
  - `--no-expected-check` flag (default on)
  - `--strict-expected` flag (default off — hard-block on drift)

## Data flow

```
plan-time:
  user edits PLAN.md, declares:
    expected-key-files: [lib/foo.js, test/foo.js]

write-summary time:
  1. P1: end-commit stamped
  2. P2: actual key-files auto-filled from git diff
  3. P3: file-exists hard-block
  4. P5 (new):
     expected ← _extractExpectedKeyFiles(phaseDir, planId)
     if expected == null: skip
     actual   ← union of normalised.key-files.{created, modified}
     {unexpected, missingExpected} ← _diffExpectedVsActual(expected, normalised)
     if either non-empty:
       stderr.write(formatted message)
       if !--strict-expected:
         append to normalised.key-decisions:
           "expected-vs-actual drift: N unexpected (...), M missing (...)"
       else:
         throw ValidationError
  5. SUMMARY written
```

## Testing strategy

- **Unit (lib/milestone.js):**
  - `_extractExpectedKeyFiles` happy / no frontmatter / no field /
    field is empty array / field is a string (malformed).
  - `_diffExpectedVsActual` happy / all match / all unexpected / all
    missing / both / case where actual is undefined.
  - `writeSummary` happy match / unexpected drift / missing drift /
    both / `--no-expected-check` / `--strict-expected` ValidationError.
- **CLI dryrun (dryrun-write-summary.js):** +4 assertions for the new
  flags and the stderr notice.

## Open questions / deferred

- **Path normalisation:** GSD-style normalisation already lives in
  P2/P3. Reuse the same helper. Don't reinvent.
- **Aggregation at milestone close:** SUMMARY's
  `expected-vs-actual-drift` (if added as a separate frontmatter field
  later) would let `cp complete-milestone` summarise drift across all
  phases. Defer — for now just lives in `key-decisions` prose.
- **Plan-edit suggestion:** Could print "Update PLAN.md to add: …"
  with copy-pasteable yaml. Defer to a future polish phase.

## Risks

- **Friction:** If most users skip the field, P5 is dormant. That's
  fine — opt-in is the design. We'll measure adoption in v0.8
  retrospective.
- **False positives from refactors:** A rename `lib/a.js → lib/b.js`
  shows up as `actual = [lib/b.js]` and if expected was `[lib/a.js]`
  P5 cries drift. Mitigation: P2's rename-aware diff already collapses
  renames to the new path; users update expected at that point.
  Acceptable trade-off.

## References

- Milestone DESIGN: `.planning/milestones/v0-8-consistency/DESIGN.md`
  (P5 row in the mechanisms table)
- Prior art (P2 auto-fill): `lib/milestone.js::_autoFillKeyFiles`
- Prior art (P3 hard-block + opt-out): `lib/milestone.js::_checkKeyFilesExist`
