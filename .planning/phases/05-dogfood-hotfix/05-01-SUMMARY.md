---
title: aider YAML-parser fix
bullets:
  - Switched from regex-fenced block to YAML.parse/stringify
  - "Preserves user read: entries (was silently overridden)"
  - Auto-migrates legacy v0.4.2/v0.4.3 fenced blocks
  - +8 test assertions
release: v0.4.4
outcome: Shipped as part of v0.4.4 (97c2b6d).
phase: 5
plan: 05-01
completed: 2026-05-20
key-decisions: ['Aider config edits switched from regex block replacement to YAML parse-stringify so existing read entries survive migration.']
---
# Summary 05-01

Plan 05-01 completed.

