---
phase: "110"
goal: "Implement skill-load attestation: append invoked_skill contract to prompts, parse mark-complete stdin, audit for skill-resolved-but-not-loaded"
gsd_phase: false
---

# Phase 110 — Bug F: Skill-Load Attestation

## Problem

cp has no mechanism for the harness LLM to attest that it actually loaded and invoked the resolved skill. A workflow phase whose `execute:` role resolves to `superpowers/subagent-driven-development` (or another skill) can be silently fulfilled by inline paraphrase, and cp has no signal to detect this bypass.

**Root cause:** The runtime system resolves skills but never confirms that the harness agent actually used them. This leaves a gap in the audit trail that Bug E (sham REVIEW-LOG) does not fully cover — an agent can bypass even reviewer skills by answering inline.

## Approach

Three atomic, coordinated changes in a single commit:

### (a) Prompt Augmentation — Append Attestation Contract

**Where:** `lib/runtime.js` or whichever module builds the per-phase instruction for the harness (search for the prompt formatter that builds the instruction string).

**What:** When a phase's `skill:` field resolves to a non-`(none)` value, append a mandatory attestation block to the end of the per-phase instruction:

```
[End of prompt]
---

## Attestation

You have been assigned to the following skill for this phase:

**Skill:** <resolved-skill-name>

To mark this phase complete, you **must** include the following line in your mark-complete input:

```
invoked_skill: <resolved-skill-name>
```

Omitting or altering this line will trigger a framework audit finding (MEDIUM severity).
```

**Rationale:** This makes the contract explicit to the harness agent and forces conscious decision-making. If the agent bypasses the skill, it either:
1. Omits the line → marks `<unrecorded>` → audit flags it as "missing attestation"
2. Invokes a different skill → writes that name → audit flags it as "resolved but invoked X"
3. Correctly invokes the resolved skill → writes correct name → audit passes

**Key:** Do not emit this block if the phase has `skill: (none)` or no skill field. The phase then has no attestation contract.

### (b) mark-complete Parser — Extract & Persist invoked_skill

**Where:** `bin/commands/run.js`, the `runMarkComplete` function (currently at line ~413).

**After:** `runtime.markPhaseComplete(slug, phaseId, stdinText, opts)` returns successfully.

**What:** Parse the `stdinText` argument for an `invoked_skill:` line and extract the value:

```javascript
// Extract invoked_skill from stdin (YAML block or freeform text)
// Pattern: invoked_skill: <value> (case-sensitive)
const invokedSkillMatch = stdinText.match(/^invoked_skill:\s*(.+?)$/m);
const invokedSkill = invokedSkillMatch ? invokedSkillMatch[1].trim() : '<unrecorded>';
```

**Error handling:**
- **Missing line** → `<unrecorded>` (no error, no warning at this layer)
- **Malformed YAML** (e.g., `invoked_skill` present but no colon, or invalid YAML syntax in block) → `<unrecorded>` + emit WARN log to stderr like: `"warn: mark-complete: could not parse invoked_skill block for phase <phaseId>, recorded as <unrecorded>"`
- **Whitespace / case sensitivity:** `invoked_skill:` is exact. `invokedSkill:` or `Invoked_Skill:` do not match.

**Persist to run-state:**

After the phase is successfully marked complete, write the invoked_skill to the run-state JSON:

```javascript
// Path: .planning/.run-state/<slug>/<phase>.json
// Write an object (or append to existing) with key `invoked_skill`
// Example: { "status": "complete", "invoked_skill": "superpowers/subagent-driven-development", ... }
```

Confirm location of run-state writes by grepping existing code (likely in `lib/runtime.js` or in the `markPhaseComplete` impl). The run-state file should already exist after `startRun` or `resumeRun`.

**Back-compat:** If the field does not exist in existing run-state JSON from v1.8.x runs, that is expected. The audit rule (below) treats `<unrecorded>` as a valid state that generates a MEDIUM warning, never an error. In-flight v1.8.x runs remain unbroken.

### (c) Audit Rule — skill-resolved-but-not-loaded

**Where:** `lib/audit.js`, in the `CHECKS` registry (search for existing rules like `phase-no-roadmap`).

**Rule ID:** `skill-resolved-but-not-loaded`

**Severity:** MEDIUM

**Logic:**

For each completed phase (i.e., phases with SUMMARY.md written):

