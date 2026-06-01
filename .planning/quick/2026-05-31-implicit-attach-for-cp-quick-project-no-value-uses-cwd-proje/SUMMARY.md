---
status: done
created: 2026-05-31
completed: 2026-05-31
commit: efacc6e
---

# Quick task SUMMARY — implicit attach for `cp quick-setup`

## What shipped

`cp quick-setup --project` and `--milestone` now accept **bare** forms
(no value), in addition to the existing `--project <name>` / `--milestone <name>`:

- `cp quick-setup --task "x" --project`
  → walks up from cwd to find `.planning/PROJECT.md` and scaffolds there.
- `cp quick-setup --task "x" --milestone`
  → picks the "latest" milestone:
    1. active set if any milestone is active (most recent `created:` among active),
    2. else most recent `created:` across all milestones,
    3. tie-break by lexicographically largest slug.
- `cp quick-setup --task "x" --project --milestone`
  → both bare, equivalent to "current project + its latest milestone".
- `cp quick-setup --task "x" --milestone 1.8`
  → unchanged resolver; substring rule already matches `v1.8 ...` display names.

Friendly errors when cwd has no project, or project has no milestones.

## Files changed

- `bin/commands/quick-setup.js` — added `_flag()` tri-state parser,
  `_readCreated()` + `_latestMilestone()` helpers, refactored `run()` to
  branch on bare-vs-valued forms.
- `bin/commands/_usage.js` — documented new bare forms.
- `test/unit-quick-attach.js` — 7 new sections (16 assertions): bare
  `--project` walk-up, orphan cwd error, bare `--milestone` active pick,
  no-active fallback, zero-milestone error, both-bare combo, version
  substring match.

## Verification

- `node test/unit-quick-attach.js` → 41/41 passed (was 25/25; +16 new).
- `npm test` → full suite green.

## Commit

- `efacc6e` — feat(quick): implicit attach for --project / --milestone (bare forms)

## Decisions

- No changes to `lib/name-resolve.js`. Spot-checked all current v* names
  for `--milestone <version>` ambiguity; existing substring rule is
  sufficient. Only pre-existing ambiguity is `--milestone 0.10` between
  `v0.10 Autonomy` and `v0.10.1 Collapse-aware…`, which already produces
  the friendly multi-match error — no regression.
- Skill-level `.github/skills/cp-quick/SKILL.md` not updated: that surface
  exposes `--project <path>` (a different flag, plumbed through
  `cp run quick --projectDir`). Name-based attach through `cp run quick`
  remains deferred per the v1.8 P100 SUMMARY.
