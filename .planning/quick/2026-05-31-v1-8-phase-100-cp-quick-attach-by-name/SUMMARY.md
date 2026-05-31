# SUMMARY — v1.8 Phase 100: cp quick attach by name

**Sha:** `5102800`

## What shipped

`cp quick-setup` learned two new optional flags:

- `--project <name>` — resolves a project from the global registry
  (`~/.config/cp/projects.json`) and scaffolds the quick task under
  that project instead of the current working directory.
- `--milestone <name>` — resolves a milestone in the chosen project
  (or cwd project) and writes `milestone: <slug>` into the DESIGN.md
  YAML frontmatter as a pure metadata tag. No directory nesting under
  the milestone tree.

Name resolution rules for both flags:
1. Exact match (case-insensitive)
2. Otherwise: unique substring match (case-insensitive)
3. Otherwise: exit 1 with a friendly multi-line error that lists
   candidates (or says "no projects registered" / "no milestones
   defined" when the underlying set is empty).

Both flags are optional, never auto-default, and omitting both
preserves byte-identical legacy DESIGN.md output.

## Why

User asked for a name-based way to attach a free-form quick task to a
project or milestone without having to remember/type a path. `cp
quick --project-path <abs>` already existed but is awkward; project
**name** is friendlier and aligns with the new global registry from
P99.

## Files

**New:**
- `lib/name-resolve.js` — zero-deps generic exact-then-substring
  resolver + friendly error formatter.
- `lib/milestone-scan.js` — pure `scan/_parseName/_activeSlug`
  extracted from `bin/commands/milestone.js` so quick-setup can
  reuse them without dragging in the CLI shim.
- `test/unit-name-resolve.js` — 30 assertions across 15 sections.
- `test/unit-quick-attach.js` — 25 assertions, end-to-end spawn of
  `node bin/cp.js quick-setup` against fixture project trees.

**Modified:**
- `bin/commands/quick-setup.js` — parses + resolves the two flags,
  exits 1 with friendly error on miss/ambiguity.
- `lib/quick-helpers.js` — `setup()` accepts an optional
  `milestoneSlug`; prepends YAML frontmatter only when truthy.
- `bin/commands/milestone.js` — now a thin shim that re-exports
  `scan/_parseName` from `lib/milestone-scan.js`. CLI behavior is
  unchanged.
- `bin/commands/_usage.js` — adds a `cp quick-setup` entry.
- `package.json` — wires the two new test files into `npm test`.

## Out of scope (deferred)

Wiring `--project`/`--milestone` through the **supervised** `cp run
quick` flow requires adding `--param key=val` plumbing in
`bin/commands/run.js`, `runtime.startRun`, and template
substitution — which does not exist yet. P100 ships the direct
`cp quick-setup` flags only. The follow-up phase that adds
`--param` plumbing will also teach the cp-quick skill to use names.

## Tests

`npm test` green end-to-end (exit 0).  New tests: 55/55 passing on
first run.
