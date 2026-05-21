# Inbox

Quick captures awaiting triage. Use `cp capture "..."` to add an item,
`cp inbox` to list, and the `/cp-capture` slash command to process them
interactively (route each to a quick task, phase, seed, or discard).

## Open

- [ ] [2026-05-20T12:59] v0.7: per-phase DESIGN.md template — first-class home for SP brainstorm/discuss output. Currently only MILESTONE-CONTEXT.md exists (transient, lost on milestone close). Spec: templates/DESIGN.md scaffolded by cp scaffold-phase; cp-plan-phase Step 3.5 'before delegating to writing-plans, prompt user to capture design intent if non-trivial'; aggregator pulls DESIGN.md into milestone roll-up alongside SUMMARYs.
- [ ] [2026-05-21T11:17] v0.9 UX: /cp-map-codebase should auto-run cp init if .planning/ missing (case 2 onboarding). Print explicit notice when it auto-inits so user knows. Don't auto-init silently. Goal: one-command start for 'existing code, no planning yet'.
- [ ] [2026-05-21T11:17] v0.9 UX: new cp upgrade command for case 4 (existing cp project, version bump). Should: (1) detect harness from existing skill dirs, (2) cp install <harness> --force, (3) cp config refresh, (4) cp reconcile --all --infer-shas if crossing 0.8 boundary, (5) cp audit --fix for safe drift, (6) print summary. Goal: one-command upgrade equivalent to /cp-new-project for fresh.
- [ ] [2026-05-21T11:17] v0.9 docs: README install section should document the 4 starting paths explicitly as a decision matrix: greenfield, existing-code-no-planning, existing-code-gsd, existing-code-cp-upgrade. Today only the greenfield path is well-documented.
- [ ] [2026-05-21T11:25] v0.9 design clarification for 'cp upgrade': it ONLY upgrades per-repo state (skill files, config, SHAs, drift fixes), does NOT touch the npm package by default. Reasons: sudo surprises, package-manager neutrality (yarn/pnpm/source), chicken-and-egg with currently-loaded binary, single-responsibility. Add OPTIONAL --npm flag for one-liner UX (runs npm install -g then re-execs). Standard flow: 'npm install -g context-planning@latest && cd repo && cp upgrade'. Matches convention: terraform init -upgrade, rails app:update, gh extension upgrade.
- [ ] [2026-05-21T11:39] v0.9 cp upgrade — revised design after studying /gsd-update precedent. GSD uses 'npx -y --package=get-shit-done-cc@latest -- get-shit-done-cc --global' which fetches AND installs in one shot. No sudo (npx is per-user cache), package-manager-neutral (npx ships with node), no chicken-and-egg (skill exits before npx returns). cp should mirror this: documented one-liner is 'npx -y --package=context-planning@latest -- cp upgrade'. The 'cp upgrade' subcommand itself only does per-repo state work (install --force, config refresh, SHA backfill, audit --fix) so it works standalone too. This supersedes inbox #5's '--npm flag' suggestion.
- [ ] [2026-05-21T11:41] v0.9 RENAME + BEHAVIOR LOCK: command is 'cp update' (not 'cp upgrade'), matches /gsd-update naming. Behavior matches GSD one-liner pattern: documented invocation is 'npx -y --package=context-planning@latest -- cp update' which fetches AND installs in one shot. Standalone 'cp update' (if binary already current) only does per-repo refresh: cp install <harness> --force, cp config refresh, SHA backfill migration, cp audit --fix. Supersedes inbox #3 ('cp upgrade' name) and #5/#6 (separation debate — RESOLVED in favor of GSD-style one-liner).

## Triaged

<!-- triaged items move here as: `- [x] [YYYY-MM-DDTHH:mm] → <destination>: <text>` -->
