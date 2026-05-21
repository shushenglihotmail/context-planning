---
phase: "24"
name: cplan audit detection
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: 5b03793cce85438006c250f4951484003a6aa59b
expected-key-files:
  "24-01":
    - lib/audit.js
    - test/unit-audit.js
  "24-02":
    - bin/commands/audit.js
    - bin/commands/index.js
    - bin/commands/_usage.js
    - test/dryrun-audit.js
    - package.json
  "24-03":
    - .planning/codebase/STRUCTURE.md
    - .planning/CHANGELOG.md
---

# Phase 24: cplan audit detection

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Base commit**: `5b03793`

## Goal

Ship `cplan audit` (alias `cp audit`) — a read-only drift sweep that
catalogues every detected drift across the project with severity, location,
and a recommended fix. JSON + human output; exit codes for CI.

## Success Criteria

1. `cp audit` in a clean cp project → exits 0 silently (or with
   "no findings").
2. `cp audit` in a project with planted drift (e.g. ticked plan without
   SUMMARY) → exits 1 (LOW/MED) or 2 (HIGH), prints findings grouped by
   severity.
3. `cp audit --json` → valid JSON shape `{ findings, summary, exit_code }`.
4. `cp audit --strict` → any finding triggers exit 2.
5. New unit + dryrun tests; full `npm test` green.

## Plans

- [x] 24-01: `lib/audit.js` check registry + runAudit + unit tests
- [ ] 24-02: `bin/commands/audit.js` CLI + dryrun tests + register in index/usage
- [ ] 24-03: dogfood audit on this repo, capture findings, brief docs update

## Notes

DESIGN.md has the check registry (9 checks). Severity policy:
HIGH = data inconsistency that breaks tooling; MEDIUM = silent drift
that compounds; LOW = informational.

Check fn signature: `(root, ctx) -> [findings]` where `ctx` carries
shared state (parsed ROADMAP, phase list). Per-check errors are
caught and converted to LOW `check-error` findings — never crash.
