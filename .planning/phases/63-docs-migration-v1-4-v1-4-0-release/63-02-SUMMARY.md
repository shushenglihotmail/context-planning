---
overview: "Authored MIGRATION-v1.4.md as the v1.3 → v1.4 upgrade guide. Covers supervised: flag, new built-in workflow templates (quick/milestone/complete-milestone), new CLI verbs (cp abandon/list/status<id>), breaking phase-id rename in quick (discuss→setup, verify→finalize), the after vs depends_on clarification, and a re-customization recipe for users with project-local v1.3 forks."
key-decisions:
  - Frame v1.4 as backwards-compatible for end users; only workflow customizers and CLI scripters need to act.
  - Document the `after:` vs `depends_on:` distinction as a clarification (not a new rule) so users understand why v1.4 built-ins switched.
  - Provide a concrete bash recipe for re-merging a project-local quick.yaml fork.
files-changed:
  - MIGRATION-v1.4.md
verification: Tests not affected by docs; full suite was green at 63-01.
phase: 63
plan: 63-02
completed: 2026-05-28
key-files:
  created:
    - MIGRATION-v1.4.md
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
end-commit: f0b44aef54c039609ed6772929099f6b40f533c1
---
# Summary 63-02

Plan 63-02 completed.
