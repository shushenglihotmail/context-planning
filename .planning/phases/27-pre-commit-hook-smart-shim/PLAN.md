# Phase 27 Plan — Pre-commit hook smart shim

**Base commit**: ad95718

## Plans

- [x] 27-01: lib/hooks.js + bin/cp-hook.js (pre-commit dispatch)
- [ ] 27-02: cp install --hooks / --uninstall-hooks + tests

### 27-01 expected-key-files

- created:
  - lib/hooks.js
  - bin/cp-hook.js
  - test/unit-hooks.js
- modified:
  - package.json

### 27-02 expected-key-files

- created:
  - test/dryrun-install-hooks.js
- modified:
  - bin/commands/install.js
  - bin/commands/_usage.js
  - package.json
