---
phase: "21"
name: Plan-time expected-key-files
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: 3847655596be401997da1a9470a8188cd4c4448f
---

# Phase 21 — Plan-time expected-key-files

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Design**: see [DESIGN.md](./DESIGN.md)

## Goal

Add an optional `expected-key-files` array to PLAN.md frontmatter. At
`cp write-summary`, compute symmetric difference against the actual
(P2-auto-filled) `key-files`; emit a stderr notice and record the
deviation in `key-decisions`. Hard-block only when
`--strict-expected` is set.

## Success Criteria

1. PLAN.md without `expected-key-files` field → writeSummary behaves
   exactly as today (no warning, no failure). Backwards-compatible
   migration.
2. PLAN.md *with* `expected-key-files: [lib/foo.js]` and actual diff
   touches only lib/foo.js → silent.
3. PLAN.md expected = [lib/foo.js], actual = [lib/foo.js, lib/bar.js]
   → stderr `expected-vs-actual drift: 1 unexpected (lib/bar.js)`
   and a sentence appended to `key-decisions` in the SUMMARY.
4. PLAN.md expected = [lib/foo.js, lib/baz.js], actual = [lib/foo.js]
   → stderr names the missing file; same key-decisions appendage.
5. `--strict-expected` raises ValidationError on any drift; exit 2 from
   the CLI.
6. `--no-expected-check` opts out cleanly (no stderr, no key-decisions
   change) even when drift exists.
7. All existing tests still pass.

## Plans

- [x] 21-01: lib helpers + writeSummary integration + templates
- [x] 21-02: CLI flags + dryrun integration test

## Notes

Reuse existing patterns:
- Lazy require pattern from P3 for the lifecycle mirror.
- `_normalisePath` from `lib/milestone.js` (if present) for path
  matching; otherwise normalise both sides via `posix` joins to dodge
  Windows backslash quirks.
- Stderr notice format mirrors P2/P3: `cp: ...` prefix, one-line
  summary, multi-line detail indented.
