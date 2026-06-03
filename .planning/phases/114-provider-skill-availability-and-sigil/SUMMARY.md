Implemented 4 new primitives in lib/provider.js (parseSkillName, findFuzzyMatch, listProviderSkills, skillExists) + resolvePromptForRole alias. 29 new assertions in test/unit-provider-fuzzy.js all pass. Baseline tests (unit-libs, unit-resolve-phase-skill) still pass. Test wired into package.json. Deferred role-filter: SP SKILL.md has no role: frontmatter — pure token-overlap suffices.

invoked_skill: (inline-fallback)
