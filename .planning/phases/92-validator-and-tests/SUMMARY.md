# Phase 92 — validator-and-tests

**Outcome:** ✅ Complete
**Date:** 2026-05-29
**Commits:** `bc70b29`, `619223a`, `2453743` (plan ticks); follow-up commit adds source.

## What was built

Pure-functional validator at `lib/workflow-template-validate.js`:

- `TemplateValidationError` — structured error with `filePath`, `phaseId`,
  `fieldPath`, `rule`, `token`.
- `ALLOWED_PARAM_FIELDS` — frozen list of the 5 fields where `${...}` and
  `{{...}}` tokens are legal (`skill`, `prompt`, `description`,
  `max_children`, `min_children`).
- `FORBIDDEN_PARAM_FIELDS` — frozen list of the 12 fields where any token
  is rejected (`id`, `parent`, `after`, `depends_on`, `optimizable`,
  `runner`, `outputs`, `title`, `require`, `invoke`, `config_fallback`,
  `completion`).
- `validatePreExpand(phase, opts)` — walks every leaf string; rejects
  dotted tokens (`{{x.y}}`) anywhere and rejects any token in
  non-whitelisted fields.
- `validatePostExpand(phase, opts)` — walks every leaf string; rejects
  any leftover `{{...}}` token.

Tests at `test/unit-workflow-template-validate.js` cover all three plans
(28 cases). Full suite green (`npm test`). `cp audit --json` shows
`summary.high = 0`.

## Design decisions

- Validator does NO I/O. The loader (Phase 93) decides when to call it
  and supplies `filePath` / `phaseId` for error context.
- `${...}` config tokens are validated by the existing config-resolver;
  this validator only enforces *which fields* may carry them, plus the
  `{{...}}` rules.
- Post-expand uses a broad `\{\{[^{}]*\}\}` regex to catch leftovers of
  any shape (the simple-token regex `[A-Za-z_]\w*` would miss
  `{{item.id}}`, which is exactly the bug we're guarding against).
- `walkLeaves` deliberately ignores class instances (only walks plain
  objects + arrays), matching `substituteArgs` semantics.
- `skipFields` opt lets the loader exclude engine-internal markers
  (anything prefixed with `_`) from validation.

## Next phase

**93 — wire-validator-into-loader.** Pre-expand hook in
`lib/workflow-template-expand.js` before the existing `substituteArgs`
call (L364), post-expand hook after. Also hook into `lib/workflow.js`
top-level pass at L114 (which currently uses `allowUndeclared: true`).
