# v1.6 Workflow Contract Hardening — Design

**Date:** 2026-05-28
**Milestone slug:** `v1-6-workflow-contract-hardening`
**Status:** Spec — awaiting user review

---

## Problem

Three independent gaps in the cp workflow contract let agents silently drift away
from what workflows specify:

1. **Weak skill-invocation contract.** Workflow phases declare `skill: <name>`,
   but the wave-block output cp emits today reads as metadata
   (`skill: writing-plans (source: routing-key)`). Multiple agents have read this
   as a recommendation and performed the phase inline — skipping the routed
   Superpowers skill entirely — without violating any explicit rule in the
   orchestrator skills.

2. **Incomplete default routing map.** `lib/workflow-template-expand.js`
   `CONFIG_FALLBACKS` only maps 5 of the common workflow role-keys to Superpowers
   skill names. Workflow authors who write `skill: ${config.provider.test_skill}`
   or use other natural role-keys silently fall through to "absent" instead of
   the obvious Superpowers default.

3. **No framework-managed auto-close.** Workflows close cooperatively: each
   workflow must declare a `finalize` phase that calls a `cp *-finalize` CLI.
   Built-in `debug.yaml` and `dev.yaml` don't have one; any user-authored
   workflow can omit it too. A run that completes its last user phase stays
   open forever — and there is no detection if the user commits the work
   silently without driving the wave loop to mark-complete.

These compound: a workflow may route to a skill that the agent ignores, finish
work the framework can't observe, and never close.

---

## Locked Decisions

The brainstorm gate resolved each gap to exactly one approach:

### D1 — Auto-close: implicit `finalize` phase injection

When a workflow YAML omits a phase named `finalize`, the cp runtime
auto-appends a scaffold phase that calls the appropriate `cp *-finalize` CLI
for that `binds_to` kind. The injection happens at workflow-load time, so the
wave loop and `state.json` see it as a normal terminal phase. Authors who
need custom finalize behavior keep the existing override path: declare your
own phase with `id: finalize`.

**Why not "framework detects last phase done and auto-closes"?** Because
"done" ≠ "Done-When satisfied." Forcing the close through a phase preserves
the artifact contract (SUMMARY, state flip, ROADMAP update) and keeps the
audit trail uniform between built-in and custom workflows.

### D2 — Skill-invocation enforcement: imperative wave-block wording (Approach 1)

In `lib/runtime.js` `formatWaveBlock`, change the per-phase emission so that
the existing `skill:` line itself reads as a directive: `invoke skill: <name>`
when a skill is routed, `skill: (none)` when not. A one-time contract legend
printed at the top of the wave block defines what `invoke skill:` means and
allows a single legitimate fallback: if the named skill is unavailable in
the harness, the agent falls back to inline execution AND tells the user
which skill was missing.

The current `(source: routing-key)` provenance string is dropped from the
agent-facing output and moved behind a new `cp run --verbose` flag for
workflow authors debugging routing.

No self-attestation flag. No audit drift rule. No shared "contract" skill.
Honor-system enforcement, but the directive is now in the same line the
agent reads to learn the skill name — no redundancy, no metadata
ambiguity.

**Why not a separate `REQUIRED ACTION:` line?** Bolting on a second line
admits the first line is being read as decoration. The fix is to make the
existing `skill:` field read as the instruction it already is.

**Why not the shared `cp-skill-invocation-contract` skill (rejected
Approach 3)?** The `requires:` field is read but not auto-loaded by any
documented harness contract; lifting the rule into a separate file would
make it invisible at runtime and create a new drift surface (forgotten
`requires:` entries). The shared-skill option remains a trivial v1.7 lift if
honor-system enforcement proves insufficient.

### D3 — Default routing map expansion

Extend `CONFIG_FALLBACKS` in `lib/workflow-template-expand.js` with the
remaining common role-keys, all mapped to their corresponding Superpowers
skills:

| Config key                                | Superpowers skill                |
|-------------------------------------------|----------------------------------|
| `provider.test_skill`                     | `test-driven-development`        |
| `provider.debug_skill`                    | `systematic-debugging`           |
| `provider.verify_skill`                   | `verification-before-completion` |
| `provider.execute_plan_skill`             | `executing-plans`                |
| `provider.finish_branch_skill`            | `finishing-a-development-branch` |

Existing 5 entries (`quick_design_skill`, `plan_skill`, `execute_skill`,
`brainstorm_skill`, `review_skill`) stay as-is.

### D4 — Prompt-scrub for contradictory instructions (Approach 1 scope)

Five existing skill files contain wording that legitimizes inline execution
or fails to repeat the imperative. All five get edited inline; no new skill
is introduced. Concrete edits enumerated below.

---

## Changes

### Change 1 — `lib/runtime.js` formatWaveBlock imperative

**File:** `lib/runtime.js` (lines ~366–379)

Replace the current per-phase emission:

