---
phase: "93"
name: wire-validator-into-loader
milestone: Template parameterization whitelist
status: in-progress
created: 2026-05-29
base-commit: e5d525c84293bdb5a6f03734b17527cb0847ac9b
expected_files:
  - lib/workflow-template-expand.js
  - lib/workflow-template-validate.js
  - lib/workflow.js
  - templates/workflow-templates/review-and-address.yaml
  - templates/workflows/docs.yaml
  - templates/workflows/milestone.yaml
  - templates/workflows/quick.yaml
  - test/dryrun-template-cli-v13.js
  - test/fixtures/workflows/dev-mini.yaml
  - test/fixtures/workflows/quick-mini.yaml
  - test/integration-workflow-templates-v13.js
  - test/unit-workflow-template-expand.js
  - test/unit-workflow-template-validate.js
  - test/unit-workflow-toplevel-params.js
---

# Phase 93: wire-validator-into-loader

**Milestone**: Template parameterization whitelist
**Created**: 2026-05-29
**Depends on**: Phase 92

## Goal

Hook `validatePreExpand` and `validatePostExpand` into the workflow loader
so every loaded template is validated. Violations surface through the
existing `_resolverErrors` channel.

## Success Criteria

1. A workflow file with `${config.x}` in any forbidden field is rejected.
2. A workflow file with `{{item.id}}` anywhere is rejected.
3. A workflow whose substitution leaves any `{{...}}` leftover is
   rejected post-expand.
4. All existing tests still pass.
5. Integration tests cover each rejection scenario.

## Plans

- [x] 93-01: Pre-expand hooks. (a) In `lib/workflow.js::loadTemplate`,
       call `validatePreExpand` on each top-level phase BEFORE the
       `substituteArgs` pass; capture errors into `resolverErrors`.
       (b) In `lib/workflow-template-expand.js::expandGroup`, call
       `validatePreExpand(innerRaw)` BEFORE the per-phase `substituteArgs`;
       pass `templateName` as `filePath`. Throws propagate up; the
       outer try/catch captures them.
- [x] 93-02: Post-expand pass + integration tests. (a) After all
       expansion in `loadTemplate`, walk every resolved phase and call
       `validatePostExpand`; push violations into `resolverErrors`.
       (b) Add `test/unit-workflow-template-validate-integration.js`
       with cases for each rejection scenario.

## Notes

- `_wrapperKind` (and any underscore-prefixed engine-internal key) must
  be added to `opts.skipFields` to avoid false positives.
- Post-expand is the safety net for the `allowUndeclared: true` pass
  at workflow.js L116.

