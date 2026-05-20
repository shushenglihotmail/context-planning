---
phase: "15"
name: Docs + v0.6.0 release
milestone: v0.6 Quality Wave
status: in-progress
created: 2026-05-20
---

# Phase 15: Docs + v0.6.0 release

**Milestone**: v0.6 Quality Wave
**Created**: 2026-05-20

## Goal

Ship v0.6.0: CHANGELOG entry, version bump, full regression run, tag, push, GitHub release.

## Success Criteria

1. `npm test` and `npm run coverage:ci` both pass locally
2. CI green on tag push (5/5 jobs)
3. v0.6.0 GitHub release published with CHANGELOG excerpt
4. Milestone closed via `cp complete-milestone`

## Plans

- [x] 15-01: CHANGELOG + version bump + tag + release

## Notes

Sequence:
1. CHANGELOG.md v0.6.0 entry written (added/fixed/notes-for-users)
2. package.json + package-lock.json bumped 0.5.0 → 0.6.0
3. `npm test` + `npm run coverage:ci` clean locally
4. Commit, push, watch CI
5. Tag v0.6.0 + `git push origin v0.6.0`
6. `gh release create v0.6.0 --title "v0.6.0 — Quality Wave" --notes "<excerpt>"`
7. `cp complete-milestone --no-commit` to close the milestone in state docs
