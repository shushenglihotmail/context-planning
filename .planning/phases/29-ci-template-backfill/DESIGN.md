# Phase 29 Design — CI template + reconcile --all backfill

## Context

Phases 24-28 shipped local detect/fix/repair/enforce layers. CI is the
last line of defense — even if a developer skips the pre-commit hook
(`git commit --no-verify`), a CI run on the PR will catch HIGH drift.

Separately, this repo and any upgrader-from-v0.7-or-earlier carries
legacy plans missing `base-commit` / `end-commit` SHAs (62 MEDIUM
findings on this repo today). The phase 26 `cp reconcile` verb fixes
these per-phase; we need a one-shot `--all` mode to backfill the entire
project without manually walking every phase.

## Decision

Two-part scope:

**Part A — CI template** (`templates/ci/cp-audit.yml.example`):
- GitHub Actions workflow that installs node + cp from npm and runs
  `cp audit --severity high`. Fails the PR on any HIGH finding.
- `cp install --ci` flag copies the template into the project as
  `.github/workflows/cp-audit.yml`. Idempotent; refuses to overwrite a
  user-modified file without `--force`.

**Part B — `cp reconcile --all` / `--phase <range>`**:
- `--all`: enumerate every phase under `.planning/phases/` and run
  `reconcilePhase` for each. Aggregates fix counts + errors.
- `--phase <range>`: accepts `N`, `N-M`, or `N..M` to scope backfill.
- Both compose with existing `--infer-shas`, `--accept`, `--plan`,
  `--dry-run`, `--json`, `--no-commit`.

After this lands, we run `cp reconcile --all --infer-shas` on this
repo and commit the backfill — should clear all 62 legacy MEDIUMs in a
single commit.

## Alternatives considered

1. **Bake CI into `cp init`** — pollutes new projects with a workflow
   they may not want. Explicit `cp install --ci` is cleaner.
2. **Lock CI to GitHub Actions only** — yes, for now. GitLab/Azure
   templates can land in a future phase if asked.
3. **`reconcile --all` as a separate verb (e.g. `cp backfill`)** —
   duplicates state. Flag is fine; semantics match.

## Scope (this phase)

- `templates/ci/cp-audit.yml.example` (new).
- `bin/commands/install.js`: add `--ci` flag (separate short-circuit
  branch like `--hooks`).
- `bin/commands/reconcile.js`: add `--all`, `--phase <range>` flags.
- `lib/reconcile.js`: add `reconcileAll(root, opts)` driver +
  `_parsePhaseRange(str)` helper.
- Tests: unit for `reconcileAll` + range parsing; dryrun for
  `cp install --ci` + `cp reconcile --all`.
- Run `cp reconcile --all --infer-shas` on this repo as the final
  dogfood step and commit the cleanup.

## Out of scope

- Posting PR comments from CI (future).
- GitLab/Azure templates (future).
