---
phase: "108"
plan_id: "108-bug-d-doctor-fix-dual-plan"
title: "Add `--fix-dual-plan` flag to cp doctor"
goal: "Auto-remove long-form NN-MM-...-PLAN.md when short-form PLAN.md exists and is non-empty"
status: accepted
created: 2026-06-02
updated: 2026-06-02
---

# Plan: Phase 108 — Bug D: `cp doctor --fix-dual-plan`

## Problem

The `cp doctor` command detects phases that have both short-form `PLAN.md` and long-form `{NN-MM}-...-PLAN.md` files coexisting. The parser must pick one, making the situation ambiguous. Currently, `cp doctor` warns users but provides no automated fix — manual cleanup is error-prone and requires user intervention.

From the design doc (Bug D):
> `cp doctor` warns when a phase has both short-form `PLAN.md` and long-form `NN-MM-...-PLAN.md`, but there is no auto-fix. Manual cleanup is error-prone.

## Approach

Implement a new `--fix-dual-plan` flag for the `cp doctor` command that:

1. **Detects dual-plan phases** using existing logic from `lib/gsd-compat.js` (the `scanPhases()` function already detects both forms).

2. **For each phase with both forms**: keep the larger file (by byte count; mtime-newer breaks size ties) and **move** the loser(s) to `.planning/.archive/<phase-id>/<ISO-ts>-<basename>`. Rationale: dual plans typically arise when a detailed long-form plan was written over an auto-generated short stub — the larger file is almost always the canonical one, and archiving (not deleting) preserves the discarded file for recovery. (Original draft of this PLAN.md prescribed "delete long-form if short-form non-empty"; reversed during execution to avoid data loss in the common case.)

3. **Wire the fix into doctor** by:
   - Creating a new `fixDualPlan(root)` helper in `lib/audit-fix.js`.
   - Adding `--fix-dual-plan` flag recognition in `bin/commands/doctor.js`.
   - Calling the fix helper and committing changes with an atomic git commit.

4. **Atomic commit**: Single commit with subject `cp(doctor): fix dual-plan files -- archive losers (size/mtime rule)`.

## Implementation Tasks

### Task 1: Implement fixDualPlan in lib/audit-fix.js

**Summary**: Add a new exported function `fixDualPlan(root)` to `lib/audit-fix.js`.

**Pseudocode**:
```
fixDualPlan(root):
  phases = scanPhases(root)  // from gsd-compat
  deleted_files = []
  
  for each phase:
    if phase.hasShortPlan AND phase.planFiles.length > 0:
      shortFormPath = path.join(phase.path, 'PLAN.md')
      if fs.existsSync(shortFormPath):
        shortContent = fs.readFileSync(shortFormPath, 'utf8')
        if shortContent.trim().length > 0:
          // delete all long-form files
          for each longForm in phase.planFiles:
            longFormPath = path.join(phase.path, longForm)
            fs.unlinkSync(longFormPath)
            deleted_files.push(longFormPath)
            log: "Deleted ${longFormPath}"
  
  return { deleted_files, action: 'fixed' OR 'skipped' }
```

**Detail**:
- Import `gsd-compat.scanPhases` and fs utilities.
- Only delete if short-form is non-empty (not just present).
- Log each deletion to stderr or via logger (match existing cp patterns).
- Return structured result: `{ deleted_files: [...], action: 'fixed'|'skipped' }`.
- If no phases needed fixing, return `{ deleted_files: [], action: 'skipped' }`.

**Tests**: Unit test in existing test suite (see Task 4).

---

### Task 2: Wire --fix-dual-plan flag in bin/commands/doctor.js

**Summary**: Add CLI flag recognition and invocation in doctor command.

**Changes**:
- Parse `--fix-dual-plan` flag from args (following pattern used for `--json`, `--quiet`).
- If flag is set:
  - Load `lib/audit-fix.js`.
  - Call `fixDualPlan(root)`.
  - If result has deleted files, commit atomically using `lib/lifecycle.gitCommit()`.
  - Print summary: "Fixed dual-plan files: deleted X files."
  - If no files were deleted, print: "No dual-plan issues found."
- Print help text if requested.
- Exit with code 0 on success, non-zero on error.

