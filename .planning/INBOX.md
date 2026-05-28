# Inbox

Quick captures awaiting triage. Use `cp capture "..."` to add an item,
`cp inbox` to list, and the `/cp-capture` slash command to process them
interactively (route each to a quick task, phase, seed, or discard).

## Open


## Triaged

- [x] [2026-05-28T07:28] BUG/cp: complete-milestone verify failed for v1.5 phase shape (`plansTotal===0` + phase-level SUMMARY.md). Fixed in `lib/milestone.js:verifyMilestoneComplete` by accepting two completion shapes (pre-v1.5 checklist + v1.5 pass-through). See `.planning/quick/2026-05-28-find-the-verify-warning-recorded-for-future-fix-from-last-milestone-v1-5-role-skill-semantics-complete-time-and-investigate-what-s-going-on/SUMMARY.md`.

- [x] [2026-05-20T12:59] → phase 35: per-phase DESIGN.md template — first-class home for SP brainstorm/discuss output (v0.9 Onboarding milestone)
- [x] [2026-05-21T11:17] → phase 32: /cp-map-codebase auto-init when .planning/ missing (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 33: new cp update command — case 4 onboarding (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 34: README 4-row onboarding decision matrix (v0.9 Onboarding)
- [x] [2026-05-21T11:25] → phase 33 (superseded by #7): cp upgrade per-repo-only design — REJECTED in favor of GSD-style npx one-liner
- [x] [2026-05-21T11:39] → phase 33 (superseded by #7): cp upgrade npx-fronted design v1 — superseded by RENAME LOCK
- [x] [2026-05-21T11:41] → phase 33: RENAME + BEHAVIOR LOCK — command is `cp update` with `npx -y --package=context-planning@latest -- cp update` one-liner
