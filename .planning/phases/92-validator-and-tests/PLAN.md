---
phase: "92"
name: validator-and-tests
milestone: Template parameterization whitelist
status: in-progress
created: 2026-05-29
base-commit: e5d525c84293bdb5a6f03734b17527cb0847ac9b
expected_files:
  - lib/workflow-template-validate.js
  - test/unit-workflow-template-validate.js
---

# Phase 92: validator-and-tests

**Milestone**: Template parameterization whitelist
**Created**: 2026-05-29

## Goal

Add a pure-functional template validator (`lib/workflow-template-validate.js`)
with two entry points — `validatePreExpand` and `validatePostExpand` — and a
structured `TemplateValidationError`. No wiring into the loader yet (Phase 93
does that). TDD: every rule has a positive and a negative test.

## Success Criteria

1. `lib/workflow-template-validate.js` exports `validatePreExpand`,
   `validatePostExpand`, and `TemplateValidationError`.
2. `node test/unit-workflow-template-validate.js` passes.
3. `npm test` stays green (no integration yet).

## Plans

- [x] 92-01: Define `TemplateValidationError`, the whitelist constants
       (`ALLOWED_PARAM_FIELDS`, `FORBIDDEN_PARAM_FIELDS`), regexes for token
       detection (`SIMPLE_TOKEN_RE` for `{{name}}`, `DOTTED_TOKEN_RE` for
       `{{x.y}}`, `CONFIG_TOKEN_RE` for `${config.x}`). Add unit-test
       skeleton `test/unit-workflow-template-validate.js`. Smoke test
       imports + error-class shape.
- [x] 92-02: Implement `validatePreExpand(phase, opts)`. Walks each field
       of the phase body; for non-whitelisted fields rejects on any
       `${...}` or `{{...}}` token; rejects `{{x.y}}` style anywhere
       regardless of field. Tests: 1 positive case per allowed field
       carrying a token, 1 negative case per forbidden field, dedicated
       `{{item.id}}` cases (in allowed field too — must still reject),
       walks nested arrays and objects.
- [x] 92-03: Implement `validatePostExpand(phase, opts)`. Walks each
       field; rejects on any leftover `{{...}}` token (dotted or simple).
       Tests: positive case (fully substituted phase passes), negative
       cases (leftover simple `{{name}}` rejects; leftover dotted
       `{{item.id}}` rejects; leftover in array element rejects).

## Notes

- Validator file lives at `lib/workflow-template-validate.js` (sibling of
  `workflow-template-expand.js`).
- Phase = the resolved YAML body object (`{id, prompt, after, ...}`), not
  the wrapper.
- Allowed fields: `skill`, `prompt`, `description`, `max_children`,
  `min_children`.
- Forbidden fields: `id`, `parent`, `after`, `depends_on`, `optimizable`,
  `runner`, `outputs`, `title`, `require`, `invoke`, `config_fallback`,
  `completion`.
- `TemplateValidationError` properties: `filePath`, `phaseId`, `fieldPath`,
  `rule`, `token`, plus standard `message` formatted from those.

