# Phase 30 Design — Agent literacy injection

## Context

v0.8 ships a complete drift-defense stack (audit → fix → reconcile →
hooks → CI) but if the **AI agent** doesn't know to USE these verbs at
the right moments, the user pays the discoverability tax forever. We
need to inject "drift-defense literacy" into each harness's instruction
block so the agent surfaces the right verb when patterns appear:

- "I notice base-commit is missing → suggest `cp reconcile <phase> --infer-shas`"
- "I just made a non-code change but PLAN.md claims a feature → suggest `cp audit`"
- "Plan rescoped mid-execution → suggest `cp deviate` or `cp supersede`"
- "Tests passing but plan slug feels wrong → suggest `cp audit --fix`"

## Decision

Add a single shared `templates/agent-instructions.md` with the
drift-defense literacy block, plus a `buildDriftDefenseBlock()` helper
in `install/common.js`. Each of the 4 installers (copilot, claude,
cursor, aider) calls the helper and appends the returned text to its
existing instruction body. Cp-owned begin/end markers
(`<!-- cp:drift-defense -->`) make re-install idempotent —
old block is stripped, new one appended.

Block contents:

1. **When to suggest `cp audit`**: after long execution sessions, before
   shipping, when user mentions "drift" or "out of date".
2. **When to suggest `cp audit --fix`**: when audit shows
   state-stale / summary-without-tick / missing-base-commit /
   missing-end-commit findings (the 4 auto-fixers).
3. **When to suggest `cp reconcile`**: SHA-related findings or when
   importing pre-v0.8 projects.
4. **When to suggest `cp supersede` vs `cp deviate`**: rescope vs.
   one-off divergence.
5. **When to suggest `cp install --hooks` / `--ci`**: at project
   initialisation or after first `cp audit` shows clean.

## Alternatives considered

1. **Hand-edit each of 4 installer template strings** — ~4x the
   maintenance burden, drifts trivially. Rejected.
2. **One central instruction file that REPLACES all per-harness blocks** —
   strips harness-specific guidance (slash-command names, install
   instructions). Rejected; keep harness-specific intro + share the
   drift block.
3. **Skip injection entirely; let users discover via `cp --help`** —
   makes v0.8 invisible to AI agents, which IS the value prop.
   Rejected.

## Scope (this phase)

- `templates/agent-instructions.md` (new shared content).
- `install/common.js`: add `buildDriftDefenseBlock()` exported helper.
- `install/copilot.js`: append drift block to existing ctxBody.
- `install/claude.js`: append drift block inside existing CP_BLOCK.
- `install/cursor.js`: same pattern.
- `install/aider.js`: same pattern.
- Tests: unit for `buildDriftDefenseBlock` content; existing
  unit-installers.js extended to check drift block presence.

## Out of scope

- Per-harness customisation of drift block wording (future).
- Localisation (future).
