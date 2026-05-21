---
what-shipped: Wired buildDriftDefenseBlock into all 4 harness installers (copilot, claude, cursor, aider) so v0.8 drift-defense verbs are surfaced to the AI agent at install time. Extended test/unit-installers.js + test/unit-v034.js with drift-block presence + idempotency assertions.
key-decisions:
  - claude.js uses true strip+append (handles existing CLAUDE.md content from other plugins) — verified via 're-install ⇒ block appears exactly once' assertion in unit-v034.js
  - copilot/cursor own their ambient files end-to-end so they inline the drift block and rely on existing --force semantics for upgrade collisions; matches their existing behavior
  - aider's buildContextBriefing takes optional pluginRoot — keeps the function still callable in tests without pluginRoot for the original briefing-structure assertions, while real install path always passes it
  - "expected-vs-actual drift: 1 unexpected (test/unit-v034.js)"
files-changed:
  - install/copilot.js
  - install/claude.js
  - install/cursor.js
  - install/aider.js
  - test/unit-installers.js
  - test/unit-v034.js
phase: 30
plan: 30-02
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
# Summary 30-02

Plan 30-02 completed.
