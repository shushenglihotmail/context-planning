# Phase 75 — Docs + CHANGELOG + v1.5.0 release

**Status:** complete

## What changed

- `CHANGELOG.md` — new `[1.5.0]` section under "Unreleased" covering all three root causes of the v1.4 cp-quick bug (token interpolation, skill routing, missing `prompt:` on quick/milestone), the new role/skill orthogonality, persona role params, and the integration test. Includes a Migration sub-section for custom workflow authors.
- `README.md`:
  - bumped expected `cp --version` line to `1.5.x`
  - new "Role vs. skill (v1.5)" subsection under Workflow Engine explaining persona vs. routing key, the warn/error semantics, and `${config.…}` resolution at load time.
- `package.json` — version bumped `1.4.0` → `1.5.0`.

## Verification

- `cp --version` → `1.5.0`.
- `node test/integration-v15-builtin-templates.js` → 7/7 pass.
- Full `npm test` was green in phase 74; no source changes in phase 75.

## Commits

- `phase 75: docs + CHANGELOG + bump to v1.5.0`