```js
const skillLine = resolvedSkill.source === 'absent'
  ? '(absent)'
  : `${resolvedSkill.name} (source: ${resolvedSkill.source})`;
// ...
lines.push(`  skill: ${skillLine}`);
```

with logic that makes the `skill:` line itself read as a directive when a
skill is routed:

```
  invoke skill: writing-plans
```

And, when `source === 'absent'`:

```
  skill: (none)
```

The `(source: routing-key)` provenance string is dropped from the agent-
facing block. Workflow authors who want it for routing debugging get it via
a new `cp run --verbose` flag (or `cp run inspect`, which already surfaces
resolution detail). Verbose output is unchanged from today.

The contract for what `invoke skill:` means is stated once per wave, as a
single legend printed above the per-phase blocks (not repeated per phase):

```
[contract] For each phase below:
  'invoke skill: <name>'  → call that skill via your harness's skill tool now;
                            do NOT perform the phase inline.
  'skill: (none)'         → no skill is routed; follow the prompt inline.

  If the named skill is unavailable in your harness (not installed, not
  loadable), fall back to inline execution using the prompt — and tell the
  user which skill was missing so they can install it or adjust routing.
```

Rationale: the contract is stated once at the top of the wave block so the
agent reads it in the same context where it reads phase data, and the verb
"invoke" on the per-phase line carries the imperative without redundancy.
The fallback clause is the only legitimate escape hatch — if the skill
genuinely isn't available, inline is acceptable, but the agent must surface
the gap rather than silently degrade.

**Wording is locked.** No knobs, no per-workflow override.

### Change 2 — Auto-inject `finalize` in `lib/workflow-template-expand.js`

After workflow YAML is parsed and `CONFIG_FALLBACKS` substitution runs, but
before the workflow object is returned, walk the `phases` list. If no phase
has `id: finalize`, append:

```yaml
- phase:
    id: finalize
    description: |
      Auto-injected finalize phase. Closes the run by writing the standard
      SUMMARY/state artifacts for this workflow kind.
    depends_on: [ <id of previous last phase> ]
    kind: scaffold
    command: "cp <kind>-finalize {{slug_with_date}}"
```

The `<kind>` is derived from the workflow's `binds_to:` field
(`quick` → `cp quick-finalize`, `milestone` → `cp milestone-finalize`,
`debug`/`dev`/custom → fall back to a generic `cp run-finalize <slug>` CLI
that flips run status and writes a minimal SUMMARY).

A new lightweight CLI `cp run-finalize <slug>` is added to handle the
generic case — it flips `state.json` `status: complete` and writes a
SUMMARY.md scaffold under `.planning/runs/<slug>/`. Built-in `quick-finalize`
and `milestone-finalize` are untouched.

Auto-injection runs only at load time and never modifies the YAML on disk.
`cp run inspect <workflow>` shows the injected phase tagged with
`source: auto-injected` so authors can see it.

### Change 3 — Expand `CONFIG_FALLBACKS`

Add the five rows from D3 to `CONFIG_FALLBACKS` in
`lib/workflow-template-expand.js`. Update the docstring above the table to
reflect the new entries.

### Change 4 — Prompt scrub (Approach 1)

