# Migration guide: v1.3 → v1.4

**TL;DR**: v1.4 is **backwards-compatible for end users** — your
existing workflow YAMLs, slash commands, and project state all keep
working. The big change is internal: the three workhorse slash
commands (`/cp-quick`, `/cp-new-milestone`, `/cp-complete-milestone`)
have been rewritten as **thin wrappers around workflow YAMLs**.

If you only consume cp through the slash commands, you can stop
reading. Just `npm install -g context-planning@1.4` and continue.

The rest of this guide is for:

- **Workflow authors** who want to use the new `supervised:` flag.
- **Anyone customizing the built-in `quick` / `milestone` /
  `complete-milestone` workflows** — their phase shapes changed.
- **Power users** who script against `cp` and want to use the new
  verbs (`cp abandon`, `cp list`, `cp status <run-id>`).

---

## What's new in v1.4

### 1. Supervised workflows (Option A: harness = supervisor)

A workflow YAML may now declare:

```yaml
workflow: my-thing
supervised: true
phases:
  - id: setup
    ...
```

When `supervised: true`, the **harness LLM session itself drives every
phase**. There is no daemon, no separately spawned supervisor LLM,
and no embedded model in the cp engine — the agent reading this
README is the supervisor. `cp run` simply emits the next wave's
instruction; the harness executes it, calls `cp run mark-complete`,
and loops.

When `supervised: false` (or absent), the workflow is "deterministic"
— each phase is a single `cp` CLI invocation and there is no LLM
loop. The new `complete-milestone` workflow uses this mode.

The supervised/unsupervised distinction is **per-workflow**, not
project-wide. You can mix and match.

### 2. New built-in workflows

`cp workflow ls` now includes three workhorse templates:

| Template | Phases | Supervised | Replaces |
|---|---|---|---|
| `quick` | setup → design → execute → finalize | yes | the inline `/cp-quick` logic |
| `milestone` | setup → brainstorm → propose-project-updates → apply-project-updates → propose-phases → finalize | yes | the inline `/cp-new-milestone` logic |
| `complete-milestone` | verify → complete | no | the inline `/cp-complete-milestone` logic |

If you **customized** any of these by exporting and editing them
(via `cp workflow export quick` etc. in v1.3), your custom copy still
works — cp prefers project-local templates over built-ins. **But**
the built-in shapes have changed, so if you want to pick up v1.4
improvements you should re-export the new built-in and re-apply your
changes. See "Re-customizing built-ins" below.

### 3. New CLI verbs

| Verb | Purpose |
|---|---|
| `cp abandon <slug> [--yes] [--reason <text>]` | Soft-abandon a workflow run (state only; never reverts code) |
| `cp list [--workflow <name>] [--status <status>] [--json]` | List runs under `.planning/runs/` |
| `cp status <run-id> [--json]` | With a positional id, prints that run's state (bare `cp status` is unchanged) |

Plus four **internal** verbs that the new workflow phases call —
you typically won't invoke them yourself, but they're documented for
completeness in the [README](README.md#node-cli-operational-tooling--not-used-inside-the-ai-loop):

- `cp quick-setup`, `cp quick-finalize`
- `cp milestone-setup`, `cp milestone-finalize`

### 4. Slash wrappers are now thin

In v1.3, `/cp-quick` was ~200 lines of inline orchestration. In v1.4
the same file is ~30 lines:

```text
1. Sanitize $ARGUMENTS.
2. Invoke `cp run quick "$ARGUMENTS"`.
3. Follow the per-phase instructions cp emits.
4. Stop on errors.
```

Same for `/cp-new-milestone` and `/cp-complete-milestone`. If you
forked any of these (e.g. into a project-local `commands/cp/quick.md`
override) your fork still loads, but it likely contains stale v1.3
orchestration logic — consider trimming it down or deleting it so
the v1.4 built-in takes over.

---

## Breaking changes

### `quick` workflow phase ids changed

If you reference the built-in `quick` workflow's phase ids from
scripts or sub-workflows, they changed:

| v1.3 | v1.4 |
|---|---|
| `discuss` | `setup` |
| `execute` | (unchanged: `execute`, but now preceded by `design`) |
| `verify` | `finalize` |

A v1.3 invocation like:

```bash
echo "..." | cp run mark-complete <slug> discuss
```

becomes:

```bash
echo "..." | cp run mark-complete <slug> setup
```

If you have a custom workflow that *extends* the quick template via
include/template references, update the phase ids accordingly.

### Workflow YAML: `after:` vs `depends_on:` for wave computation

This is a clarification, not a strictly new rule, but worth calling
out because v1.4 hit it:

- `after:` is a **hint** used for parent/child grouping inside a
  phase wrapper.
- `depends_on:` is what the engine reads to **compute waves**.

If you want two top-level phases A and B to run sequentially (B
after A in its own wave), use `depends_on: [A]` on B. Using only
`after: [A]` will leave them in the same wave.

The built-in `quick.yaml` and `milestone.yaml` were updated to use
`depends_on:` accordingly. If your custom workflows depended on
`after:` for sequencing and the resulting wave layout was actually
wrong (you just hadn't noticed), v1.4 doesn't change that behavior —
but the new built-ins demonstrate the correct pattern.

---

## Re-customizing built-ins

If you have a project-local copy of `quick` / `milestone` /
`complete-milestone` from v1.3:

```bash
# 1. Stash your custom version
mv .planning/workflows/quick.yaml .planning/workflows/quick.v1.3.yaml.bak

# 2. Export the v1.4 built-in
cp workflow export quick --out .planning/workflows/quick.yaml

# 3. Diff and re-apply your customizations
git diff .planning/workflows/quick.v1.3.yaml.bak .planning/workflows/quick.yaml
```

The new built-ins are deliberately small (~50 lines each) so the
re-merge should be quick.

---

## Upgrade checklist

- [ ] `npm install -g context-planning@1.4`
- [ ] Run `cp doctor` — no warnings about missing skills.
- [ ] Run `cp workflow ls` — `quick`, `milestone`, `complete-milestone`
      appear under "built-in".
- [ ] If you customized any of those three, follow
      "Re-customizing built-ins".
- [ ] If you script against the v1.3 `quick` workflow's phase ids,
      update `discuss` → `setup` and `verify` → `finalize`.
- [ ] Re-run `cp init` once in each project to refresh the slash
      command wrappers in `.github/skills/cp-*/`.

That's it. Welcome to v1.4.
