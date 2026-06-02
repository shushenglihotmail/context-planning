---
phase: 106
name: "Bug B — write-summary validates expected_files frontmatter"
status: planned
created: 2026-06-01
updated: 2026-06-01
deciders: [shushenglihotmail]
base-commit: 
plans: [106-01]
expected-key-files:
  106-01: [lib/milestone.js, bin/commands/write-summary.js, test/dryrun-write-summary.js]
---

# Phase 106: Bug B — write-summary validates expected_files frontmatter

## Problem

**Current behavior:** `cp write-summary` currently validates `key-files` existence by checking paths declared in the frontmatter JSON frontmatter (via `--from`), but the validation logic can produce false positives when body text of a PLAN.md contains path-shaped tokens (e.g., `src/foo.ps1`, `lib/bar.js`) that are mentioned purely for context, not as actual files. Users work around this by systematically passing `--no-file-check`, silencing the validation gate entirely.

**Root cause:** The current validation in `lib/milestone.js::writeSummary` checks `key-files.created` and `key-files.modified` against the file system, but these arrays can be polluted by auto-fill from `git diff` (which is correct) or by caller-supplied entries that reference non-existent paths.

**Why this matters:** The WCCT agent (in the sibling repo) encountered this during v1.8.1 composition and was forced to disable file validation globally, losing a useful gate.

## Approach

1. **Refactor file validation to use `expected_files:` frontmatter as the source of truth.**
   - Rename the current validation concept from "scrape PLAN.md body for path tokens" to "use `expected-files` from PLAN.md frontmatter" (already named `expected-key-files` in code; this phase clarifies and documents the semantic).
   - Keep existing `expected-key-files` logic (already in `lib/milestone.js::_extractExpectedKeyFiles`), which is read from PLAN.md frontmatter.

2. **When `expected-key-files` is absent from PLAN.md frontmatter:**
   - Emit a DEBUG-level log message (never block, never warn).
   - Skip the validation entirely.
   - This allows new phases to opt-in to the check gradually; missing frontmatter is treated as "no validation requested" rather than "validation deferred to body scraping."

3. **Update `--no-file-check` semantics:**
   - Currently it disables both auto-fill existence checks AND expected-key-files validation.
   - Emit a **deprecation warning to stderr** when the flag is used: `cp: --no-file-check is deprecated; update PLAN.md to omit expected-key-files if validation is not needed.`
   - The flag's behavior remains unchanged (for back-compat), but the warning surfaces guidance.

4. **Add comprehensive tests:**
   - **Positive case:** PLAN.md with `expected-key-files:` frontmatter specifying real files. `writeSummary` succeeds without `--no-file-check`.
   - **Negative case:** PLAN.md with `expected-key-files:` listing a non-existent file. `writeSummary` fails with a clear error message.
   - **No frontmatter case:** PLAN.md lacking `expected-key-files`. `writeSummary` succeeds with a DEBUG log (no block).
   - **Deprecation warning test:** Using `--no-file-check` emits deprecation warning to stderr.

## Tasks

### 106-01: Implement expected_files validation + deprecation + tests

1. **lib/milestone.js — Refactor validation:**
   - Verify that `_extractExpectedKeyFiles` already exists and correctly parses `expected-key-files` from PLAN.md frontmatter (✓ confirmed).
   - Verify that the existing diff logic in `_diffExpectedVsActual` already compares expected vs. actual key-files (✓ confirmed).
   - Add a **DEBUG-level log** when PLAN.md has no `expected-key-files` field. Use `console.error` at a debug level (or similar); the log should say: `cp: phase <phaseNum> plan <planId>: expected-key-files not found in PLAN.md frontmatter; skipping validation.`
   - No code changes required to the validation logic itself, as it already works as designed. The main change is semantic: document and enforce that the validation is keyed off `expected-key-files` frontmatter, not body scraping.

2. **bin/commands/write-summary.js — Add deprecation warning:**
   - When `--no-file-check` is passed, after line 64 or after the flag is processed, emit a deprecation warning:
     ```
     process.stderr.write('cp: --no-file-check is deprecated; update PLAN.md to omit expected-key-files if validation is not needed.\n');
     ```
   - Insert this warning **after** the flag is parsed, so it's visible whenever the flag is used.

