# Migration to v1.8

**Theme:** Milestone workflow children + project registry + quick
attach-by-name.

v1.8 is **additive**. No template format changes, no breaking CLI
changes. You can upgrade in place and nothing existing will fail.

This note covers what's new, what you may want to adopt, and one
deferred item.

## Upgrade

```
npm install -g context-planning@1.8.0
# or, in this repo:
git pull
npm install
```

No `cp update` is required, but running it inside each existing
project will refresh skill files and config defaults to pick up the
new `cp project list` / `cp milestone list` / `cp quick-setup`
entries in help output.

## New: global project registry

cp now maintains `~/.config/cp/projects.json` — a small JSON file
tracking every project root (`.planning/PROJECT.md`-bearing
directory) you've run a `cp` command in. The registry is updated
silently on every `cp <cmd>` invocation; there is no opt-in step.

**Why:** so commands like `cp project list` and `cp quick-setup
--project <name>` can find projects by name without you having to
remember and type paths.

**To populate immediately:** just run `cp project list` (or any
other `cp` command) once inside each project root. The touch hook
fires regardless.

**To inspect:**
```
cp project list
cp project list --json
```

**To remove an entry** (e.g., after deleting or renaming a worktree):
```
cp project rm <name>                # by name
cp project rm <name> --path <path>  # disambiguate if name not unique
cp project rm <name> --all          # remove all entries with this name
```

The registry is a convenience cache, not a source of truth — `cp`
will always work in any project even if the registry is missing or
out of date. Worst case, `cp project list` shows a stale entry until
you `cp project rm` it.

## New: `cp milestone list`

A disk-scan view of this project's `.planning/milestones/` —
shows active, inactive, and archived milestones with their slugs
and titles. No registry involved.

```
cp milestone list
cp milestone list --json
```

## New: quick attach by name

`cp quick-setup` learned two new optional flags:

```
cp quick-setup --task "fix flaky test" --project context-planning
cp quick-setup --task "redesign config" --project cp --milestone "v1.9 ideas"
```

Resolution rules for both flags:
1. Exact match (case-insensitive).
2. Otherwise, unique substring match (case-insensitive).
3. Otherwise, exit 1 with a multi-line error listing candidates.

`--project <name>` scaffolds the quick task under the resolved
project's `.planning/quick/` directory instead of the current
working directory.

`--milestone <name>` writes `milestone: <slug>` into the new task's
`DESIGN.md` YAML frontmatter as metadata only. **It does not nest
the task under the milestone tree**, and it does not enable any
automatic milestone bookkeeping — the frontmatter is purely a label
you can read later or grep for.

Both flags are optional and never auto-default. Omitting both
produces byte-identical output to v1.7.

## Changed: built-in `milestone` workflow drives phases to execution

In v1.7, the built-in `milestone` workflow proposed a roadmap and
then stopped, leaving you to drive each proposed phase by hand.

In v1.8, the `propose-phases` parent's children are a
planner/implementer pair (`child-plan` → `child-execute`)
materialized via `materialize: roadmap-phases`. The supervisor
agent will now route each proposed phase through plan + execute
automatically, with a milestone-level review pass before the
children are materialized.

**Migration impact:** none, if you weren't customizing the
workflow. If you had a local copy of `milestone.yaml`, diff it
against `templates/workflows/milestone.yaml` and adopt the new
child phases.

## Changed: fan-out children are hidden until materialization

If you were confused by the supervisor-facing wave block listing
phantom child phases before their parent had been completed, v1.8
hides them. They're materialized and printed once their parent's
`mark-complete` has been processed, exactly when they're runnable.

## Changed: `materialize: roadmap-phases` hard-fails on bad input

Previously, a malformed or empty roadmap could silently produce zero
children and let the run drift. Now it errors loudly at
materialization time with a message pointing at the offending input.

## Other improvements

- `cp install --global` for per-user (vs. per-repo) harness wiring.
- `cp install --repo <path>` to target a repo from any cwd.
- `--help`/`-h` handlers on seven previously-unhelpful commands.
- README rewrite leading with two-paths bootstrap (`/cp-new-project`
  greenfield vs. `/cp-map-codebase` + `/cp-new-project` brownfield).
  `cp init` is soft-deprecated as a public command.
- New `docs/workflow/` documentation set: landing page, quickstart,
  field-semantics reference, and eight worked recipes.

## Deferred

- **`cp run --param key=val` plumbing** is still not wired. The
  cp-quick skill's reference to `--param design_skill=…` remains
  aspirational. v1.8's quick attach-by-name flags ride on `cp
  quick-setup` directly, not on the supervised `cp run quick`
  path. Tracked for a follow-up.
- End-to-end smoke test + `cp-workflow-run.md` contract doc
  (originally P98-02) remain deferred.

---

That's it. No required changes; everything else is yours to adopt at
your own pace.
