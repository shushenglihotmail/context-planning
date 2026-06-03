---
phase_num: "114"
phase_name: "lib/provider.js — parens-sigil parser + role-filtered token-overlap fuzzy matcher + per-skill SKILL.md stat"
status: complete
end-commit: HEAD
---

# Phase 114 Summary

## What shipped

`lib/provider.js` gained four new primitives (no runtime wiring — P2 owns that):

- **`parseSkillName(rawName)`** — parens-sigil parser. Recognises `(skill-name)` as opt-in fuzzy marker. Throws on empty, unbalanced, nested, or stray-paren inputs.
- **`findFuzzyMatch(hint, candidates)`** — pure token-overlap matcher. Tokenizes on `-`/`_`/whitespace, scores by `tokens_matched / max(|hint|, |candidate|)` with substring matching, threshold `0.5`, deterministic tiebreak by score desc → length asc → alpha asc.
- **`listProviderSkills(providerName, cfg, root)`** — reads the provider plugin dir and returns alphabetically-sorted skill names. Returns `[]` for not-installed providers.
- **`skillExists(providerName, skillName, cfg, root)`** — stats `<provider>/skills/<name>/SKILL.md`.

Plus `resolvePromptForRole` is re-exported as an alias for `resolvePrompt`.

## What did NOT ship (and why)

Role filtering via `SKILL.md role:` frontmatter was deferred — inspecting the installed SP catalog showed SP skills only carry `name` + `description`, no `role:`. Heuristic role inference from descriptions would be fuzzy on fuzzy. v1.10 ships pure token-overlap with deterministic tiebreaks. To be documented in P5.

## Verification

- `node test/unit-provider-fuzzy.js` — 29 new assertions, all pass.
- `node test/unit-libs.js` — 132 baseline, all pass.
- `node test/unit-resolve-phase-skill.js` — 9 baseline, all pass.

Test wired into `package.json#scripts.test`.

## Files changed

- `lib/provider.js` (+148 LOC)
- `test/unit-provider-fuzzy.js` (new, 29 assertions)
- `package.json` (test script append)
- `.planning/phases/114-provider-skill-availability-and-sigil/PLAN.md`

invoked_skill: (inline-fallback)
