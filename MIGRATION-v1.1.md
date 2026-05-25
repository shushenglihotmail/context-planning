# Migrating to context-planning v1.1

> **New in v1.1.0** — see [CHANGELOG.md](CHANGELOG.md) for a terse bullet summary.

## What's New

v1.1.0 closes the **agent-skill gap** that v1.0 left open. v1.0 shipped a
new write-side workflow CLI surface (`cp run`, `cp workflow new`,
`cp workflow import`, …) but provided no matching in-CLI slash skills, so
agent users had to drop to a terminal mid-session to drive the new
features. v1.1 fixes that with **twelve `cp-workflow-*` agent skills**
(one for every `cp workflow` verb except `init`) and **two new CLI
subcommands** — `cp workflow export` and `cp workflow inspect`.

Key additions:

**Drive a run / discover templates:**

- **`/cp-workflow-list`** — list available templates with source and
  binding.
- **`/cp-workflow-run <workflow> [<name>] [--scope=…] [--check]`** —
  drive any workflow wave-by-wave; delegate each phase to the role
  skill from `cp doctor`. Smart-gated on test fail / audit HIGH /
  executor deviation.
- **`/cp-workflow-resume <slug>`** — re-emit the current wave's
  instruction after a session boundary or context reset.

**Author + customize templates:**

- **`/cp-workflow-new <name> [--from <built-in>] [--force]`** — author
  a new project-local template from a blank or cloned starting point.
  Interactive picker when argv is omitted.
- **`/cp-workflow-customize <built-in> [<new-name>] [--out <path>] [--force]`**
  — round-trip customize a built-in: export → edit → validate → import
  as a new project-local template.
- **`/cp-workflow-brainstorm [--workflow <name>] [--out <path>]`** —
  design a new workflow conversationally via the provider's brainstorm
  skill.

**Inspect + validate templates:**

- **`/cp-workflow-show <name>`** — pretty-print template YAML.
- **`/cp-workflow-diagram <name-or-path>`** — Mermaid flowchart of the
  phase DAG.
- **`/cp-workflow-inspect <name-or-path> [--json]`** — show YAML plus
  the **deduced wave-by-wave execution sequence**. Makes the runtime's
  internal topological grouping (which phases run in parallel) visible
  before you launch `cp run`.
- **`/cp-workflow-validate <name-or-path> [--strict]`** — schema + DAG
  validation; `--strict` fails on warnings for CI.
- **`/cp-workflow-import <path> [--name <override>] [--force]`** —
  validate + copy an external template into the project.
- **`/cp-workflow-export <name> [--out <path>] [--as <new-name>] [--force]`**
  — export a built-in to a file with the `# template:` header stripped
  and the `workflow:` key optionally renamed.

**New CLI subcommands:**

- **`cp workflow export <name> [--out <path>] [--as <new-name>] [--force]`**
  — exports a built-in template to a file. Validates before write.
  Default destination is `./<as-or-name>.yaml`. Pairs with `cp workflow
  import` for round-trip customization (or use `/cp-workflow-customize`).
- **`cp workflow inspect <name-or-path> [--json]`** — shows the
  template YAML alongside its deduced wave-by-wave execution sequence
  (the topological grouping the runtime computes internally). `--json`
  emits a structured form for tooling.

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

After `cp update` re-installs skills into your harness, twelve new
skills appear alongside the existing `cp-*` commands:

```
/cp-workflow-list                 → "what templates can I run?"
/cp-workflow-run <template>       → run one
/cp-workflow-resume <slug>        → pick up after a context reset
/cp-workflow-new <name>           → author from blank/clone
/cp-workflow-customize <built-in> → round-trip tweak a built-in
/cp-workflow-brainstorm           → design conversationally
/cp-workflow-show <name>          → pretty-print YAML
/cp-workflow-diagram <name>       → Mermaid DAG diagram
/cp-workflow-inspect <name>       → YAML + deduced wave order
/cp-workflow-validate <name>      → schema + DAG check
/cp-workflow-import <path>        → import external YAML
/cp-workflow-export <name>        → export built-in to file
```

If your harness lists slash commands, you'll see them grouped with the
other `cp-*` commands. In Copilot CLI / Claude Code: `/cp-workflow-` +
TAB autocompletes the prefix.

The only CLI verb without a slash companion is `cp workflow init` (a
one-shot bootstrap that doesn't benefit from agent orchestration).

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
cp workflow inspect dev | tail -20    # see the deduced wave order
ls .github/skills/cp-workflow-*  # twelve dirs
```
