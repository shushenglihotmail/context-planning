# Phase 28 Design — Post-commit hook tick auto

## Context

Phase 27 wired a pre-commit *defense* (HIGH-severity audit gate). This
phase wires a post-commit *helper*: when a commit subject matches
`cp(NN-MM): ...` and the changed files cover the plan's
`expected-key-files`, automatically tick the plan in ROADMAP + PLAN.md so
the user doesn't have to run `cp tick` by hand.

This is opt-in (default `off`) because automatic ticks subtly change the
git history (a follow-up `cp: tick plan NN-MM` commit lands immediately
after the user's commit). Teams that prefer a clean linear history opt-in
via `cp.behavior.post_commit = "tick-auto"`.

## Decision

Extend `bin/cp-hook.js` post-commit branch. The dispatcher already exists
(phase 27 stubbed the `post-commit` event); this phase makes
`tick-auto` actually do something:

1. Read the LAST commit (`git log -1 --format=%s` for subject,
   `git show --name-only --format= HEAD` for files).
2. If subject doesn't match `cp(NN-MM):` (or `cp(NN-MM-...)`), exit 0.
   Critically, **ignore subjects of shape `cp:` or `cp(reconcile):`** —
   these are housekeeping commits, never imply plan completion.
3. Parse plan id NN-MM. Resolve phase dir.
4. Load plan's expected-key-files from PLAN.md (already serialized in
   phase 21).
5. If all expected created/modified files appear in the commit's file
   list, call `lifecycle.tickPlan(planId, {noCommit: false})` so the
   subsequent auto-commit subject is `cp: tick plan NN-MM`.
6. Otherwise (partial coverage), exit 0 silently — phase 25's
   write-summary already surfaces the drift when the user runs it.

The shim never *blocks* a commit (post-commit can't); it only adds a
trailing commit when the heuristic fires.

## Alternatives considered

1. **Aggressive: tick on any commit with files matching a plan** — too
   noisy; refactors would accidentally tick unrelated plans. Rejected.
2. **Tick + write-summary in one shot** — requires `key-decisions` input
   from a human; can't auto. Rejected.
3. **Run inside pre-commit** — would mutate the user's working tree
   mid-commit. Rejected; post-commit's "trailing follow-up commit" is
   cleaner.

## Scope (this phase)

- `lib/hooks.js`: add `lastCommitInfo(repoRoot)` helper exposing subject
  + changed-file list (cross-platform).
- `bin/cp-hook.js`: implement `tick-auto` action under post-commit
  dispatch (currently a placeholder).
- `lib/lifecycle.js`: small helper `tryAutoTick(planId, files)` that
  encapsulates the file-coverage decision so it's unit-testable without
  a real git repo.
- Update install: `installHooks` already writes pre-commit; extend
  HOOKS array to also write post-commit (phase 27 left HOOKS = ['pre-commit']).
- Default `behavior.post_commit` stays `off`; users flip it on explicitly.
- Tests: unit for `tryAutoTick` (file-coverage logic) + dryrun that
  drives the shim through a real git commit and verifies the trailing
  auto-tick commit.

## Out of scope

- Auto-writing SUMMARY.md (still requires key-decisions).
- CI template (phase 29).
- Backfill (phase 29).
