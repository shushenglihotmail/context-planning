---
phase: "105"
name: "Bug A: ROADMAP scanner accepts both ### and #### Phase headings"
base-commit: 0000000000000000000000000000000000000000
---

# Bug A: Fix ROADMAP Scanner Regex Hardcoding

## Problem

Today, `lib/roadmap.js` uses two hardcoded regexes requiring exactly `###` (h3) Phase headings:
- `listPhases()` line 30: `^###\s+Phase\s+([\d.]+):\s+(.+?)` — finds phase sections
- `listCollapsedPhaseNums()` line 81: `^###\s+Phase\s+([\d.]+):` — finds inner phases in collapsed milestones

When GSD-imported or hand-edited ROADMAP.md files drift to `####` (h4), `listPhases()` returns `[]`, leaving phases invisible to audit. The `phase-no-roadmap` audit rule (lib/audit.js line 300) then fires false positives, incorrectly reporting phases as "directory exists but no heading in ROADMAP.md" even though they are documented at a different depth.

This prevents users from adopting `####` nesting without triggering spurious audit failures.

## Approach

Change both regexes to accept *both* `###` and `####` (h3 and h4) by expanding `^###` to `^#{3,4}` (three or four hashes). This is scanner-only — no auto-normalization, no informational warnings. Phases at h4 depth will be found and behave identically to h3 phases; no UI or audit message changes.

**Affected functions and line numbers:**
1. `listPhases()` — lib/roadmap.js line 30 — regex replacement
2. `listCollapsedPhaseNums()` — lib/roadmap.js line 81 — regex replacement

**No audit message change** — the `phase-no-roadmap` rule message (line 300) remains unchanged; it will now correctly recognize `####` headings and not fire on valid phases.

## Tasks

1. **Update `listPhases()` regex**
   - File: `lib/roadmap.js` line 30
   - Change: `^###\s+Phase` → `^#{3,4}\s+Phase` (add heading flex to match h3 and h4)
   - Verify: Existing tests for Phase 1, 2, 2.1 still pass (all currently use `###`)

2. **Update `listCollapsedPhaseNums()` regex**
   - File: `lib/roadmap.js` line 81
   - Change: `^###\s+Phase` → `^#{3,4}\s+Phase` (same flex for consistency)
   - Verify: Collapsed milestone tests still work

3. **Ensure audit message accuracy**
   - File: `lib/audit.js` line 300 (no change to text, just verify it's accurate post-regex-update)
   - Verify: `phase-no-roadmap` finding only fires when phase truly absent (neither `###` nor `####` heading exists)

4. **Add test fixture for `####` Phase heading**
   - File: Create `test/fixtures/bug-a-quad-hash-phase/ROADMAP.md` or integrate into existing audit test suite
   - Content: ROADMAP with:
     - Phase 7 at `####` depth (h4)
     - Corresponding `.planning/phases/07-test/` dir
   - Verify: `listPhases()` finds Phase 7; `audit` yields zero `phase-no-roadmap` findings for it

5. **Run regression tests**
   - Command: `npm test`
   - Verify: All existing audit, lifecycle, and roadmap tests pass
   - Verify: New test for `####` Phase heading passes (assert `listPhases` finds it, audit clean)

6. **Commit**
   - Message: "Bug A: ROADMAP scanner accepts both `###` and `####` Phase headings"
   - Surface: Single atomic commit, regex + test

## Tests

### New fixture
- **Path**: Inline test in `test/unit-audit.js` or `test/dryrun-audit.js`
- **Content**: Project with both `### Phase 1:` (h3) and `#### Phase 7:` (h4) headings
- **Assertions**:
  1. `listPhases()` returns both phases (phase.num = '1' and phase.num = '7')
  2. `cp audit` against the project yields zero `phase-no-roadmap` findings
  3. Phase 7's plans are correctly parsed and counted

### Regression
- All existing `test/unit-audit.js` tests pass (especially `phase-no-roadmap` section)
- All existing `test/dryrun-audit.js` CLI tests pass
- All `npm test` passes

## Done-When

- [ ] `lib/roadmap.js` line 30 regex changed from `^###` to `^#{3,4}`
- [ ] `lib/roadmap.js` line 81 regex changed from `^###` to `^#{3,4}`
- [ ] New test fixture added and asserts `listPhases` finds `####` Phase headings
- [ ] New test asserts `cp audit` returns zero `phase-no-roadmap` findings for the fixture
- [ ] `npm test` passes (all unit + integration + dryrun tests green)
- [ ] Single atomic commit created with message "Bug A: ROADMAP scanner accepts both `###` and `####` Phase headings"

## Out of Scope

- **No auto-normalization**: ROADMAP.md files are not rewritten; phases at `####` depth are recognized as-is
- **No informational warning**: No banner, no deprecation notice, no "consider normalizing to `###`" message
- **No other heading depths**: Only `###` and `####` are accepted; `##` or `#####` remain invalid
- **No PLAN.md depth changes**: Phase plan files continue to use current nesting; this only affects ROADMAP discovery
- **No scope creep into other audit rules**: Only the `phase-no-roadmap` rule benefits; other rules are unaffected
