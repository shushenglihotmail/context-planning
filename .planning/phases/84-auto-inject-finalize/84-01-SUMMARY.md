---
key-decisions:
  - Auto-inject finalize lives in exported helper applyAutoInjectFinalize, called by runtime + workflow inspect — NOT inside loadTemplate, to keep raw-template fixtures stable.
  - cp run-finalize CLI uses lib/custom (STATE.yaml store), not lib/quick-helpers (legacy STATE.md store).
  - "Finalize command is binding-aware: milestone→cp milestone-finalize, quick→cp quick-finalize, else→cp run-finalize."
phase: 84
plan: 84-01
completed: 2026-05-29
key-files:
  created: []
  modified:
    - bin/commands/run.js
    - lib/runtime.js
    - lib/workflow-template-expand.js
    - test/integration-format-instruction-skills.js
    - test/integration-runtime.js
    - test/unit-workflow-template-expand.js
end-commit: 030da9eea14fa7befc976b479029f3d58e94b660
---
# Summary 84-01

Plan 84-01 completed.
