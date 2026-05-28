# Inbox

Quick captures awaiting triage. Use `cp capture "..."` to add an item,
`cp inbox` to list, and the `/cp-capture` slash command to process them
interactively (route each to a quick task, phase, seed, or discard).

## Open

- [ ] [2026-05-28T07:28] BUG/cp: complete-milestone --dry-run fails on milestones whose phases use the legacy pass-through model (PLAN.md+SUMMARY.md per phase dir, 0 plan checkboxes in ROADMAP). cp status reports 'All plans done' (0/0) but milestone.verifyMilestoneComplete requires plansTotal>0, so verify exits non-zero. Workaround: --force. Fix idea: treat plansTotal===0 + per-phase SUMMARY.md present as a valid completion shape, OR have cp new-milestone always scaffold at least one plan checkbox per phase. Surfaced while closing v1.5.

## Triaged

- [x] [2026-05-20T12:59] → phase 35: per-phase DESIGN.md template — first-class home for SP brainstorm/discuss output (v0.9 Onboarding milestone)
- [x] [2026-05-21T11:17] → phase 32: /cp-map-codebase auto-init when .planning/ missing (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 33: new cp update command — case 4 onboarding (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 34: README 4-row onboarding decision matrix (v0.9 Onboarding)
- [x] [2026-05-21T11:25] → phase 33 (superseded by #7): cp upgrade per-repo-only design — REJECTED in favor of GSD-style npx one-liner
- [x] [2026-05-21T11:39] → phase 33 (superseded by #7): cp upgrade npx-fronted design v1 — superseded by RENAME LOCK
- [x] [2026-05-21T11:41] → phase 33: RENAME + BEHAVIOR LOCK — command is `cp update` with `npx -y --package=context-planning@latest -- cp update` one-liner
