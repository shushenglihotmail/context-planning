# Quick task: allow quick task bind to a project

status: ready

## Task

Let users bind a `/cp-quick` invocation to a specific project
directory by passing `--project <path>` in the slash-command
arguments. Useful in multi-project repos and when running quick
tasks from outside the project tree.

## Background

The underlying runtime ALREADY supports per-project binding:
`cp run quick "..." --projectDir <path>` correctly lands state at
`<path>/.planning/quick/<date>-<slug>/`. Verified via a probe
against `C:\Users\sli\AppData\Local\Temp\cp-bind-test`.

The gap is purely at the slash-command layer. Today
`.github/skills/cp-quick/SKILL.md` step 2 invokes:

    cp run quick "$ARGUMENTS"

If the user types `/cp-quick allow X --project /foo`, the entire
string `"allow X --project /foo"` becomes the task name — the
`--project` flag is NOT extracted, NOT forwarded, and the run lands
in cwd (wrong project).

## Approach

Update `.github/skills/cp-quick/SKILL.md` only. No code changes.

1. **Step 1 (Sanitize)** — add an instruction to extract
   `--project <path>` (and `--projectDir <path>` as an equivalent
   alias) from `$ARGUMENTS`, capture the value, and strip the
   flag (and its value) from the task text.

2. **Step 2 (Delegate)** — when a project path was extracted,
   invoke:

       cp run quick "$SANITIZED_ARGUMENTS" --projectDir "$PROJECT_PATH"

   otherwise the existing `cp run quick "$ARGUMENTS"` form.

3. **Notes section** — add a bullet explaining `--project <path>`:
   what it does, when to use it (multi-project repo, off-tree cwd),
   and that the path must be the absolute or relative path to the
   project's root directory (the dir that contains, or will contain,
   `.planning/`).

That's the entire change. No edits to `bin/commands/*.js`,
`lib/quick-helpers.js`, `lib/runtime.js`, or `templates/workflows/quick.yaml`.

## Done-When

- [ ] `.github/skills/cp-quick/SKILL.md` step 1 documents
      extracting `--project <path>` / `--projectDir <path>` from
      `$ARGUMENTS`.
- [ ] Step 2 documents the conditional `--projectDir` forwarding form.
- [ ] Notes section explains the flag, when to use it, and path
      semantics.
- [ ] Example in Notes: `/cp-quick fix login bug --project ./services/auth`.
- [ ] Existing `npm test` still green (no code changed, so this is a
      regression sanity check).
- [ ] Atomic commit: `docs(skills): document --project flag in /cp-quick`.

## Out of scope

- Adding `--project` to `cp run`, `cp quick-setup`, `cp quick-finalize`
  CLIs (the underlying `cp run --projectDir` already works for the
  slash-command path; standalone CLI ergonomics deferred).
- Renaming `--projectDir` → `--project` at the `cp run` layer.
- Implicit project detection from changed files (user deferred earlier).
- Writing a `Project:` audit line into the scaffolded DESIGN.md.
- Tests for the skill (it's documentation interpreted by an LLM, not code).
- Updating any other `/cp-*` skills to support `--project`.

## Notes on chosen trade-offs

- **Skill-only change.** The runtime already does the heavy lifting.
  No need to touch code, tests, or other docs.
- **Reuse `--projectDir`, don't add `--project` to `cp run`.** The
  skill accepts the friendlier `--project` spelling from users but
  forwards as the existing `--projectDir` flag. This avoids any CLI
  churn — `cp run` users keep typing what they always typed; only
  the skill grew a new affordance.
- **Strip the flag from task text.** Otherwise the task name printed
  in DESIGN.md, the slug derivation, and any echoed user message
  would all contain `--project /foo`, which is ugly and confusing.