3. **test/dryrun-write-summary.js — Add new test sections:**
   - **Section: "cp write-summary validates against expected-key-files frontmatter (Bug B)"**
     - Create fixture with PLAN.md containing `expected-key-files: [README.md]` (file exists).
     - Create JSON summary with `key-files: { created: ['README.md'], modified: [] }`.
     - Run `cp write-summary 01-01 --from <json>` without `--no-file-check`.
     - Assert exit code 0, success message, no block.
   - **Section: "cp write-summary blocks when expected-key-files path missing (Bug B negative)"**
     - Create fixture with PLAN.md containing `expected-key-files: [missing.md]` (file does NOT exist).
     - Create JSON summary with `key-files: { created: ['missing.md'], modified: [] }`.
     - Run `cp write-summary 01-01 --from <json>` without `--no-file-check`.
     - Assert exit code 2 (validation error), stderr contains error message about missing file.
   - **Section: "cp write-summary skips validation when no expected-key-files (Bug B silent)"**
     - Create fixture with PLAN.md having NO `expected-key-files` field.
     - Create JSON summary with `key-files: { created: ['nonexistent.js'], modified: [] }`.
     - Run `cp write-summary 01-01 --from <json>` without `--no-file-check`.
     - Assert exit code 0, success, no block (validation skipped).
   - **Section: "cp write-summary --no-file-check emits deprecation warning (Bug B)"**
     - Create fixture with PLAN.md containing `expected-key-files: [missing.md]`.
     - Run `cp write-summary 01-01 --from <json> --no-file-check`.
     - Assert exit code 0 (flag bypasses validation).
     - Assert stderr contains deprecation warning message `--no-file-check is deprecated`.

4. **Update comments in lib/milestone.js:**
   - Add a clarifying comment in `writeSummary` around the expected-key-files validation block (line ~646–669):
     ```javascript
     // v0.9 P106 (Bug B): File validation is keyed off expected-key-files in
     // PLAN.md frontmatter, not body scraping. Missing frontmatter = no-op.
     // When present, expected-key-files defines the allowlist of files that
     // are expected to change in this phase. Deviations (unexpected or missing)
     // are recorded as soft notices unless --strict-expected is passed.
     ```

5. **Ensure YAML parsing is working correctly:**
   - The code already uses `fm` (frontmatter lib, confirmed via `const fm = require('./frontmatter');` at top of lib/milestone.js).
   - Verify that `fm.parse(fileContent).frontmatter` correctly extracts the YAML block.
   - No changes needed; the repo already depends on a frontmatter/YAML parser (visible in package.json and existing code).

## Tests

**New fixtures** (appended to `test/dryrun-write-summary.js`):
- 4 new sections as described above.
- Each section creates a temp fixture with a git repo, ROADMAP.md, phase dir, and PLAN.md.
- Fixtures reuse the `mkFixture` helper pattern (already present in the test file).
- All exit codes and stderr/stdout assertions are validated.

**Regression:**
- Run `npm test` after the change to ensure all existing write-summary tests still pass.
- Verify that `test/unit-lifecycle.js` sections for `writeSummary` still pass (expected-vs-actual drift tests already exist and should continue to work).

## Done When

- [ ] `lib/milestone.js` has clarifying comment about expected-key-files validation (line ~646–669).
- [ ] `bin/commands/write-summary.js` emits deprecation warning when `--no-file-check` is used (stderr message visible).
- [ ] `test/dryrun-write-summary.js` has 4 new test sections covering: positive case, negative case, no-frontmatter case, deprecation warning case.
- [ ] All new tests pass: `npm test` reports no failures in `dryrun-write-summary.js`.
- [ ] All existing tests pass: `npm test` reports no regressions.
- [ ] No new files created (changes are additions to existing lib/milestone.js, bin/commands/write-summary.js, test/dryrun-write-summary.js).
- [ ] Single atomic commit with message: `"fix(write-summary): validate against expected-key-files frontmatter, emit deprecation for --no-file-check (v1.9 Bug B) + tests"`.

## Migration Note

**For end users passing `--no-file-check`:**
- The flag continues to work as before (skips validation).
- A deprecation warning is now emitted to stderr.
- Recommended action: Update PLAN.md to include or omit `expected-key-files` as desired; the flag will be removed in v2.0.

**For phases without `expected-key-files` in PLAN.md:**
- Validation is silently skipped (DEBUG log at most).
- No breakage; phases gradually opt-in to validation as they add the frontmatter field.

**Relationship to `--no-file-check`:**
- `--no-file-check` now controls TWO checks:
  1. Auto-fill entries existence check (phase P2/P3 in the broader milestone.js flow).
  2. Expected-key-files validation (phase P5).
- Both are disabled when the flag is present; both emit a single deprecation warning (not per-check).
