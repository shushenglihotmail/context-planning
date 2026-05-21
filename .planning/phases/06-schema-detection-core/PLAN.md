---
phase: "6"
name: Schema + detection core
milestone: v0.5 — Generic provider/harness detection
status: in-progress
created: 2026-05-20
base-commit: 9d57b67aaefc56cfc9ee2c78c9a79471b79c4b3b
---

# Phase 6: Schema + detection core

**Milestone**: v0.5 — Generic provider/harness detection
**Created**: 2026-05-20
**Spec**: `docs/superpowers/specs/2026-05-20-generic-provider-harness-detection-design.md` §4.1, §5.1, §5.2

## Goal

Introduce the v2 config schema (harnesses block + plugin_shape on each provider) and a new `lib/detect.js` module that implements the harnesses × providers cross-product detection with trailing-`*` glob expansion. Slim `lib/provider.js` to delegate detection to `lib/detect.js` while keeping its public API stable. All existing tests must continue to pass; `cp doctor` external output is unchanged (Phase 7 rewrites it).

## Success Criteria

1. `templates/config.json` has `cp.version: 2`, `cp.harnesses` (4 harnesses), and `plugin_shape` on superpowers + echo-provider entries.
2. `lib/detect.js` exports `expandRoot`, `detectProviderAtAnyHarness`, `detectAllInstalled` — all exercised by new tests.
3. `lib/provider.js` re-exports detect functions; `resolveSkill` uses new detection path but returns identical shapes to callers.
4. `npm test` passes (all existing 755 assertions + ~40 new from `test/unit-detect.js`).
5. `cp doctor` still works end-to-end (output unchanged — Phase 7 changes it).

## Plans

- [x] 06-01: Schema v2 in templates/config.json + lib/detect.js with expandRoot + detectProviderAtAnyHarness + detectAllInstalled
- [x] 06-02: Slim lib/provider.js — move existsAnywhere/detectProvider to detect.js, rewire resolveSkill, re-export for back-compat
- [x] 06-03: test/unit-detect.js — 6 host fixtures, ~40 assertions covering expandRoot + detection + legacy back-compat

## Plan details

### 06-01: Schema v2 + lib/detect.js

**Goal**: Update `templates/config.json` to schema v2 and create `lib/detect.js` with the core detection algorithm.

**Files modified**:
- `templates/config.json` — add `cp.version: 2`, `cp.harnesses` block (4 harnesses with `plugin_roots`), add `plugin_shape` to superpowers and echo-provider entries. Keep all existing fields unchanged.
- `lib/detect.js` (NEW, ~250 LOC) — three exported functions:
  - `expandRoot(rootSpec)` — replaces `~/` with `os.homedir()`, expands trailing-`*` segments via `fs.readdirSync` + dir filter. Returns `string[]`.
  - `detectProviderAtAnyHarness(cfg, providerName)` — for each harness, expand plugin_roots, check if `plugin_shape.dir_name` exists with `required_subdirs`. Falls back to legacy `detect.any_of` via `existsAnywhere` search. Returns `{name, installed, via, source, evidence}` or `{name, installed: false, reason}`.
  - `detectAllInstalled(cfg)` — scans all harnesses × all providers, returns full `DetectionReport` object.
  - Internal: `existsAnywhere(candidate)` moved here from provider.js.

**Verify**: `node -e "const d = require('./lib/detect'); console.log(typeof d.expandRoot, typeof d.detectProviderAtAnyHarness, typeof d.detectAllInstalled)"` → prints `function function function`

### 06-02: Slim lib/provider.js

**Goal**: Remove `existsAnywhere` and `detectProvider` from `lib/provider.js`, delegate to `lib/detect.js`, keep public API stable.

**Files modified**:
- `lib/provider.js` — remove `existsAnywhere()` and `detectProvider()` function bodies. Import from `./detect`. `resolveSkill()` now calls `detect.detectProviderAtAnyHarness(cfg, name)` instead of the old `detectProvider`. Re-export `detectProvider` as an alias wrapping the new function (shape adapter: old API returned `{name, installed, evidence?, reason?}`, new API adds `{via, source}` — super-set, so no breakage). Also re-export `existsAnywhere` for any test that imports it directly.
- No other files changed — callers import from `lib/provider.js` and see the same exports.

**Verify**: `cd C:\src\github\context-planning && node test/unit-libs.js 2>&1 | Select-String "Failed:"` → `Failed: 0`. Then `node test/dryrun-resume.js 2>&1 | Select-String "Failed:"` → `Failed: 0`.

### 06-03: test/unit-detect.js

**Goal**: Comprehensive test coverage for `lib/detect.js`.

**Files modified**:
- `test/unit-detect.js` (NEW, ~200 LOC) — same tiny-test-runner pattern as `test/unit-libs.js` (`ok`, `eq`, `section`, `mktmp`, `track`).
- `package.json` — append `node test/unit-detect.js` to the `test` script.

**Test sections**:
1. `expandRoot: literal path (no glob)` — returns `[abs]` if exists, `[]` if not.
2. `expandRoot: tilde expansion` — `~/foo` resolves to `<homedir>/foo`.
3. `expandRoot: trailing-* segment` — create 3 subdirs, glob expands to matching dirs only (not files).
4. `expandRoot: missing parent` — returns `[]`, no error thrown.
5. `detectProviderAtAnyHarness: copilot marketplace layout` — create `<tmpHome>/.copilot/installed-plugins/sp-mkt/superpowers/skills/writing-plans/` etc., assert installed=true via=copilot source=plugin_shape.
6. `detectProviderAtAnyHarness: claude plugin layout` — create `<tmpHome>/.claude/plugins/superpowers/skills/writing-plans/`, assert installed=true via=claude.
7. `detectProviderAtAnyHarness: both harnesses present` — assert first hit wins (copilot ordered first in config).
8. `detectProviderAtAnyHarness: no match → not installed` — empty tmpHome, assert installed=false.
9. `detectProviderAtAnyHarness: legacy any_of back-compat` — create only `.github/skills/brainstorming`, assert installed=true via=_anywhere source=literal.
10. `detectProviderAtAnyHarness: always:true (manual)` — assert installed=true source=always.
11. `detectAllInstalled: full report shape` — assert harnesses array + providers array + correct counts.
12. `detectAllInstalled: malformed plugin_shape (not array)` — assert installed=false, reason contains 'malformed'.

Target: ~40 assertions.

**Verify**: `node test/unit-detect.js` → all pass. `npm test` → all suites green.

## Notes

- `.planning/` is gitignored in this repo — use `--no-commit` where needed.
- The existing v0.4.5 sentinel tests in `test/unit-libs.js` remain as-is — they test the re-exported back-compat wrappers.
- The echo-provider entry in `templates/config.json` is added now (schema) but the installer is Phase 9.