Five inline edits, no new files. Each edit aligns the orchestrator's
wording with the locked wave-block legend from Change 1
(`invoke skill: <name>` directive, plus the "unavailable → inline + tell
the user" escape hatch).

| # | File                                        | Line | Problem                                                                        | Edit                                                                                                                            |
|---|---------------------------------------------|------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| 1 | `.github/skills/cp-quick/SKILL.md`          | 3    | Description starts with "Lightweight" — primes skipping ceremony.              | Remove "Lightweight" and reword: "Ad-hoc task. Scaffolds DESIGN.md + STATE.md, drives the quick workflow, records SUMMARY.md." |
| 2 | `.github/skills/cp-quick/SKILL.md`          | ~30  | Says "Follow per-phase instructions exactly" but never restates the imperative. | Add an explicit step: "When `cp run` emits an `invoke skill: <X>` line, you MUST invoke that skill via your harness's skill tool. Do not perform the phase inline. If the skill is unavailable in your harness, fall back to inline and tell the user which skill was missing." |
| 3 | `.github/skills/cp-workflow-run/SKILL.md`   | 89   | "manual fallback... you'll do the work yourself" legitimizes inline.            | Reframe: inline fallback applies only when (a) the phase has no resolved skill (`skill: (none)`), or (b) the resolved skill is unavailable in the harness. Case (b) requires telling the user which skill was missing. |
| 4 | `.github/skills/cp-new-project/SKILL.md`    | 58   | "If provider is manual, inline a minimal..." same pattern.                      | Same reframe as #3.                                                                                                              |
| 5 | `.github/skills/cp-execute-phase/SKILL.md`  | 109  | "do an inline check" softens the contract.                                      | Reword to "verify via the routed skill; if no skill is routed (or the skill is unavailable), then do an inline check and tell the user." |
| 6 | `.github/skills/cp-workflow-run/SKILL.md`   | ~155 | Step 5.2's imperative exists but isn't visually anchored.                       | Add a one-paragraph **Skill Invocation Contract** subsection above the existing Step 5.2 imperative that quotes the wave-block legend verbatim. Any orchestrator that loads `cp-workflow-run` then sees the same wording the agent will see in run output. |

`cp-quick` does NOT load `cp-workflow-run` (it shells directly to
`cp run quick`), so edit #2 above adds the contract sentence locally — this
is why we don't lift it to a shared skill (Approach 3): the contract is
visible wherever the agent looks.

---

## Files Changed

- `lib/runtime.js` — wave-block legend + `invoke skill:` directive line (D2).
- `lib/workflow-template-expand.js` — auto-inject finalize, expand CONFIG_FALLBACKS (D1, D3).
- `bin/commands/run.js` — add `--verbose` flag to surface routing provenance (now hidden by default).
- `bin/commands/run-finalize.js` (new) — generic finalize CLI for custom workflows.
- `bin/cp.js` — register `run-finalize` subcommand.
- `.github/skills/cp-quick/SKILL.md` — description + contract sentence (edits 1, 2).
- `.github/skills/cp-workflow-run/SKILL.md` — fallback reframe + contract paragraph (edits 3, 6).
- `.github/skills/cp-new-project/SKILL.md` — fallback reframe (edit 4).
- `.github/skills/cp-execute-phase/SKILL.md` — verify wording (edit 5).
- `test/runtime.test.js` — new cases for `invoke skill:` emission, contract legend, `skill: (none)`, `--verbose` provenance.
- `test/workflow-template-expand.test.js` — new cases for finalize injection + new fallback rows.

## Files NOT Changed

- `templates/workflows/quick.yaml`, `milestone.yaml`, `complete-milestone.yaml` — they already have `finalize`; injection no-ops.
- `templates/workflows/debug.yaml`, `dev.yaml` — they DON'T have `finalize`; injection adds it at load time. No YAML edit needed, but a follow-up commit can codify the injection into the YAML if we ever want it visible to readers.
- `lib/run-lifecycle.js` — no auto-close-on-completion path needed; the injected finalize phase carries closure.
- `lib/provider.js` — `resolveSkill` is the right shape already; only its callers change.

---

## Out of Scope

- Detecting silent commits (user side-commits without driving the wave loop). Left as a known-and-accepted limitation; cp remains invocation-based, not a daemon.
- `cp doctor` warning for non-superpowers providers with under-populated routing maps. Deferred to v1.7.
- Self-attestation flag (`--invoked-skill=X`) on `cp run mark-complete`. Deferred to v1.7 if honor-system proves insufficient.
- Migration of `cp-quick` onto `cp-workflow-run` as a thin wrapper. Architecturally cleaner but a bigger refactor; revisit in v1.7.

---

## Testing

- **Unit:** every new branch in `runtime.js` and `workflow-template-expand.js` covered.
- **Integration:** snapshot test of full `cp run quick foo` output showing the contract legend at the wave top, `invoke skill: writing-plans` on the `design` phase, and `invoke skill: subagent-driven-development` on `execute`.
- **Regression:** existing snapshots updated to include the new line; diff review confirms wording matches the locked text.
- **Manual smoke:** run `cp run debug some-bug` on a workflow without finalize; confirm the auto-injected phase appears in the wave loop and closes via `cp run-finalize`.

## Migration / Compatibility

- No `cp-config.json` schema change.
- No workflow YAML changes required of users; existing workflows keep working.
- Output format change is additive (extra line per phase with a resolved skill). Anyone parsing wave-block output by line position breaks; nothing in the repo does this.

## Out of Scope

- Validator rule rejecting `skill:` on non-supervised workflows. The honor-system imperative (D2) covers supervised workflows; non-supervised workflows simply ignore the field today and that's tolerable. Revisit if dead `skill:` declarations cause real confusion.
- Detecting silent commits (user side-commits without driving the wave loop). Left as a known-and-accepted limitation; cp remains invocation-based, not a daemon.
- `cp doctor` warning for non-superpowers providers with under-populated routing maps. Deferred to v1.7.
- Self-attestation flag (`--invoked-skill=X`) on `cp run mark-complete`. Deferred to v1.7 if honor-system proves insufficient.
- Migration of `cp-quick` onto `cp-workflow-run` as a thin wrapper. Architecturally cleaner but a bigger refactor; revisit in v1.7.

---

## Open Questions

None. All decisions locked during brainstorm.

## Acceptance

This spec is accepted when the user replies with explicit approval. On
approval, the brainstorming skill hands off to `writing-plans` to produce
the implementation plan that maps each Change above to one or more atomic
tasks.
