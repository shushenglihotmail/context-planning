---
plan_id: 61-01
title: "Reserved CLI helpers: cp project update, milestone-setup-check, milestone-finalize"
start_commit: 948a387
end_commit: 219a2c2
outcome: Added three stateless CLI helpers used by milestone.yaml workflow steps. cp project update applies declarative JSON ops (mark-validated/add-active/add-validated/remove-active) to PROJECT.md idempotently. milestone-setup-check validates project scaffolding + slug. milestone-finalize injects/replaces a <!-- cp:current-focus --> marker block in STATE.md. All three are pure I/O, no agent reasoning.
decisions:
  - JSON not YAML for project-update payloads — simpler validation, matches state.json
  - Idempotent ops via substring match on bullet text
  - STATE.md marker block uses HTML comments so it survives plain-text edits
key-decisions:
  - JSON not YAML for project-update payloads
  - Idempotent ops via substring match on bullet text
  - STATE.md marker block uses HTML comments
tests: node test/unit-project-update.js (20 checks), node test/unit-milestone-helpers.js (15 checks). Both wired into npm test.
phase: 61
plan: 61-01
completed: 2026-05-28
key-files:
  created:
    - bin/commands/checkpoint.js
    - bin/commands/classify.js
    - bin/commands/milestone-finalize.js
    - bin/commands/milestone-setup-check.js
    - bin/commands/project.js
    - commands/cp/classify.md
    - commands/cp/run-supervised.md
    - lib/checkpoint.js
    - lib/classify.js
    - lib/milestone-helpers.js
    - lib/project-update.js
    - lib/supervisor.js
    - test/integration-supervisor-flow.js
    - test/unit-checkpoint.js
    - test/unit-classify.js
    - test/unit-milestone-helpers.js
    - test/unit-project-update.js
    - test/unit-supervisor-state.js
  modified:
    - bin/commands/index.js
    - bin/commands/run.js
    - lib/workflow.js
    - package.json
    - test/unit-workflow-schema-v14.js
end-commit: 0ce319bec16ce796767daf572165fd48c0f25dcb
---
# Summary 61-01

Plan 61-01 completed.
