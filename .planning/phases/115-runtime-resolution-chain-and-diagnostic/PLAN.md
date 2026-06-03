---
plan_id: "115"
phase_num: "115"
phase_name: "lib/runtime.js — extend resolvePhaseSkill with sigil + 5-step chain + per-phase fallback diagnostic"
tier: phase
status: pending
created: 2026-06-02
updated: 2026-06-02
base-commit: HEAD
expected_files:
  - lib/runtime.js
  - test/unit-runtime-resolution-chain.js
---

# Plan 115: Wire P1 primitives into runtime resolution chain

## Scope adjustment vs original DESIGN

DESIGN.md called for **one consolidated diagnostic block at workflow start**
(walk entire DAG, collect distinct skill pairs, emit aggregated ✓/ℹ/⚠ before
wave 1). That requires changing every `cp run` entry point to know about
"workflow start" vs "wave advance" and threading state across CLI
invocations — substantial surgery into bin/commands/run.js, run-workflow,
mark-complete, etc.

For v1.10 we scope down to **per-wave inline diagnostic** which still
addresses the root retro complaint (silent skill misses → forced
inline-fallback noise) but keeps the change confined to lib/runtime.js
where the wave formatter already lives. Each phase block gets an extra
`[resolution] <status>` line right before the prompt when something other
than a clean exact match happened. The consolidated-at-start aggregator can
land in v1.11 once we're sure the diagnostic format is right.

## Tasks

### Task 1 — Extend `resolvePhaseSkill` in `lib/runtime.js`

Current return: `{ name, source }` with source in
`{'absent','routing-key','pinned','pass-through'}`.

New return: `{ name, source, fuzzy?, candidates?, missingFrom?, fallbackPrompt? }`.

New source values:
- `'fuzzy-match'` — sigil hint matched to `name` via `findFuzzyMatch`.
  `candidates` is the scored list.
- `'fuzzy-miss'` — sigil hint had no candidate above threshold. `name` is
  the original hint (without sigil).
- `'exact-missing'` — non-sigil literal name does not exist in active
  provider's catalog. `missingFrom` is the active provider name.
- `'manual-prompt'` — fell back to manual provider's `prompts[role]`.
  `fallbackPrompt` is the inline prompt body.

Algorithm (per phase):

```
input: phaseSkill (raw string from YAML), phaseRole (phase.role)

1. if phaseSkill is null/empty → { source: 'absent' }
2. parsed = provider.parseSkillName(phaseSkill)   // {name, fuzzy}
3. if parsed.fuzzy:
     candidates = provider.listProviderSkills(activeProvider, cfg)
     match = provider.findFuzzyMatch(parsed.name, candidates)
     if match.chosen → { name: match.chosen, source: 'fuzzy-match', candidates: match.candidates, fuzzy: true }
     else            → fall through to step 5 with name = parsed.name, fuzzy-miss flag
4. else (exact):
     existing logic for routing-key / pinned
     if pass-through:
       if provider.skillExists(activeProvider, parsed.name, cfg) → { source: 'pass-through' } (unchanged)
       else → fall through to step 5 with source 'exact-missing'
5. fallback layer:
     prompt = provider.resolvePromptForRole(phaseRole, projectDir)
     if prompt → { name: parsed.name, source: 'manual-prompt', fallbackPrompt: prompt }
     else      → { name: parsed.name, source: 'subagent-dispatch' }
       (subagent-dispatch is the last resort directive — no prompt body)
```

Cache the result per `(skill, role)` for the lifetime of one
`formatInstruction` call to avoid recomputing on identical waves.

### Task 2 — Surface resolution status in the wave block

In `formatInstruction` per-phase block, after the existing
`role/model/invoke skill/persist_output/prompt` lines, emit ONE additional
`[resolution]` line when source ∈ {fuzzy-match, fuzzy-miss, exact-missing,
manual-prompt, subagent-dispatch}. Format:

- `fuzzy-match`: `[resolution] fuzzy: (<hint>) → <chosen>  (candidates: <a> <b> <c>)`
- `fuzzy-miss`: `[resolution] fuzzy: (<hint>) → no match above threshold; falling back`
- `exact-missing`: `[resolution] exact: <hint> not in <provider> catalog; falling back`
- `manual-prompt`: `[resolution] fallback: manual provider prompt for role "<role>" inlined below`
  followed by `[manual-prompt]\n<prompt-body>\n[/manual-prompt]` appended to
  the phase prompt block (so the agent has the role prompt right there)
- `subagent-dispatch`: `[resolution] fallback: dispatch a subagent with role "<role>"; use the phase prompt above`

The existing `invoke skill:` line still emits (with the resolved or
original name), and the `[attestation] invoked_skill:` contract still
applies — so authors using the contract can attest
`invoked_skill: <resolved-or-fallback-kind>`.

### Task 3 — Unit tests

File: `test/unit-runtime-resolution-chain.js` (new).

Test fixture builds a synthetic provider on disk with a small skill catalog
(e.g., skills `alpha`, `beta-gamma`, `delta-skill`) and a synthesised
config that points at it. Use a temp dir + cfg argument so we don't touch
real projects.

Cases:
1. exact match present → source: 'pass-through' (or routing-key/pinned via
   existing paths)
2. exact match missing → source: 'exact-missing'; then with manual prompt
   present → source: 'manual-prompt'; then without manual prompt → source:
   'subagent-dispatch'
3. sigil hit → source: 'fuzzy-match', candidates populated, chosen wins
   tiebreaks deterministically
4. sigil miss (no candidate above 0.5) → fuzzy-miss → falls through chain
5. malformed sigil (e.g., `(foo`) propagates the parser error (acceptable —
   author bug, fail loudly at workflow start)
6. absent skill → source 'absent', no resolution line emitted in
   formatInstruction

For `formatInstruction` integration: snapshot a small fixture template +
wave, assert the `[resolution]` line appears in expected cases and is
absent for clean exact matches (to keep noise low).

Wire into package.json#scripts.test.

### Task 4 — Self-verify

```
node test/unit-runtime-resolution-chain.js
node test/unit-runtime-fanout.js
node test/integration-runtime.js
node test/integration-format-instruction-skills.js
node test/unit-resolve-phase-skill.js
node test/unit-provider-fuzzy.js
```

All must pass.

## Out of scope

- Workflow-start aggregator (deferred to v1.11)
- cp run-verify (P3)
- milestone.yaml verify phase (P4)
- Docs / CHANGELOG / release (P5)

## Verify

See Task 4.
