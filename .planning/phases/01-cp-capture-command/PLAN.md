---
phase: "1"
name: cp-capture command
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-19
---

# Phase 1: cp-capture command

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-19

## Goal

Add `cp capture`/`cp inbox` CLI plus `/cp-capture` slash command for ad-hoc inbox triage — append free-form notes to `.planning/INBOX.md`, then route them later to phases, milestones, or quick tasks.

## Success Criteria

1. `cp capture "<text>"` appends a timestamped entry to `.planning/INBOX.md` and scoped-commits it.
2. `cp inbox` lists open entries; `cp inbox --tick N --note <dest>` triages.
3. `/cp-capture` slash command walks the user through triaging with the destination vocabulary `quick:* | phase:* | milestone-seed:* | note:* | discard`.

## Plans

- [x] 01-01: `lib/inbox.js` pure helpers + `test/unit-inbox.js` (45 assertions)
- [x] 01-02: `cp capture` + `cp inbox` CLI handlers in `bin/cp.js`
- [x] 01-03: `/cp-capture` slash command + `templates/INBOX.md`

## Notes

<!-- Free-form during phase execution. -->
