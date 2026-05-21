# Phase 31 Design — Docs + v0.8.0 release

## Context

v0.8 has shipped the full drift-defense stack (phases 17-30):
- **Detect**: `cp audit` with 9 checks
- **Repair**: `cp audit --fix`, `cp reconcile` (single + bulk), `cp supersede`,
  `cp deviate`, `cp scaffold-phase --continue`
- **Prevent**: `cp install --hooks` (pre-commit + post-commit), `cp install --ci`
- **Literacy**: drift-defense block injected into all 4 harness installers

Phase 31 ships the docs that make this surface discoverable and pushes
v0.8.0 to npm.

## Decision

Two plans:

1. **docs/drift-playbook.md** — single-doc walkthrough of the
   prevent/detect/repair stack. Covers:
   - The 3 layers, what each one defends against
   - Audit walkthrough (9 checks, severity model, common findings)
   - Repair playbook keyed by finding id (mirrors agent-instructions.md
     table but with more context + examples + when NOT to use each verb)
   - `reconcile --accept` destructive warning — call out loud that it
     overwrites the plan to match code, not the other way around
   - Hooks setup + opt-in `behavior.post_commit: tick-auto`
   - CI template integration steps
   - Migrating a pre-v0.8 project (`cp reconcile --all --infer-shas`)

2. **Release v0.8.0**:
   - Finalize CHANGELOG.md `[Unreleased]` → `## [0.8.0] - YYYY-MM-DD`
   - Bump package.json version 0.7.1 → 0.8.0
   - `npm publish` (user has account; 2FA TBD)
   - `cp complete-milestone v0-8-consistency`

## Alternatives considered

1. **Skip the playbook, rely on `cp --help`** — `--help` lists verbs but
   doesn't teach when to reach for each. The 3-layer mental model is
   what makes v0.8 click; needs prose. Rejected.
2. **Embed playbook in README** — README is already long; better as a
   linked sub-doc. README gets a "Drift defense" section that links to
   the playbook. Accepted.
3. **Defer milestone-complete to a separate phase** — adds bureaucracy
   for one shell command. Roll it into 31-02. Accepted.

## Scope (this phase)

- `docs/drift-playbook.md` (new ~4-6KB doc).
- `README.md` updates: add "Drift defense (v0.8)" section linking to playbook.
- `CHANGELOG.md`: finalize 0.8.0 entry from existing Unreleased notes.
- `package.json`: 0.7.1 → 0.8.0.
- `npm publish` (manual, user-driven; test with `--dry-run` first).
- `cp complete-milestone v0-8-consistency`.

## Out of scope

- Detailed walkthrough of every audit check (covered in `cp audit --help`).
- Per-harness install guides for hooks/CI (covered in agent-instructions.md).
- v0.9 planning.
