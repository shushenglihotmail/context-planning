# Summary — v1.8 Phase 101: docs + release notes + version bump

**Commit:** `a734ed8` — `docs(release): v1.8.0 -- milestone children + project registry + quick attach-by-name`
**Tag:** `v1.8.0` (annotated, local — not pushed)

## What shipped

- `package.json` 1.7.0 → 1.8.0
- `README.md` line 629 `v1.7` → `v1.8` (only stale current-version string)
- `CHANGELOG.md` — new `## [1.8.0] - 2026-05-31` entry (Added / Changed / Fixed / Migration notes)
- `docs/MIGRATION-v1.8.md` — new, "no required action" migration guide covering registry, milestone list, quick attach, milestone children, fan-out hiding, materialize hard-fail
- `docs/workflow/recipes.md` — new Recipe 9 (milestone fan-out: planner + executor per phase) + back-pointer from Recipe 2
- `docs/architecture.md` — new "Global project registry (v1.8+)" subsection

## v1.8 phase map (referenced in commit body)

- P96 `f4b79c8` — validator hard-fails bad `materialize: roadmap-phases`
- P97 `842070b` — `milestone.yaml` child phases + review
- P98 `2eae1e4` — supervisor hides `parent:`-children from wave planning
- P99 `7746d36` — `~/.config/cp/projects.json` registry + `cp project/milestone list`
- P100 `5102800` — `cp quick-setup --project/--milestone` attach-by-name
- P101 `a734ed8` — this release

Plus pre-P96 work since v1.7: install `--global/--repo`, `--help` everywhere,
README two-paths bootstrap, full `docs/workflow/` doc set, docs workflow
per-item fan-out redesign, soft-deprecation of `cp init`.

## Verification

- `npm test` → `passed=25 failed=0`, exit 0 (no code changed; sanity sweep)
- Stale-version scan clean: remaining `v1.6` refs in docs are historical
  references to the **invocation contract** introduced in v1.6, not
  current-version claims

## Deferred to a later phase

- `cp run --param key=val` plumbing (cp-quick SKILL.md still aspirational)
- P98-02: smoke test + `cp-workflow-run.md` contract docs
- Updating cp-quick SKILL.md to use `--project <name>` (needs --param first)

## Publish (manual — user)

```
git push origin main
git push origin v1.8.0
npm publish
```
