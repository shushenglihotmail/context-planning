---
phase: "39"
name: collapse-aware-complete-milestone
milestone: v0.10.1 Collapse-aware milestone close
status: in-progress
created: 2026-05-22
base-commit: d48db17886d96c5ec7665bcf4d7b7cc52fc6450a
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 39: collapse-aware-complete-milestone

**Milestone**: v0.10.1 Collapse-aware milestone close
**Created**: 2026-05-22

## Goal

Make `cp complete-milestone` (and the underlying lookup utilities) idempotent
and tolerant of milestones already collapsed in ROADMAP.md (whether by a
previous run, by `writing-plans` skill's final-phase wrap, or by hand).

## Bug

User reported (2026-05-21):

> `cp complete-milestone` returns `milestone-not-found` when ROADMAP.md
> has already been collapsed into `<details>/<summary>` with ✅.

Reproduced with a 1-line fixture (ROADMAP with `<summary>✅ v0.16 ...
SHIPPED 2026-05-21</summary>` and no `### v0.16` heading) →
`cp complete-milestone --json "v0.16 Bug Repro"` returns
`{"reason":"milestone-not-found"}` exit 1.

## Root cause

`lib/milestone.js:findMilestoneInRoadmap` only walks `### ` markdown
headings. Once a milestone is collapsed, the name lives only inside
`<summary>`. Parser misses it. `lib/lifecycle.js:statusReport` has the
same blind spot (no STATE.md `milestone:` fallback).

## Success Criteria

1. `cp complete-milestone "<name>"` against a ROADMAP where that
   milestone is already wrapped in `<details><summary>✅ <name> ...
   SHIPPED <date></summary>...</details>` no longer returns
   `milestone-not-found`. It reports `already-shipped` cleanly (exit 0,
   no-op) if MILESTONES.md already has the digest, OR completes the
   remaining bookkeeping (append digest, reset STATE, delete
   MILESTONE-CONTEXT, commit).
2. `cp status` against the same ROADMAP shows the right milestone name
   when only STATE.md's frontmatter knows it (fallback path).
3. `findMilestoneInRoadmap` returns `status: 'shipped'` + correct
   `phases` array when matching a `<summary>` line.
4. New unit assertions cover the bug fixture verbatim.
5. Full `npm test` chain still green.
6. v0.10.1 patch published: README hint bumped, CHANGELOG entry,
   tag pushed, GitHub release.

## Plans

- [ ] 39-01: Fix `findMilestoneInRoadmap` + `statusReport` STATE.md
      fallback + `completeMilestone` already-shipped handling, with
      unit tests, then cut v0.10.1 release.

## Notes

- One atomic plan: the three changes are tightly coupled and share a
  regression fixture.
- `<summary>` self-written format:
  `✅ {name} (Phases X-Y) — SHIPPED YYYY-MM-DD`. Detector tolerates
  whitespace variants and `-` / `—` em-dash forms.
- Idempotency: detect "already shipped + digest already in
  MILESTONES.md" and exit clean. No `--force` flag needed.