**Detail**:
- Flag should be mutually exclusive with `--json` and `--quiet` (or ignore them).
- Use existing `lifecycle.gitCommit()` pattern seen in `lib/audit-fix.js` for atomic commits.
- Match output formatting to cp's diagnostic style (concise, non-verbose by default).

**Tests**: Integration test in dryrun-doctor (see Task 4).

---

### Task 3: Create test fixtures and assertions

**Summary**: Add test cases to `test/dryrun-doctor.js`.

**Test 1 — Empty short-form (no-op)**:
- Create a phase with:
  - Empty `PLAN.md` (0 bytes or whitespace-only).
  - Non-empty `01-01-foo-PLAN.md`.
- Run `cp doctor --fix-dual-plan`.
- Assert:
  - Exit code 0.
  - Output mentions "No dual-plan issues" OR "skipped".
  - Long-form file still exists (NOT deleted).
  - Short-form file unchanged.

**Test 2 — Non-empty short-form (deletes long-form)**:
- Create a phase with:
  - Non-empty `PLAN.md` (e.g., `---\n# Test\n`).
  - Non-empty `01-01-foo-PLAN.md`.
- Run `cp doctor --fix-dual-plan`.
- Assert:
  - Exit code 0.
  - Output mentions deletion or "Fixed" or number of files deleted.
  - Long-form file is deleted (no longer on disk).
  - Short-form file exists and is unchanged.

**Test 3 — No dual-plan (no-op)**:
- Create a phase with only `PLAN.md` (no long-form).
- Run `cp doctor --fix-dual-plan`.
- Assert:
  - Exit code 0.
  - Output mentions "No dual-plan issues" or similar.
  - All files unchanged.

**Test 4 — Multiple long-form files (deletes all)**:
- Create a phase with:
  - Non-empty `PLAN.md`.
  - Multiple long-forms: `01-01-foo-PLAN.md`, `01-02-bar-PLAN.md`.
- Run `cp doctor --fix-dual-plan`.
- Assert:
  - Exit code 0.
  - Both long-form files deleted.
  - Short-form file exists and is unchanged.

**Code structure**: Follow existing dryrun-doctor pattern (mktmp, buildFixture, runDoctor, assertions).

---

### Task 4: Run existing tests to ensure no regressions

**Summary**: Verify that all existing tests pass after changes.

- Run `npm test` to ensure no regressions in existing doctor, audit, or lifecycle tests.
- Run the new dryrun-doctor tests explicitly.
- Run `cp audit` against this project's own `.planning/` to ensure cp itself has no new findings.

---

## Done-When

✅ All of the following are true:

1. **Code changes complete**:
   - `lib/audit-fix.js` exports new `fixDualPlan(root)` function.
   - `bin/commands/doctor.js` recognizes `--fix-dual-plan` flag and calls the fixer.
   - Both functions handle empty short-form as a no-op (do NOT delete).

2. **Tests pass**:
   - All four dryrun-doctor test cases (empty, non-empty, no-dual-plan, multiple) pass.
   - `npm test` exits 0.
   - No new audit findings on this project's `.planning/`.

3. **Single atomic commit**:
   - Commit message: `cp(doctor): fix dual-plan files -- delete long-form when short-form non-empty`
   - All changes (code, tests) in one commit.
   - Includes Co-authored-by trailer.

4. **Behavior verified**:
   - `cp doctor --fix-dual-plan` in a phase with both forms and non-empty short-form deletes long-form.
   - `cp doctor --fix-dual-plan` in a phase with both forms and empty short-form does NOT delete (no-op).
   - `cp doctor --fix-dual-plan` in a phase with no dual-plan exits cleanly.
   - `cp doctor` (without flag) still warns about dual-plan (read-only, no changes).

---

## References

- `.planning/milestones/v1-9-framework-bug-fixes-from-v1-8-1-retro/DESIGN.md` — Bug D section (lines 39–41).
- `lib/gsd-compat.js` — `scanPhases(root)` function and dual-plan warning logic (lines 76–154).
- `lib/audit-fix.js` — Fixer registry pattern and `gitCommit()` usage.
- `bin/commands/doctor.js` — Existing flag patterns and output structure.
- `test/dryrun-doctor.js` — Existing doctor test harness and fixture builder.
