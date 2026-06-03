---
phase_id: 115
title: runtime-resolution-chain-and-diagnostic
status: complete
milestone: v1-10-skill-routing-verify-gate
invoked_skill: (inline-fallback)
---

# SUMMARY — Phase 115: runtime resolution chain + per-wave diagnostic

## What shipped

**`lib/runtime.js`** — extended `resolvePhaseSkill` with the v1.10 five-step
resolution chain:

1. **Sigil parsing** via `provider.parseSkillName`. Malformed sigils emit a
   warning and pass through the raw string (author bug surfaced, not crashed).
2. **Fuzzy path** (sigil-wrapped name) → `listProviderSkills(active) →
   findFuzzyMatch(hint)`. On hit, returns `source: 'fuzzy-match'` with
   `fuzzy: true` and full scored candidate list.
3. **Routing-key / pinned** paths preserved unchanged (v1.9 behavior).
4. **Exact-name probe**: when a literal pass-through skill is *not* in the
   active provider's catalog (and the catalog is non-empty), promote to
   `source: 'exact-missing'` and chain-fall-back. Catalog-less providers
   (manual harnesses, dry-run fixtures) keep legacy pass-through.
5. **Chain fallback** (`_chainFallback`):
   - If `phaseRole` is set AND `provider.resolvePromptForRole(role)` returns
     a body → `source: 'manual-prompt'` with `fallbackPrompt` carrying the
     inline body.
   - Otherwise → `source: 'subagent-dispatch'` with `role` (may be null).

Return shape extended with optional `fuzzy`, `candidates`, `missingFrom`,
`missSource`, `role`, `fallbackPrompt` — old `{name, source}` consumers
unaffected.

**`lib/runtime.js#formatInstruction`** — surfaced resolution metadata into
the wave instruction:

- New helper `_formatResolutionLine(r, rawSkill)` emits a `  [resolution] ...`
  line only when source ∈ {fuzzy-match, exact-missing, manual-prompt,
  subagent-dispatch}. Clean exact matches stay quiet (no noise).
- For `manual-prompt`, the role-prompt body is inlined into the phase
  prompt as a `[manual-prompt] ... [/manual-prompt]` block so the agent
  sees it inline.
- Existing `invoke skill:` line, attestation contract, and verbose-mode
  legacy annotation preserved.

**`test/unit-runtime-resolution-chain.js`** — 12 assertions covering every
source value, malformed sigil handling, and the three formatInstruction
surface paths (fuzzy-match, manual-prompt inline, subagent-dispatch
directive). Synthetic catalogs injected via monkey-patched provider
functions (deterministic on any host).

## Test results

- `unit-runtime-resolution-chain`: **12 / 12 pass**
- `unit-provider-fuzzy`: 29 / 29 pass (P1 regression)
- `unit-resolve-phase-skill`: 9 / 9 pass (updated to use no-such-provider
  for deterministic pass-through expectations)
- `integration-format-instruction-skills`: 3 / 3 pass (same update)
- `integration-runtime`: 68 / 68 pass (no regression)
- `unit-runtime-fanout`: 60 / 60 pass (no regression)
- `integration-workflow-skills`: 93 / 93 pass (no regression)

Total v1.10-touching coverage: **214 assertions green**.

## Behavioral changes (intentional, callout for v1.10 changelog)

1. Literal pass-through skills that are absent from the *installed* active
   provider's on-disk catalog now chain-fall-back rather than silently
   passing through to a guaranteed-miss invocation. Tests that asserted
   pass-through against `superpowers` had to pin to a no-such-provider
   workflow_provider for determinism. **This is the bug fix the downstream
   v4.7 retro reported** — silent fallback is gone.
2. Existing exact-match routing-key/pinned/absent paths are byte-identical
   to v1.9. Verified by running the unchanged subset of
   `unit-resolve-phase-skill` + `integration-format-instruction-skills`.

## Scope adjustment (deferred, recorded in PLAN)

The original DESIGN.md called for a workflow-start aggregated diagnostic
("here are all the missing skills before any wave runs"). Implementing
that requires threading "this is the first wave" state through every
`cp run` and `cp run mark-complete` entry point — substantial surgery.
Per-wave inline `[resolution]` line is sufficient to address the silent-
skill-miss complaint, so the aggregator is deferred to v1.11.

## Files touched

- `lib/runtime.js` (resolvePhaseSkill, formatInstruction, two new helpers)
- `test/unit-runtime-resolution-chain.js` (new)
- `test/unit-resolve-phase-skill.js` (two tests pinned to no-such-provider)
- `test/integration-format-instruction-skills.js` (one test pinned to
  no-such-provider)
- `package.json` (test chain extended)

## Next: phase 116 — `cp run-verify` subcommand + verify gate library.
