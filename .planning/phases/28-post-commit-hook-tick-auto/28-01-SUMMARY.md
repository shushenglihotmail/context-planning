---
subsystem: hooks
key-files:
  created:
    - test/unit-tick-auto.js
    - test/dryrun-post-commit-tick.js
  modified:
    - lib/hooks.js
    - bin/cp-hook.js
    - lib/lifecycle.js
    - package.json
key-decisions:
  - "Subject parser requires the captured group to start with a digit (regex ^cp\\((\\d+-\\d+)). This explicitly excludes housekeeping subjects like cp(reconcile):, cp(supersede):, cp(deviate):, and bare cp: foo from triggering an auto-tick."
  - tick-auto is OFF by default (behavior.post_commit='off'). Teams that prefer a clean linear history are not surprised by trailing auto-tick commits; opt-in is explicit per project.
  - tryAutoTick was extracted as a pure-ish lifecycle helper so the file-coverage decision is unit-testable without spawning git. The shim only does I/O (lastCommitInfo + spawnSync cp tick).
discoveries:
  - HOOKS = ['pre-commit','post-commit'] now installs both hook files; pre-existing unit tests asserting installed.length===1 were updated to assert membership by name instead of count.
phase: 28
plan: 28-01
completed: 2026-05-21
end-commit: 2183c9bd4365410fbfcf34f2733d9d842abcd953
---
# Summary 28-01

Plan 28-01 completed.
