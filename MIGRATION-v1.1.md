# Migrating to context-planning v1.1

> **New in v1.1.0** — see [CHANGELOG.md](CHANGELOG.md) for a terse bullet summary.

## What's New

v1.1.0 closes the **agent-skill gap** that v1.0 left open. v1.0 shipped a
new write-side workflow CLI surface (`cp run`, `cp workflow new`,
`cp workflow import`, …) but provided no matching in-CLI slash skills, so
agent users had to drop to a terminal mid-session to drive the new
features. v1.1 fixes that with **five new `cp-workflow-*` agent skills**
and **one new CLI subcommand** (`cp workflow export`) that pairs with
`cp workflow import` for round-trip template customization.

Key additions:

- **`/cp-workflow-run <workflow> [<name>] [--scope=…] [--check]`** — drive
  any built-in or custom workflow wave-by-wave from inside the agent;
  delegates each phase to the role skill resolved by `cp doctor`.
  Smart-gated on test failure / audit HIGH / executor deviation.
- **`/cp-workflow-list`** — list available templates with source and
  binding; shows what `/cp-workflow-run` accepts.
- **`/cp-workflow-resume <slug>`** — re-emit the current wave's
  instruction after a session boundary or context reset.
- **`/cp-workflow-new <name> [--from <built-in>] [--force]`** — author a
  new project-local workflow template from a blank or cloned starting
  point. Interactive picker when argv is omitted.
- **`/cp-workflow-customize <built-in> [<new-name>] [--out <path>] [--force]`**
  — round-trip customize a built-in template: export → edit → validate
  → import as a new project-local template.
- **`cp workflow export <name> [--out <path>] [--as <new-name>] [--force]`**
  — new CLI subcommand. Exports a built-in template to a file with the
  `# template:` header stripped and the `workflow:` key optionally
  renamed. Validates before write. Default destination is `./<as-or-name>.yaml`.

---

## Do I Need to Migrate?

**No.** v1.1 is purely additive:

- All v1.0 commands and APIs continue to work unchanged.
- All pre-v1.0 commands (the classic milestone/phase model) continue to
  work unchanged.
- No existing behavior was modified.
- No state-file shapes changed.

Run `cp update` in your project to pick up the new skill files and any
config defaults — that's the full migration:

```bash
cd <your-project>
npx -y --package=context-planning@latest -- cp update
```

---

## How to Discover the New Skills

After `cp update` re-installs skills into your harness, the five new
skills appear alongside the existing `cp-*` commands:

```
/cp-workflow-list                 → "what templates can I run?"
/cp-workflow-run <template>       → run one
/cp-workflow-resume <slug>        → pick up after a context reset
/cp-workflow-new <name>           → author from blank/clone
/cp-workflow-customize <built-in> → round-trip tweak a built-in
```

If your harness lists slash commands, you'll see them grouped with the
other `cp-*` commands. In Copilot CLI / Claude Code: `/cp-workflow-` +
TAB autocompletes the prefix.

---

## What's Deferred (Not Shipped in v1.1)

Two skills were considered for shim refactors but **deferred to v1.2**:

- **`cp-quick`** and **`cp-autonomous`** retain their v1.0 behavior. A
  design review during v1.1 phase 44 showed that turning them into shims
  over `/cp-workflow-run` would either break back-compat (different state
  layouts: `.planning/quick/<dir>/` vs `.planning/runs/<slug>/`;
  milestone-phase machine vs workflow-wave machine) or require near
  duplication of their logic. v1.2 will revisit the unification with a
  state-layout migration plan.

If you use `/cp-quick` or `/cp-autonomous` today, nothing changes.

---

## Worked Example: Customize the `quick` Built-in

Suppose you want a `quick-strict` variant of the `quick` template with a
mandatory typecheck step. With v1.0 this required three terminal
commands (`cp workflow show > foo.yaml`, hand-edit, `cp workflow import`)
that left several UX paper-cuts (header strip, name rewrite, default path).
v1.1 collapses it into one slash skill:

```
/cp-workflow-customize quick quick-strict
```

The skill walks you through export → edit → validate → import. Behind the
scenes it uses the new `cp workflow export --as` flag to rewrite the
`workflow:` key in a single pass, leaves comments and indentation
intact (no YAML reserialization), and validates before any write.

---

## Compatibility

- **Node.js**: ≥ 18 (unchanged).
- **Harnesses**: Copilot CLI, Claude Code, Cursor, Aider — all unchanged.
- **Providers**: Superpowers (default) or `manual` fallback — unchanged.
- **Project state**: nothing in `.planning/` is rewritten on upgrade.

---

## Upgrade Steps

```bash
# Update the package
npm install -g context-planning@1.1.0

# Refresh per-repo state in each project
cd <your-project>
cp update
```

That's it. The new skills appear in your harness; `cp workflow export`
becomes available on the CLI.

To verify:

```bash
cp version              # → 1.1.0
cp workflow export --help 2>&1 | head -5
ls .github/skills/cp-workflow-*  # five files (run/list/resume/new/customize)
```
