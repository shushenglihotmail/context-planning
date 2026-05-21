---
base-commit: d9e14444bdcbc9486497635019847ce45a734d9b
---
# Phase 28 Plan — Post-commit hook tick auto

**Base commit**: 23189b4

## Plans

- [x] 28-01: tick-auto wiring (lib + shim + tests)

### 28-01 expected-key-files

- created:
  - test/unit-tick-auto.js
  - test/dryrun-post-commit-tick.js
- modified:
  - lib/hooks.js
  - bin/cp-hook.js
  - lib/lifecycle.js
  - package.json
