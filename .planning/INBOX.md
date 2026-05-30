# Inbox

Quick captures awaiting triage. Use `cp capture "..."` to add an item,
`cp inbox` to list, and the `/cp-capture` slash command to process them
interactively (route each to a quick task, phase, seed, or discard).

## Open

- [ ] [2026-05-28T22:19] Restrict workflow template parameterization to a whitelist (skill, prompt, description, max_children, min_children); forbid {{item.X}} and any unresolved {{...}} tokens after expansion. Audit built-in templates (workflows + phases) and migrate any non-conforming usage. Decide whether the same rule applies to phase templates. Origin: cp-quick docs.yaml work surfaced silent literal-string bug from un-templated {{item.id}}.
- [ ] [2026-05-30T11:11] YAGNI: explored adding user-defined parallel route groups to workflows (third parallelism mechanism). Concluded the v1.3 `template:` (workflow-template inclusion) entry already provides exactly this — parallel sibling routes by default, route-on-route DAG via `after:`, nesting with depth limit, multi-instance via `id:` + `args:`. Run `add-user-defined-parallel-phases-in-workflow` abandoned. If discoverability/DX is the real pain, reach for docs/examples first (see _fixtures-v13/), not engine work.

## Triaged

- [x] [2026-05-20T12:59] → phase 35: per-phase DESIGN.md template — first-class home for SP brainstorm/discuss output (v0.9 Onboarding milestone)
- [x] [2026-05-21T11:17] → phase 32: /cp-map-codebase auto-init when .planning/ missing (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 33: new cp update command — case 4 onboarding (v0.9 Onboarding)
- [x] [2026-05-21T11:17] → phase 34: README 4-row onboarding decision matrix (v0.9 Onboarding)
- [x] [2026-05-21T11:25] → phase 33 (superseded by #7): cp upgrade per-repo-only design — REJECTED in favor of GSD-style npx one-liner
- [x] [2026-05-21T11:39] → phase 33 (superseded by #7): cp upgrade npx-fronted design v1 — superseded by RENAME LOCK
- [x] [2026-05-21T11:41] → phase 33: RENAME + BEHAVIOR LOCK — command is `cp update` with `npx -y --package=context-planning@latest -- cp update` one-liner
- [x] [2026-05-28T07:28] → BUG/cp: complete-milestone verify failed for v1.5 phase shape (`plansTotal===0` + phase-level SUMMARY.md). Fixed in `lib/milestone.js:verifyMilestoneComplete` by accepting two completion shapes (pre-v1.5 checklist + v1.5 pass-through). See `.planning/quick/2026-05-28-find-the-verify-warning-recorded-for-future-fix-from-last-milestone-v1-5-role-skill-semantics-complete-time-and-investigate-what-s-going-on/SUMMARY.md`.
