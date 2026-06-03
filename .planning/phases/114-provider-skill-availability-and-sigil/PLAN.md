---
plan_id: "114"
phase_num: "114"
phase_name: "lib/provider.js — parens-sigil parser + role-filtered token-overlap fuzzy matcher + per-skill SKILL.md stat"
tier: phase
status: pending
created: 2026-06-02
updated: 2026-06-02
base-commit: HEAD
expected_files:
  - lib/provider.js
  - test/unit-provider-fuzzy.js
---

# Plan 114: provider.js primitives for per-skill availability + parens-sigil fuzzy matching

## Problem

`lib/provider.js#resolveSkill` only resolves a *role* → mapped *skill name* via
config. It does NOT verify that the mapped skill actually has a `SKILL.md`
present in the installed provider's catalog. Workflow YAML can carry a
`skill: writing-plans` literal that resolves to a name the provider does not
ship — the runtime emits `invoke skill: <name>`, the harness shrugs, the
attestation reports `(inline-fallback)`, and the bug ships.

There is also no syntactic affordance for "I know this name might not be
exact — find me the closest match in the catalog." Authors currently have to
hard-code the exact provider-specific name.

## Goal (this phase only)

Add **primitives** to `lib/provider.js`. Do NOT wire them into the runtime
yet (that's P2). Specifically:

1. **`parseSkillName(rawName)`** — strip the parens-sigil if present; return
   `{ name, fuzzy }`. Reject malformed input (`(`, `)`, `((foo))`, `(foo`,
   `foo)`) with a clear `Error`.
2. **`listProviderSkills(providerName, cfg, root)`** — read the provider's
   skills directory and return the alphabetically-sorted list of skill names.
   Reuses `detect.detectProviderAtAnyHarness` to find the provider's evidence
   path; appends `/skills` and reads child dirs that contain a `SKILL.md`.
   Returns `[]` when the provider is not installed.
3. **`skillExists(providerName, skillName, cfg, root)`** — boolean stat of
   `<provider-evidence>/skills/<skillName>/SKILL.md`. Returns `false` when
   the provider is not installed.
4. **`findFuzzyMatch(hint, candidates)`** — pure function (no I/O). Tokenize
   `hint` and each candidate on `-`/`_`/whitespace. Score each candidate by
   `tokens_matched / max(hint_tokens, candidate_tokens)`, where a hint token
   matches a candidate token if it is a substring of the candidate token OR
   the candidate token is a substring of the hint token. Threshold `>= 0.5`.
   Tiebreak: highest score → shortest name → alphabetical. Returns
   `{ chosen: string|null, candidates: [{ name, score }] }`.
5. **`resolvePromptForRole(role, root)`** — already exists as `resolvePrompt`.
   Rename + re-export so the new resolution chain in P2 has a clear handle.

## Why no role-filter

The original DESIGN.md called for filtering candidates by `SKILL.md role:`
frontmatter before fuzzy matching. After inspecting the installed
Superpowers catalog, **SP `SKILL.md` files do not carry a `role:` field** —
only `name` and `description`. Adding role inference from descriptions would
require heuristic text matching, which is itself fuzzy and would complicate
testing without obvious accuracy gain. Defer role-filter for a future
milestone if it proves needed; v1.10 ships pure token-overlap, which gives
deterministic and reasonable results in practice (e.g., `(code-review)`
against the SP catalog scores `receiving-code-review` and
`requesting-code-review` at 0.67 each, tiebreak alphabetical →
`receiving-code-review` chosen).

Update DESIGN.md (P5 docs phase will do the docs sweep) to record this
deviation.

## Tasks

### Task 1 — Add the four primitives + rename

File: `lib/provider.js`

Add (in this order, after existing exports):

- `parseSkillName(rawName)` — sigil parser with strict validation.
- `findFuzzyMatch(hint, candidates)` — pure tokenize + score + tiebreak.
- `listProviderSkills(providerName, cfg, root)` — filesystem scan.
- `skillExists(providerName, skillName, cfg, root)` — stat.
- Rename `resolvePrompt` → keep both names for back-compat
  (`module.exports.resolvePrompt = resolvePromptForRole`).

Append all new names to `module.exports`. Do not modify `resolveSkill` in
this phase.

### Task 2 — Unit tests

File: `test/unit-provider-fuzzy.js` (new).

Cover:

- **parseSkillName**: `"foo"` → `{name:"foo", fuzzy:false}`; `"(foo)"` →
  `{name:"foo", fuzzy:true}`; `"(code-review)"` → `{name:"code-review", fuzzy:true}`;
  `"((foo))"` throws; `"(foo"` throws; `"foo)"` throws; `""` throws; `"()"` throws;
  whitespace trimmed inside parens (`"( foo )"` → `{name:"foo", fuzzy:true}`).
- **findFuzzyMatch**: 
  - empty candidates → `{chosen:null, candidates:[]}`.
  - identical token → score 1.0.
  - `code-review` vs `receiving-code-review` → 0.667 (2/3).
  - substring match: `review` vs `reviewer` matches.
  - threshold: candidate at 0.4 not chosen.
  - tiebreak: two candidates at same score → shortest name; same length →
    alphabetical.
  - deterministic across multiple calls (no Date.now / Math.random).
- **listProviderSkills**: manual provider (always installed, no skills dir)
  returns `[]`; with a synthetic fixture dir, returns sorted names.
- **skillExists**: synthetic fixture — present skill returns true; missing
  returns false; provider not installed returns false.

Wire into `package.json#scripts.test` (append `&& node test/unit-provider-fuzzy.js`).

### Task 3 — Self-verify

Run:

```
node test/unit-provider-fuzzy.js
node test/unit-libs.js
node test/unit-resolve-phase-skill.js
```

All three must pass. No other tests touched in this phase.

## Out of scope (P2/P3/P4/P5)

- Wiring the chain into runtime.js (P2).
- New `cp run-verify` command (P3).
- milestone.yaml changes (P4).
- Docs / CHANGELOG / release (P5).
- DESIGN.md correction about role-filter (P5).

## Verify

```
node test/unit-provider-fuzzy.js   # new tests pass
node test/unit-libs.js             # baseline still passes
node test/unit-resolve-phase-skill.js   # baseline still passes
```
