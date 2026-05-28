---
overview: "Refreshed README to describe v1.4: the three workhorse slash wrappers (/cp-quick, /cp-new-milestone, /cp-complete-milestone) are now thin delegations to workflow YAMLs; added a v1.4 banner above the Workflow Engine section; updated the quick-start example to the new 4-phase setup/design/execute/finalize shape; documented the new CLI verbs (cp abandon, cp list, cp status <run-id>, cp quick-setup, cp quick-finalize, cp milestone-setup, cp milestone-finalize)."
key-decisions:
  - Quick start example uses the real v1.4 quick.yaml shape (setup/design/execute/finalize) to keep docs in sync with code.
  - Internal `*-setup` / `*-finalize` verbs are documented but flagged as 'internal verb used by the workflow phase' to discourage direct user invocation.
  - Forward-reference MIGRATION-v1.4.md (authored in 63-02).
files-changed:
  - README.md
verification: Full npm test suite green.
phase: 63
plan: 63-01
completed: 2026-05-28
key-files:
  created:
    - bin/commands/abandon.js
    - bin/commands/checkpoint.js
    - bin/commands/classify.js
    - bin/commands/list.js
    - bin/commands/milestone-finalize.js
    - bin/commands/milestone-setup-check.js
    - bin/commands/project.js
    - bin/commands/quick-finalize.js
    - bin/commands/quick-setup.js
    - commands/cp/classify.md
    - commands/cp/run-supervised.md
    - lib/checkpoint.js
    - lib/classify.js
    - lib/milestone-helpers.js
    - lib/project-update.js
    - lib/quick-helpers.js
    - lib/run-lifecycle.js
    - lib/supervisor.js
    - templates/workflows/complete-milestone.yaml
    - templates/workflows/milestone.yaml
    - test/integration-supervisor-flow.js
    - test/unit-checkpoint.js
    - test/unit-classify.js
    - test/unit-milestone-helpers.js
    - test/unit-project-update.js
    - test/unit-run-lifecycle.js
    - test/unit-supervisor-state.js
  modified:
    - README.md
    - bin/commands/index.js
    - bin/commands/run.js
    - bin/commands/status.js
    - commands/cp/complete-milestone.md
    - commands/cp/new-milestone.md
    - commands/cp/quick.md
    - lib/workflow.js
    - package.json
    - templates/workflows/quick.yaml
    - test/dryrun-run-cli.js
    - test/dryrun-workflow-cli.js
    - test/integration-run-cli.js
    - test/unit-autonomous.js
    - test/unit-workflow-schema-v14.js
end-commit: 7d3a8ecf4ad453528def46445200866f644e78e2
---
# Summary 63-01

Plan 63-01 completed.
