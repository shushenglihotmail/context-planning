---
subsystem: hooks
key-files:
  created:
    - lib/hooks.js
    - bin/cp-hook.js
    - test/unit-hooks.js
  modified:
    - package.json
key-decisions:
  - "Smart shim model: .git/hooks/pre-commit is a 4-line script that execs node bin/cp-hook.js. Upgrading the cp package upgrades hook behavior — no reinstall needed."
  - Sentinel '# cp:hook v1' baked into the script content lets install/uninstall safely refuse to clobber user-owned hook files (use --force to override).
  - findCpProjects walks for .planning/STATE.md markers under git root (maxDepth=4, env override CP_HOOK_MAXDEPTH). Monorepo-safe; stops recursing once a cp project is found to avoid double-running on nested projects.
discoveries:
  - spawnSync(node, [bin/cp.js, ...]) is used instead of PATH lookup because Windows .cmd shims occasionally trip up under git commit -m.
phase: 27
plan: 27-01
completed: 2026-05-21
end-commit: 29aeb5496ad16c1e8a14d4b07fc9f63b7b618193
---
# Summary 27-01

Plan 27-01 completed.
