---
base-commit: null
end-commit: null
---

# Bug E — cp audit sham-review-log rule for reviewer-bearing skills

## Problem

Phases routed through reviewer-bearing execute skills (`superpowers/subagent-driven-development`, `superpowers/requesting-code-review`) can pass review with sham entries in REVIEW-LOG.md (e.g., "approved on first pass" with no real reviewer—empty, null, `orchestrator (inline)`, or `self`). No audit rule detects this drift, leaving WCCT-style projects unguarded.

## Approach

**Task 1: New audit rule `sham-review-log` in lib/audit.js**
- Add check function `checkShamReviewLog(root, ctx)` matching existing rule shape (like `checkPhaseNoRoadmap`).
- For each completed phase, load its resolved execute skill via `provider.resolveSkill('execute', root)` and phase PLAN.md workflow field.
- If resolved skill's `skill.name` ∈ allowlist (`superpowers/subagent-driven-development`, `superpowers/requesting-code-review`):
  - Open `REVIEW-LOG.md` at phase dir; parse entries.
  - Emit MEDIUM finding if:
    - Zero entries found, OR
    - Every entry's `reviewer` field ∈ {empty string, null, `orchestrator (inline)`, `self`}
- If REVIEW-LOG parse fails (malformed YAML, I/O), degrade to INFO severity and `id: 'rule-did-not-run'` + message `sham-review-log did not run: <reason>`.
- Register in CHECKS array at line 340+ with id `'sham-review-log'`, severity MEDIUM, always-on.

**Task 2: Parse and entry-detect helper**
- Add `parseShamReviewLogEntries(reviewLogPath)` helper:
  - Read REVIEW-LOG.md; expect YAML array or CSV-like format with `reviewer` column.
  - Return `{ entries: [...], error: null }` on success.
  - Return `{ entries: [], error: '<reason>' }` on parse failure (missing file, YAML error, etc.).
  - Each entry must have a `.reviewer` field; missing field treated as empty string.

**Task 3: Allowlist detection**
- Helper `isReviewerBearingSkill(resolvedSkill)`:
  - Check if `resolvedSkill.skill && resolvedSkill.skill.name` matches `/^superpowers\/(subagent-driven-development|requesting-code-review)$/`.
  - Return boolean.

**Task 4: Determine workflow + resolve skill per phase**
- For each phase, load PLAN.md frontmatter → extract `workflow:` field (name like `compose`, `brainstorm`, etc.).
- Delegate to `provider.resolveSkill('execute', root)` to get resolved skill object.
- If skill resolution fails or returns null, skip the check for that phase (emit no finding).

**Task 5: Fixture + test in test/dryrun-audit.js**
- Add fixture phase directory `.planning/phases/test-sham-review-log-101/`:
  - PLAN.md with frontmatter `workflow: compose`.
  - REVIEW-LOG.md with one entry: `reviewer: "orchestrator (inline)"` OR empty.
  - config.json routing `execute` role to `superpowers/subagent-driven-development`.
- Assert `cp audit` emits **one** MEDIUM finding `id: 'sham-review-log'` for this phase.
- Add counter-fixture (real reviewer name like "alice@example.com") → assert **zero** sham-review-log finding.
- Assert parse-error fixture (malformed REVIEW-LOG.md) → INFO `rule-did-not-run` finding instead.

**Task 6: Update CHECKS registry**
- Add `{ id: 'sham-review-log', fn: checkShamReviewLog }` to CHECKS array at line 340.

## Tasks

- [ ] 1-1: Add `parseShamReviewLogEntries(reviewLogPath)` helper to lib/audit.js
- [ ] 1-2: Add `isReviewerBearingSkill(resolvedSkill)` helper to lib/audit.js
- [ ] 1-3: Implement `checkShamReviewLog(root, ctx)` check function
- [ ] 1-4: Register check in CHECKS array
- [ ] 2-1: Create fixture phase test-sham-review-log-101 (sham entry)
- [ ] 2-2: Create counter-fixture with real reviewer
- [ ] 2-3: Create parse-error fixture
- [ ] 2-4: Add test assertions in test/dryrun-audit.js

## Tests

**Test 1: Empty REVIEW-LOG**
- Fixture: phase with reviewer-bearing skill + empty REVIEW-LOG.md.
- Expect: `cp audit` finds MEDIUM `sham-review-log`.

**Test 2: All sham reviewers**
- Fixture: phase with three entries, all `reviewer: "orchestrator (inline)"`.
- Expect: MEDIUM finding.

**Test 3: Real reviewer present**
- Fixture: phase with entry `reviewer: "alice@example.com"`.
- Expect: No sham-review-log finding (rule passes).

**Test 4: Mixed (one real, others sham)**
- Fixture: phase with two entries, one real reviewer, one orchestrator.
- Expect: No finding (at least one real reviewer present).

**Test 5: Non-reviewer-bearing skill**
- Fixture: phase with execute skill NOT in allowlist (e.g., `manual`).
- Expect: No sham-review-log finding (check skipped for this skill).

**Test 6: Parse error (malformed REVIEW-LOG.md)**
- Fixture: REVIEW-LOG.md with garbage YAML.
- Expect: INFO `rule-did-not-run` finding, not a crash.

**Test 7: Missing REVIEW-LOG.md**
- Fixture: phase with reviewer-bearing skill, no REVIEW-LOG.md file.
- Expect: MEDIUM `sham-review-log` (treated as zero entries).

## Done When

- [ ] `checkShamReviewLog` added to lib/audit.js with proper error handling.
- [ ] All helpers (`parseShamReviewLogEntries`, `isReviewerBearingSkill`) present and tested.
- [ ] CHECKS registry updated; rule fires at MEDIUM severity, always-on.
- [ ] All seven test scenarios pass in test/dryrun-audit.js.
- [ ] `npm test` passes; no regression in existing audit rules.
- [ ] `cp audit` against `.planning/` of this project yields zero new sham-review-log findings (or expected findings if fixtures added).
- [ ] Single atomic commit with message: `audit: add sham-review-log rule for reviewer-bearing skills`.
