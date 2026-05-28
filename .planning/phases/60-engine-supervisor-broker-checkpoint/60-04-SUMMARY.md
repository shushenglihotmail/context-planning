---
phase: 60-engine-supervisor-broker-checkpoint
plan: 60-04
outcome: Phase checkpoint helpers + CLI shipped. lib/checkpoint.js exposes snapshot/commit/revert/restart for the Option-A supervised runtime; the harness LLM calls these between phases via `cp checkpoint <op> <slug> <phase>`. Out-of-scope dirty files are skip-counted, never committed; .planning/ supervisor metadata is excluded from accounting; restart preserves state.json across `git reset --hard`.
completed: 2026-05-28
end-commit: ff76cb9
key-decisions:
  - decision: Use `git status --porcelain -uall` for per-file accounting in commit().
    rationale: Default porcelain shows `?? src/` for untracked dirs, hiding individual files and inflating/deflating skippedOutOfScope. -uall expands so every dirty file is counted individually.
  - decision: Exclude `.planning/` from skippedOutOfScope and from restart's dirty-tree refusal.
    rationale: Supervisor state.json lives under .planning/runs/<slug>/. Treating it as user-dirty would (a) bump skip counts on every commit and (b) make restart impossible right after commit (since commit writes state.json). It is supervisor bookkeeping, not user code.
  - decision: Preserve state.json across `git reset --hard` in restart().
    rationale: If state.json was inadvertently committed (e.g., user ran `git add .`), the snapshot predates it and reset would wipe it. We snapshot state in-memory, run reset, then re-materialize state.json from disk so restart is always survivable.
  - decision: "Engine-owned commit message format `cp run <workflow>: <phase-id> (<slug>)`."
    rationale: "Lets `git log` and audit tooling cleanly identify supervised phase boundaries without relying on metadata files. Sub-agents never run git themselves (DESIGN.md Decision #6)."
key-files:
  created:
    - bin/commands/checkpoint.js
    - bin/commands/classify.js
    - commands/cp/classify.md
    - commands/cp/run-supervised.md
    - lib/checkpoint.js
    - lib/classify.js
    - lib/supervisor.js
    - test/unit-checkpoint.js
    - test/unit-classify.js
    - test/unit-supervisor-state.js
  modified:
    - bin/commands/index.js
    - bin/commands/run.js
    - lib/workflow.js
    - test/unit-workflow-schema-v14.js
---
# Summary 60-04

Plan 60-04 completed.
