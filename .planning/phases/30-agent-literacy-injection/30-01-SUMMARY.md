---
what-shipped: Shared drift-defense literacy template at templates/agent-instructions.md (3.3KB) plus buildDriftDefenseBlock/stripDriftBlock helpers in install/common.js, wrapping the template in idempotent '# cp:drift-defense v1' sentinels.
key-decisions:
  - Single shared template wins over 4 per-installer template strings — eliminates drift between harnesses and keeps the v0.8 verb list maintained in one place
  - Sentinel pattern '<!-- cp:drift-defense v1 -->' matches the existing v1 versioning convention used by hooks ('# cp:hook v1') and CI ('# cp:ci v1') so future format bumps can be detected by sentinel comparison
  - stripDriftBlock exported alongside buildDriftDefenseBlock so installers that own the whole file (claude) can do strip+append for true idempotency; installers that own a cp-only file (copilot/cursor/aider) can just include the block inline
  - "expected-vs-actual drift: 6 unexpected (install/aider.js, install/claude.js, install/copilot.js, install/cursor.js, test/unit-installers.js, test/unit-v034.js)"
files-changed:
  - templates/agent-instructions.md
  - install/common.js
  - test/unit-drift-block.js
  - package.json
phase: 30
plan: 30-01
completed: 2026-05-21
key-files:
  created:
    - templates/agent-instructions.md
    - test/unit-drift-block.js
  modified:
    - install/aider.js
    - install/claude.js
    - install/common.js
    - install/copilot.js
    - install/cursor.js
    - package.json
    - test/unit-installers.js
    - test/unit-v034.js
end-commit: f0d6682666e1511710c7ad5ba46b1b5a2dbe5012
---
# Summary 30-01

Plan 30-01 completed.
