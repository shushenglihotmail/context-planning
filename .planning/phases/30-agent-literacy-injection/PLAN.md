---
phase: "30"
name: Agent literacy injection
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-22
base-commit: ab13c00cf6885b5811aaa710ce438d18be92dcf2
expected-key-files:
  "30-01":
    - templates/agent-instructions.md
    - install/common.js
    - test/unit-drift-block.js
    - package.json
  "30-02":
    - install/copilot.js
    - install/claude.js
    - install/cursor.js
    - install/aider.js
    - test/unit-installers.js
---

# Phase 30 — Agent literacy injection

**Design**: see [DESIGN.md](./DESIGN.md)

## Plans

- [x] 30-01: Shared drift-defense template + buildDriftDefenseBlock helper
- [x] 30-02: Wire helper into all 4 installers

## Notes

The drift-defense literacy block bridges v0.8's verbs (audit/fix/
reconcile/supersede/deviate/hooks) and the AI agent's prompt-time
awareness so the right verb is suggested at the right moment.
