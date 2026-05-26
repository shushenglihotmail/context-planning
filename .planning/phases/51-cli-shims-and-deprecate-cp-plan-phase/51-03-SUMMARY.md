---
title: Collapse .planning/custom/ to .planning/quick/ with back-compat
one-liner: Quick tier now writes to .planning/quick/; legacy .planning/custom/ stays readable for one release.
what-shipped: "lib/custom.js writes canonical .planning/quick/ and transparently reads/writes-in-place for legacy .planning/custom/ slugs. lib/workflow.js normalizes binds_to: custom to quick at load and adds quick to ALLOWED_BINDS. lib/runtime.js + bin/commands/run.js use binding=quick. Templates quick.yaml + debug.yaml updated. CLI scaffold helpers default to binds_to: quick. Added 5 back-compat tests covering legacy aggregation, transparent readState, in-place writeState, and createRun never touching custom/."
key-decisions:
  - Legacy .planning/custom/ runs stay in custom/ for their lifetime - writes do NOT migrate. Avoids surprising data movement; users move them with git mv when ready.
  - createRun ALWAYS writes to quick/. New work never lands in legacy custom/, even on legacy-only projects.
  - "binds_to: custom is normalized to quick at template-load time (silent). The user-facing deprecation warning fires only when a legacy .planning/custom/ directory is actually touched."
  - Free-slug check spans BOTH roots so a new quick-run cannot collide with a legacy custom slug.
  - lib/custom.js filename kept (not renamed to quick.js) to minimize churn. Module exports add _quickRoot/_legacyCustomRoot/_resetDeprecationWarning for testing.
  - "ALLOWED_BINDS keeps custom as an alias so user templates with binds_to: custom still validate. The validation error message reframes custom as a deprecated alias."
key-files:
  - lib/custom.js
  - lib/workflow.js
  - lib/runtime.js
  - bin/commands/run.js
  - bin/commands/workflow.js
  - templates/workflows/quick.yaml
  - templates/workflows/debug.yaml
  - test/unit-custom.js
  - test/integration-runtime.js
  - test/unit-workflow.js
  - test/dryrun-workflow-cli.js
phase: 51
plan: 51-03
completed: 2026-05-26
end-commit: 44580fe06fb466ed6c5df2f0ace5c78765c891c3
---
# Summary 51-03

Plan 51-03 completed.