1. Load the workflow YAML to find the resolved `execute:` skill (use existing skill-resolution code; see Bug E's `sham-review-log` rule for example).
2. If skill is `(none)` or falsy → skip (no attestation contract was issued for this phase).
3. If skill is defined **and** the skill name is in a **reviewer-bearing allowlist** (same allowlist as Bug E; see note below):
   - Load or attempt to load `.planning/.run-state/<slug>/<phase>.json` (or the equivalent state file).
   - Extract the `invoked_skill` field.
   - If field is missing or equals `<unrecorded>` **and** the resolved skill was on the allowlist → emit finding:
     ```
     id: skill-resolved-but-not-loaded
     severity: MEDIUM
     location: <phase_dir>/SUMMARY.md (or the phase's workflow reference)
     message: "Phase <phaseId> resolved execute skill '<skill-name>' but invoked_skill was not recorded. See attestation contract in that phase's prompt."
     fix: "Ensure the LLM invoked the resolved skill and included `invoked_skill: <name>` in mark-complete output."
     ```
   - If `invoked_skill` field exists but does not match the resolved skill name → emit finding:
     ```
     message: "Phase <phaseId> resolved skill '<resolved>' but LLM attested to invoking '<attested>'. Skill mismatch."
     ```

4. If skill is on the allowlist **and** `invoked_skill` matches the resolved skill → no finding.
5. If skill is **not** on the allowlist → skip (do not audit this phase; the contract is optional for non-reviewer skills in v1.9).

**Reviewer-bearing allowlist:**

Use the same allowlist as Bug E. Initially hardcode:
```javascript
const REVIEWER_BEARING_SKILLS = new Set([
  'superpowers/subagent-driven-development',
  'superpowers/requesting-code-review',
]);
```

This list is shared between Bug E and Bug F rules. Define it once at the module level in `lib/audit.js` (or in a shared constant file if preferred) and reference from both rule implementations.

**Note on run-state location:**

The audit rule needs to cross-reference the workflow run's `.run-state/` directory. Determine the slug and phase ID from the phase directory and SUMMARY metadata, then look up `.planning/.run-state/<slug>/<phase>.json`. If the run-state file does not exist or cannot be read, treat it as `<unrecorded>` (no error, emit finding if needed).

---

## Tasks

Breakdown into granular, independently-reviewable commits (all in one atomic PR, but each task is its own commit):

- **110-1** (lib/runtime.js): Append attestation contract to per-phase instruction when skill is non-`(none)`. Test: prompt-test ensures attestation block appears.

- **110-2** (bin/commands/run.js): Parse `invoked_skill:` from stdin in `runMarkComplete`, write to run-state `.planning/.run-state/<slug>/<phase>.json`. Test: parser-test ensures extraction and persistence.

- **110-3** (lib/audit.js): Implement `skill-resolved-but-not-loaded` rule. Load run-state, cross-reference against resolved skill on allowlist, emit findings. Test: audit-test checks all three cases (missing, mismatch, match).

- **110-4** (test/): Fixtures and integration tests (see Testing section below).

---

## Testing

### Unit / Integration Tests

**test/integration-skill-attestation-prompt.js** (~4 assertions):
- Load a workflow with phases whose execute skill is `superpowers/subagent-driven-development`.
- Generate the per-phase instruction via `runtime.startRun` or equivalent.
- Assert that the instruction contains the attestation block with the correct skill name.
- Assert that a phase with `skill: (none)` does **not** contain an attestation block.

**test/integration-mark-complete-invoked-skill.js** (~6 assertions):
- Test 1: stdin without `invoked_skill:` line → `<unrecorded>` persisted, no error thrown.
- Test 2: stdin with `invoked_skill: foo` → `"foo"` persisted to run-state.
- Test 3: stdin with `invoked_skill: superpowers/subagent-driven-development` → correct skill persisted.
- Test 4: malformed YAML (e.g., `invoked_skill` without colon) → `<unrecorded>` persisted, WARN logged to stderr.
- Test 5: stdin with multiple lines, `invoked_skill:` in the middle → correctly extracted.
- Test 6: Run-state file already exists; update adds or overwrites `invoked_skill` field without losing other fields.

**test/integration-audit-skill-resolved-but-not-loaded.js** (~5 assertions):
- Fixture 1: Phase with resolved skill `superpowers/subagent-driven-development` and run-state `invoked_skill: <unrecorded>` → audit emits MEDIUM finding.
- Fixture 2: Phase with same resolved skill but `invoked_skill: superpowers/subagent-driven-development` (match) → no finding.
- Fixture 3: Phase with same resolved skill but `invoked_skill: orchestrator (inline)` (mismatch) → audit emits MEDIUM finding with message about mismatch.
- Fixture 4: Phase with resolved skill `custom-skill` (not on allowlist) and `invoked_skill: <unrecorded>` → no finding (rule skips non-allowlist skills).
- Fixture 5: Run-state file missing entirely → treat as `<unrecorded>`, emit finding if skill on allowlist.

### Regression Tests

- **npm test**: Run full suite (`npm test`) after each task to ensure no existing tests break.
- **Self-audit**: After all tasks complete, run `cp audit` on this project's own `.planning/` directory to ensure no new findings are introduced by the new rule itself.

---

## Implementation Notes

### File Locations & Modules

- **lib/runtime.js**: Search for the function that builds the instruction string (likely `emitInstruction`, `buildInstruction`, or `formatInstruction`). This is where attestation contract is appended.
- **bin/commands/run.js**: `runMarkComplete` function (line ~413). After `runtime.markPhaseComplete()` succeeds, extract and persist `invoked_skill`.
- **lib/audit.js**: Add a new check function and register it in the `CHECKS` array.
- **Shared constant**: Define `REVIEWER_BEARING_SKILLS` in `lib/audit.js` at module level, or in a new `lib/skill-allowlist.js` if multiple files need it.

### Run-State JSON Schema

Add a new field to the per-phase run-state object:

```json
{
  "id": "<phase-id>",
  "status": "complete",
  "invoked_skill": "<skill-name or <unrecorded>",
  "_timestamp": "...",
  "..."
}
```

The field is optional for backward compatibility. If absent when audit runs, treat as `<unrecorded>`.

### Regex / Parsing

For `invoked_skill:` extraction, use:
```javascript
const match = stdinText.match(/^invoked_skill:\s*(.+?)$/m);
const value = match ? match[1].trim() : '<unrecorded>';
```

This handles:
- Leading/trailing whitespace
- Single line in multi-line input
- Case-sensitive exact match for `invoked_skill:`

### Error Handling Philosophy

- **Parser errors** (malformed YAML, missing file) → `<unrecorded>` + WARN log, never block phase completion.
- **Audit rule errors** (run-state missing, JSON parse failure) → treat as `<unrecorded>`, emit finding if needed, never crash the audit.
- **Back-compat** → missing field in old run-state = expected and safe.

---

## Dependency Note

This phase depends on Bug E for the shared **reviewer-bearing allowlist constant**. If Bug E has not yet been implemented, define the allowlist independently in this phase and refactor into a shared module before Bug E ships. Alternatively, implement both in parallel if they are part of the same milestone wave.

---

## Done When

- [ ] Attestation contract is appended to per-phase instructions for phases with non-`(none)` skills.
- [ ] `mark-complete` parser extracts `invoked_skill:` from stdin and writes to run-state JSON.
- [ ] `skill-resolved-but-not-loaded` audit rule detects three cases: missing attestation, skill mismatch, and match.
- [ ] All tests (unit, integration, regression) pass. `npm test` returns 0.
- [ ] Self-audit of this project's `.planning/` yields no findings from the new rule.
- [ ] No existing tests regress.

---

## Back-Compat Note

**v1.8.x In-Flight Runs:**

Existing run-state JSON files from v1.8.x runs will not have an `invoked_skill` field. When the audit rule encounters such files:
1. Missing field → treat as `<unrecorded>`.
2. If the phase's resolved skill is on the allowlist → emit a MEDIUM finding, but do not error.
3. If the phase's resolved skill is not on the allowlist or is `(none)` → rule skips the phase entirely.

This ensures that running `cp audit` on an old project does not break; it may produce new MEDIUM findings for old phases with reviewer skills, but this is intentional (a signal to upgrade the run documentation).

**Users who want to silence the finding** can retroactively add `invoked_skill:` to old run-state files or re-run the phase with the new code.

---

## Single Atomic Commit

All four tasks (110-1 through 110-4) are committed in a single, logically-atomic commit with message:

```
Bug F: Implement skill-load attestation

- lib/runtime.js: Append invoked_skill attestation contract to per-phase instructions
  when the phase's execute skill resolves to non-(none).
- bin/commands/run.js: Parse invoked_skill from mark-complete stdin and persist to
  .run-state/<slug>/<phase>.json. Graceful back-compat: missing field = <unrecorded>.
- lib/audit.js: New always-on MEDIUM audit rule skill-resolved-but-not-loaded.
  Cross-references run-state invoked_skill vs workflow resolved skill on reviewer-bearing
  allowlist (shared with Bug E). Flags missing, mismatched, or unrecorded attestations.
- test/: New integration tests for prompt, parser, and audit rule. Fixtures for all
  three cases (match, mismatch, <unrecorded>).

Back-compat: v1.8.x runs have no invoked_skill field; treated as <unrecorded> and
produce MEDIUM findings (not errors), preserving unbroken in-flight workflows.

Fixes https://github.com/shushenglihotmail/context-planning/issues/...
```

---

## Related Bugs

- **Bug E** (`sham-review-log`): Uses the same reviewer-bearing allowlist constant. Coordinate constant definition or share the module.
- **Bug A** (`lib/roadmap.js` regex): Independent; no cross-dependencies.
- **Bug B** (`write-summary` path validation): Independent; no cross-dependencies.
- **Bug C** (`complete-milestone` state regen): Independent; no cross-dependencies.
- **Bug D** (`doctor --fix-dual-plan`): Independent; no cross-dependencies.
