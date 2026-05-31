---
status: ready
---

# Quick task: v1.8 release — docs + CHANGELOG + version bump + tag

## Approach

This phase closes out the **v1.8** development cycle (P96–P100) with
documentation, a release entry, and a git tag. The user will publish
to npm manually after the tag is in place.

### 1. CHANGELOG.md — new `## [1.8.0] - <today> — <theme>` entry

Theme: **Milestone workflow children + global project registry +
quick attach-by-name**.

Group changes under standard Keep-a-Changelog sections:

**Added**
- `lib/registry.js` + `~/.config/cp/projects.json` — zero-deps global
  project registry, atomic writes, auto-touched on every `cp <cmd>`
  inside a project root.
- `cp project list [--json]` / `cp project rm <name-or-path>
  [--path <p>] [--all]` — manage registry entries.
- `cp milestone list [--json]` — disk-scan view of this project's
  milestones (no registry involved).
- `cp quick-setup --project <name> --milestone <name>` — name-based
  attach. Exact (case-insens) → unique substring → friendly error
  listing candidates. `--milestone` writes `milestone: <slug>` into
  the new task's DESIGN.md YAML frontmatter as metadata only.
- `lib/name-resolve.js` — shared exact/substring resolver + error
  formatter.
- `lib/milestone-scan.js` — pure scan/parse helpers extracted from
  `bin/commands/milestone.js` for reuse.
- Built-in `milestone` workflow now ships a child phase template that
  fans out `child-plan` + `child-execute` per proposed phase, with a
  separate review pass after phase proposal (P97).

**Changed**
- Workflow runtime hides `parent:`-children from wave planning and
  the planner-facing scaffolding output, so the supervisor sees the
  fan-out parent as a single unit until materialization (P98).
- `materialize: roadmap-phases` hard-fails on malformed roadmap input
  instead of silently producing zero children (P96).

**Fixed**
- (none called out for this release; see commits.)

### 2. README.md — version-bump touch-ups

- Line ~38: "Earlier versions of cp described it as …" — leave; still
  accurate.
- Line ~42: `**v1.x**` is fine; leave.
- **Line ~629**: replace `cp is on **v1.7**.` with `cp is on
  **v1.8**.` — the "always missed" line the user flagged.
- Sweep for any other literal `v1.7` strings in README that refer to
  the current version (not historical features) and update.

### 3. docs/workflow/*.md — workflow-doc sweep

Touch-up scope, not a full rewrite:

- `docs/workflow/recipes.md` — add a short recipe demonstrating the
  built-in `milestone` workflow's fan-out child phases (planner +
  executor per proposed phase) with a pointer to the template.
- `docs/workflow/reference.md` — if it lists `materialize:` modes,
  confirm `roadmap-phases` is documented with the new hard-fail
  behavior; add a one-line note if missing.
- `docs/workflow/quickstart.md` / `docs/workflow/README.md` — version
  scan; replace any literal v1.7 references with v1.8 where they
  describe current behavior.

### 4. docs/MIGRATION-v1.8.md — new short migration note

One page, ~30–60 lines. Sections:
- **From v1.7** — registry auto-populates silently; existing
  installs need no action. Re-run `cp init` to record the project in
  the registry immediately (optional).
- **New flags** — show one-liners for `cp project list`, `cp
  milestone list`, `cp quick-setup --project/--milestone`.
- **Milestone workflow** — supervisor agent now sees a single
  `propose-phases` parent; child phases are materialized and run
  with planner + executor roles. No user action needed beyond
  re-reading the new structure.
- **Deferred** — `cp run --param key=val` does not exist yet; the
  cp-quick skill's reference to `--param design_skill=…` is still
  aspirational.

### 5. package.json — version bump

`"version": "1.7.0"` → `"version": "1.8.0"`.

### 6. Architecture doc — light touch

`docs/architecture.md` — add 1–2 lines under whatever "global state"
or "configuration" section discusses on-disk layout, noting
`~/.config/cp/projects.json` as the new global registry file. If no
relevant section exists, skip.

### 7. Git tag

After commit:

```
git tag -a v1.8.0 -m "v1.8.0 — milestone workflow children + project registry + quick attach-by-name"
git push origin v1.8.0   # only if user wants; mention in summary
```

### 8. Commits

Two atomic commits, this phase:

1. **`docs(release): v1.8.0 — milestone children + project registry
   + quick attach-by-name`** — CHANGELOG entry, README v-string
   update, workflow doc touch-ups, MIGRATION-v1.8.md, package.json
   bump.
2. (Planning bookkeeping commit happens at phase-finalize time as
   usual.)

Tag created locally; not pushed by the agent (user publishes).

## Out of scope

- Actual `npm publish` (user does this manually after the tag).
- Updating the cp-quick skill to use `--project <name>` for the
  `cp run quick` supervised path — that needs `cp run --param`
  plumbing in a future phase.
- P98-02 (smoke test + `cp-workflow-run.md` contract doc) — still
  deferred.
- Any code changes beyond the version-string bump.

## Done-When

- [ ] `CHANGELOG.md` has a new `## [1.8.0] - YYYY-MM-DD — …` entry
      covering P96/P97/P98/P99/P100 grouped by Added/Changed/Fixed.
- [ ] `README.md` line ~629 reads `cp is on **v1.8**.` and any other
      literal current-version strings updated.
- [ ] `docs/workflow/recipes.md` has a short milestone-children
      recipe; other workflow docs scanned for stale v-strings.
- [ ] `docs/MIGRATION-v1.8.md` exists and lists the new flags +
      registry + milestone-children migration story.
- [ ] `package.json` version = `1.8.0`.
- [ ] One commit covering all of the above with a clear
      `docs(release): v1.8.0 — …` message and Co-authored-by trailer.
- [ ] Git tag `v1.8.0` created (annotated, with release notes
      summary in the message body). NOT pushed by agent.
- [ ] `npm test` still green after changes (no code regressions
      expected, but verify).
- [ ] Phase mark-complete + planning bookkeeping (ROADMAP P101 ☑,
      STATE banner → "v1.8 released; awaiting next milestone").
