---
phase: "33"
name: cp update command
milestone: v0.9 Onboarding
status: in-progress
created: 2026-05-21
base-commit: e4f431c8bd443eadbe527fac2b9ae2453ba9565d
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

# Phase 33: cp update command

**Milestone**: v0.9 Onboarding
**Created**: 2026-05-21

## Goal

Ship `cp update` — a new CLI subcommand that refreshes per-repo cp state
(skill files, config defaults, drift fixes) — plus the documented
npx-fronted one-liner `npx -y --package=context-planning@latest -- cp update`
that combines binary fetch and per-repo refresh into one user-typed command.
Closes case-4 onboarding (existing cp project, version bump).

## Success Criteria

1. `cp update` subcommand exists, dispatches from registry, and shows up in
   `cp help`.
2. Running `cp update` in an installed cp repo:
   - detects harness from existing skill dirs (copilot/claude/cursor/aider)
   - re-runs `cp install <harness> --force` to refresh skill files
   - re-runs `cp config refresh` to merge new defaults
   - runs `cp audit --fix` to clean any drift
   - prints a clear summary of what changed
3. `--dry-run` previews everything without writing.
4. `--check` exits non-zero if any step would change anything (CI-friendly).
5. Exits non-zero if `.planning/` is missing — does NOT auto-init for this
   command (too risky; user should run `cp init` deliberately).
6. README documents `npx -y --package=context-planning@latest -- cp update`
   as the canonical case-4 invocation.
7. `/cp-update` slash-command skill exists in `commands/cp/update.md` so all
   harness installers ship it on next install.
8. Tests cover: command dispatch, harness detection, dry-run, --check,
   missing-`.planning/` error, end-to-end happy path.

## Plans

- [ ] 33-01: `cp update` CLI subcommand
       Implement `bin/commands/update.js` + register in `bin/commands/index.js`.
       Add `lib/update.js` for the orchestration (harness detect, refresh
       loop). Add `cp update` row to `bin/commands/_usage.js`. Unit tests
       in `test/unit-update.js`.
- [ ] 33-02: `/cp-update` skill + README docs
       Author `commands/cp/update.md` mirroring `/gsd-update`'s structure
       (with cp-specific behavior). Update README "Updating an existing
       install" section to document the `npx ...` one-liner as the primary
       path. Add CHANGELOG `[Unreleased]` entry under "Added".

## Notes

- **Harness detection**: read `.planning/config.json` `cp.harness` first;
  fall back to looking for `.github/skills/cp-*/`, `.claude/commands/cp/`,
  `.cursor/rules/cp/`, `.aider.conf.yml`.
- **SHA backfill**: deferred to v0.10. If a user has a pre-0.8 repo they
  can still call `cp reconcile --all --infer-shas` manually. The DESIGN.md
  mentioned this as auto-step #4; pragmatic decision is to skip auto-backfill
  in v0.9 because it's a destructive write that warrants explicit consent.
  Audit will flag missing SHAs and the user can run reconcile themselves.
- **No version tracking file**: open-question #1 from milestone DESIGN.md
  resolves to "no, not in v0.9". `cp update` is stateless w.r.t. previous
  cp version; it just re-applies current-version templates idempotently.
  Cross-version migrations can be added later if needed.
- **npx semantics**: the one-liner `npx -y --package=context-planning@latest
  -- cp update` works because npm-published `context-planning` package
  exposes `cp` as a bin entry. npx fetches the latest version into its
  per-user cache and runs `cp update` from it against the cwd.
