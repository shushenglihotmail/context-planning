# v1.8 Phase 100 — cp quick --project / --milestone attach-by-name

Status: ready

## Goal

Let `cp quick` target a specific project and (optionally) tag the quick task
with a milestone, both by **name** instead of by filesystem path. Names map to
disk locations via the registry from P99 and the milestone scanner from P99.

## Approach

### 1. New flags on `cp quick`

```
cp quick [--task "<text>"] [--slug <slug>] [--json]
         [--project <name>] [--milestone <name>]
```

- `--project <name>`: resolve `<name>` to a project root via `lib/registry.js`,
  then scaffold the quick task **there** instead of cwd. Pass the resolved path
  down to `quick.setup({ projectDir })`. If omitted, current behavior
  (`repoRoot()`) is preserved.
- `--milestone <name>`: resolve `<name>` to a milestone in the chosen project,
  capture its **slug**, and write `milestone: <slug>` into DESIGN.md
  frontmatter. If omitted, no frontmatter and no milestone metadata.

### 2. Name resolution (shared rule — both flags)

Implemented in a single helper `lib/name-resolve.js`:

```
resolveByName(candidates, query) -> { ok, match?, candidates? }
  candidates: [{ name, ...rest }, ...]
  query:      user-typed string
```

Resolution order:

1. **Exact case-insensitive name match** → unique → done.
2. **Case-insensitive substring match** → if exactly one candidate → done.
3. Otherwise → `{ ok: false, candidates: [...] }` with the candidate list for
   a friendly error.

A friendly error printer at the call site emits:

```
cp quick: no project named "foo"
  Available projects:
    - context-planning
    - my-other-project
```

or for ambiguity:

```
cp quick: 3 projects match "co". Be more specific:
    - context-planning
    - cookbook
    - codecraft
```

### 3. Resolution data sources

- Projects: `registry.list()` from `lib/registry.js` (already exists from P99).
  Each entry: `{ name, path, last_seen_at }`.
- Milestones: `bin/commands/milestone.js#_scan(repoRoot)` from P99. Each entry:
  `{ slug, name, status, ... }`. Refactor: move `_scan` and `_parseName` into
  `lib/milestone-scan.js` so it can be required from `quick-setup` without
  introducing a CLI ↔ CLI dependency. Re-export from
  `bin/commands/milestone.js` to preserve existing tests.

### 4. DESIGN.md frontmatter

Only when `--milestone` is provided, prepend:

```
---
milestone: <slug>
---

# Quick task: ...
```

(no frontmatter at all when `--milestone` is omitted, preserving current
output byte-for-byte for existing users)

### 5. Wiring

- `bin/commands/quick-setup.js`: parse `--project` and `--milestone`; resolve
  them; pass `projectDir` and `milestoneSlug` into `quick.setup()`.
- `lib/quick-helpers.js#setup()`: accept new optional `milestoneSlug` field;
  when truthy, emit YAML frontmatter at the top of DESIGN.md.
- `lib/registry.js`: no changes — already exports `list()`.
- `bin/commands/milestone.js`: extract `_scan` + `_parseName` to
  `lib/milestone-scan.js` (re-export to keep CLI surface stable).
- `lib/name-resolve.js`: new file, ~30 LOC, zero deps.
- `bin/commands/_usage.js`: document new flags under `cp quick`.

### 6. Tests

- `test/unit-name-resolve.js`: exact, substring, ambiguity, no-match cases.
- `test/unit-milestone-scan.js`: lift the existing inline test for `_scan` out
  of `unit-milestone.js` to confirm the refactor preserves behavior.
- `test/unit-quick-attach.js`: integration — scaffold with `--project <name>`
  and `--milestone <name>` against a fixture .planning tree under a tempdir;
  verify the quick dir lands in the right place and DESIGN.md frontmatter is
  correct.
- `npm test` clean.

### 7. Out of scope

- **Wiring through `cp run quick` / `/cp-quick` skill**: `cp run` has no
  `--param` plumbing today (the `cp-quick` skill references it but it's
  unimplemented). Adding `--param key=val` parsing + runtime template-substitution
  for overrides is a separate, larger change. Deferred to a follow-up phase.
  This phase ships the **direct `cp quick-setup`** flags only; users who want
  the named flags from the supervised flow can either invoke `cp quick-setup`
  directly or wait for the follow-up.
- Adding `--project`/`--milestone` to `cp run` (out of scope here).
- Auto-attach defaults (Q3 picked option A: both optional, no auto-default).
- Nesting quick task dirs under milestone dirs (Q1 picked option A: flat).
- Updating milestone ROADMAP with quick-task entries (not requested).
- Deprecating any existing flags (`cp quick-setup` had no path flag to deprecate).

## Done-When

- [ ] `cp quick --task "fix bug" --project context-planning` scaffolds the
      quick task at the resolved registry path for `context-planning`
      (verified by reading the printed `dir:` line).
- [ ] `cp quick --task "fix bug" --milestone "Quick Attach"` scaffolds with
      DESIGN.md frontmatter `milestone: milestone-workflow-end-to-end-quick-attach`
      (substring match resolved to unique slug).
- [ ] Unknown name → exit 1 with friendly "no X named" + candidate list.
- [ ] Ambiguous name → exit 1 with "N X match" + candidate list.
- [ ] No flags → identical behavior + byte-identical DESIGN.md as before
      (regression-tested).
- [ ] Resolution is name-only: slug is never accepted as input (typing a
      slug that doesn't match any name fails with "no X named").
- [ ] `npm test` green; new files: `lib/name-resolve.js`,
      `lib/milestone-scan.js`, `test/unit-name-resolve.js`,
      `test/unit-quick-attach.js` (and a small `test/unit-milestone-scan.js`
      pulled out of `unit-milestone.js`).
- [ ] `bin/commands/_usage.js` documents both new flags.
- [ ] One atomic commit; SUMMARY.md written.

## Open questions

(none — all answered in Q1-Q4 of design discussion)
