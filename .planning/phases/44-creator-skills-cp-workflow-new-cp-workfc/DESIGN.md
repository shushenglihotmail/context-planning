---
phase: "44"
milestone: v1.1 Workflow Skills
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [user, agent]
supersedes: []
superseded_by: null
---

# Design: Phase 44 — Creator skills + workflow export round-trip

## Status

Accepted on 2026-05-25 (re-planned mid-phase after user surfaced the export-pairs-with-import design gap during plan 43-04 close-out).

## Context

v1.0 shipped:
- `cp workflow import <path>` — accepts an external YAML, validates, copies to `.planning/workflows/`
- `cp workflow show <name>` — dumps any template's YAML to stdout (built-in or project)
- `cp workflow new <name> [--from <built-in>]` — scaffolds a new YAML file

The combination *almost* gives you a round-trip workflow customization story:

```
cp workflow show dev > mydev.yaml      # export
# edit
cp workflow import mydev.yaml          # re-register
```

But three UX gaps make this a hand-tooling task users won't discover or trust:

1. `show` prepends a `# template: <name> (source: <abspath>)` comment header that must be stripped before re-import.
2. The exported YAML still has `workflow: dev` baked in. Re-importing without renaming collides with the built-in's name; users must hand-edit a top-level key in the YAML.
3. No sensible default destination path — users save it somewhere random, then `import` can't find it again ergonomically.

Separately, v1.1 phase 43 shipped consumer-side `cp-workflow-*` skills that wrap `cp run` / `cp workflow ls` / `cp workflow show`. The user critique that drove the v1.1 milestone applies equally to the *creator* side: there is no in-CLI agent surface for `cp workflow new` / `cp workflow import`, even though they're the only write-side ops that let users author or customize workflows.

So phase 44 needs to close both gaps in one coherent unit: add the missing CLI primitive (`export`) and the two missing creator skills (`new`, `customize`).

## Decision

Add `cp workflow export <name> [--out <path>] [--as <new-name>] [--force]` to `bin/commands/workflow.js`, then ship two creator-side agent skills:

- **`cp-workflow-new`** — drives `cp workflow new` for the "blank template" path.
- **`cp-workflow-customize`** — drives the export → edit → import round-trip in one skill (replaces the originally-planned `cp-workflow-import` skill name).

The skill name `customize` was chosen over `import` because the user-facing task is "customize a built-in" — pure `import` would have been a thin LLM-less wrapper.

## Consequences

### Positive
- One-shot UX for the most common write-side workflow op (customize a built-in).
- `cp workflow export` is reusable outside the skill (CLI users, scripts, CI).
- `--as <new-name>` rewrites the embedded `workflow:` key, which is the round-trip enabler — without this, every user would need to hand-edit YAML on every customization.
- Validated output: export pipes through the same `validate` path as import, so we never export a broken template.

### Negative
- One more subcommand on `cp workflow`'s surface area (now 8 verbs: ls/show/validate/diagram/init/new/import/export + brainstorm).
- Skill rename from `cp-workflow-import` to `cp-workflow-customize` happened mid-milestone. Acceptable because phase 44 hasn't started; only the milestone DESIGN.md and ROADMAP need touch-up.

### Neutral
- `cp workflow show` stays as-is. It's the lower-level primitive that `export` calls under the hood.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ User in agent CLI                                          │
│   /cp-workflow-customize dev                               │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│ commands/cp/workflow-customize.md (skill 44-03)            │
│   Step 1: pick built-in (or arg)                           │
│   Step 2: pick new name (or arg)                           │
│   Step 3: cp workflow export <pick> --as <new> --out <path>│
│   Step 4: open file for edit, await user signal            │
│   Step 5: cp workflow validate <new> --strict              │
│   Step 6: cp workflow import <path>                        │
│   Step 7: cp workflow ls + report                          │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│ bin/commands/workflow.js  (plan 44-01)                     │
│   case 'export':                                           │
│     read template (built-in or project)                    │
│     strip "# template: ..." comment header                 │
│     if --as: rewrite top-level "workflow: ..." key         │
│     resolve out path (default = ./<as|name>.yaml)          │
│     refuse overwrite without --force                       │
│     validate result before writing                         │
│     write file                                             │
└────────────────────────────────────────────────────────────┘
```

Parallel, simpler flow for blank-template authoring:

```
/cp-workflow-new my-fancy
   │
   ▼
commands/cp/workflow-new.md (skill 44-02)
   Step 1: validate name not in use
   Step 2: cp workflow new my-fancy [--from <built-in>]
   Step 3: report path, await user edit
   Step 4: cp workflow validate my-fancy --strict
   Step 5: ls + report
```

## Components

### Plan 44-01 — `cp workflow export` CLI command

**Files touched:**
- `bin/commands/workflow.js` — new `case 'export':` in the subcommand switch + help text update
- `lib/workflows.js` (maybe) — refactor `show` to expose a `getTemplateYaml(name, { stripHeader, rewriteName })` helper that both `show` and `export` call, OR add a fresh helper. Choose whichever keeps `show`'s output identical (back-compat critical — `cp run quick > foo.yaml` works today).
- `test/unit-workflow.js` — unit tests on the helper
- `test/dryrun-workflow-cli.js` — CLI surface tests

**CLI signature:**
```
cp workflow export <name> [--out <path>] [--as <new-name>] [--force]
```

**Behaviour matrix:**
| Args | Effect |
|------|--------|
| `export dev` | Write `./dev.yaml` (built-in dev's YAML, no header). Refuse if file exists. |
| `export dev --force` | Same, overwrite allowed. |
| `export dev --out /tmp/x.yaml` | Write to that path. |
| `export dev --as my-dev` | Write `./my-dev.yaml`; embedded `workflow:` key reads `my-dev`. |
| `export dev --as my-dev --out tmp.yaml` | Write `tmp.yaml`; embedded `workflow:` key = `my-dev`. |
| `export <unknown>` | Exit 1 with "template not found". |
| `export dev --as dev` | Allowed (no-op rename). |
| `export dev --as ""` | Exit 1 with usage error. |

**`--as` rename strategy:** Use a regex on the top-level YAML doc, not a YAML round-trip. Reason: `cp workflow show` already emits the canonical-formatted YAML; reserialising would change formatting and break diff-friendliness across export-edit cycles. The regex is precise: `^workflow:\s+\S+\s*$` on a per-line basis, applied to the first match only. Test must include a fixture with `workflow:` appearing in a string value to confirm we don't rewrite that.

**Validation:** After producing the output text but before writing, run it through `lib/workflows.js#validateTemplate` (or equivalent). On failure, exit non-zero without writing the file. This means a `--force` overwrite of a good file with a broken export is prevented.

### Plan 44-02 — `cp-workflow-new` skill

**File:** `commands/cp/workflow-new.md`

**Frontmatter:**
```yaml
---
name: cp-workflow-new
description: Scaffold a new workflow template (blank or copied from a built-in) and validate it.
argument-hint: "<new-name> [--from <built-in>] [--force]"
---
```

**Step structure (numbered ## Step N sections matching the autonomous.md pattern):**

1. Parse argv: require `<new-name>`; optional `--from <built-in>`, `--force`.
2. Run `cp workflow ls --json`; if `<new-name>` already exists without `--force`, refuse and suggest `--force` or `/cp-workflow-customize`.
3. Run `cp workflow new <new-name> [--from <built-in>] [--force]`. Capture the printed destination path.
4. Print: "Scaffolded at `<path>`. Open this file and customize it. When done, say so and I'll validate."
5. On user confirmation, run `cp workflow validate <new-name> --strict`. Report errors/warnings.
6. On validation pass, run `cp workflow ls` and confirm the new template appears. Suggest next action: `/cp-workflow-run <new-name>`.

### Plan 44-03 — `cp-workflow-customize` skill

**File:** `commands/cp/workflow-customize.md`

**Frontmatter:**
```yaml
---
name: cp-workflow-customize
description: Round-trip customize a built-in workflow — export, edit, validate, import as new template.
argument-hint: "<built-in> [<new-name>] [--out <path>] [--force]"
---
```

**Step structure:**

1. Parse argv. If `<built-in>` missing, run `cp workflow ls --json`, filter `source == "built-in"`, present table and prompt.
2. If `<new-name>` missing, prompt the user (must differ from built-in and any existing project template).
3. Resolve `<out-path>`: default to `.planning/workflows/<new-name>.yaml` if `cp workflow init` has been run, else `./<new-name>.yaml`.
4. Run `cp workflow export <built-in> --as <new-name> --out <out-path> [--force]`. On collision without `--force`, ask user whether to overwrite.
5. Print: "Exported to `<out-path>`. Open and edit. When done, say so and I'll validate + import."
6. On user confirmation, run `cp workflow validate <new-name> --strict` (the validator reads from path or by name; pass path for unregistered new templates).
7. On validation pass, run `cp workflow import <out-path>` (idempotent; with `--force` if needed). Capture destination.
8. Run `cp workflow ls`, verify `<new-name>` appears as `source: project`. Suggest `/cp-workflow-run <new-name>`.

**Cross-reference:** The skill's Step 5/6/7 wave is conceptually equivalent to `cp-workflow-new`'s Step 4/5/6 — but starting from an existing template's body, not a blank scaffold. Both skills should reference the user-facing fact that the editor + agent loop is the same.

### Plan 44-04 — Tests

**Files touched:**
- `test/unit-v034.js` — extend the `cp-workflow-* skills auto-pickup` section added in 43-04 with two more skill names. 4 new assertions (2 skills × {file exists in copilot, file exists in claude}). Then 4 more (frontmatter `name:` matches for each, both installers).
- `test/integration-workflow-skills.js` — new section "cp workflow export → import round-trip" with at least 8 assertions:
  1. `cp workflow export dev` exits 0
  2. `./dev.yaml` exists
  3. file does NOT contain `# template:` header
  4. file contains `workflow: dev`
  5. `cp workflow import dev.yaml --force` exits 0
  6. `cp workflow export dev --as my-dev --out my-dev.yaml` exits 0
  7. `my-dev.yaml` contains `workflow: my-dev`
  8. `cp workflow import my-dev.yaml` exits 0 + `cp workflow ls --json` lists `my-dev`

## Data Flow

`cp workflow show <name>` reads the template (built-in path or `.planning/workflows/`), prepends `# template: ...` header, prints stdout.

`cp workflow export <name>` calls the same underlying read path, but:
- skips the header
- if `--as` given, rewrites first line matching `/^workflow:\s+\S+\s*$/` to `workflow: <new-name>`
- validates result
- writes to resolved path

`cp workflow import <path>` (unchanged from v1.0) reads, validates, copies to `.planning/workflows/<destname>.yaml` where destname defaults to file basename or `--name override`.

The round-trip invariant: `export <name>` → `import <output>` is a no-op (file already exists, refused without `--force`; with `--force`, identical content). `export <name> --as <new>` → `import <output>` creates a new template `<new>`.

## Error Handling

- `export <unknown>`: exit 1, message "template not found: <name>".
- `export <name>` to existing file without `--force`: exit 1, message "<path> exists; pass --force to overwrite" (mirrors `cp workflow new` behaviour).
- `export <name>` producing invalid YAML (shouldn't happen since input is validated, but defensive): exit 1, do not write.
- `export <name> --as ""`: exit 1, usage error.
- `export <name> --as <existing>`: print warning ("template '<existing>' already exists; import will need --force") but still write the file.
- Skill 44-02/44-03: surface CLI exit codes faithfully to the user; never swallow.

## Testing Strategy

- **Unit (44-01):** `lib/workflows.js` helper tested for header-strip + rename invariant + edge cases (workflow: in string value, missing trailing newline). ≥6 assertions.
- **Dryrun (44-01):** CLI surface — help text contains `export`, `--out`, `--as`, `--force`. ≥3 assertions.
- **Installer (44-04):** copilot + claude trees materialise both new skill files with correct frontmatter. 8 assertions.
- **Integration (44-04):** Real CLI invocation of `export`, `import`, `ls`. ≥8 assertions, round-trip end-to-end.

No skill-as-LLM integration tests (out of scope for cp's test suite); manual smoke test post-44-04.

## Alternatives Considered

### Option A — Skip export, just document `show > file`

**Pros:** Zero CLI surface change. Lower scope.

**Cons:** Three UX paper-cuts (header, rename, default path) hit every user the first time they try. Skills would have to either hand-edit YAML in-skill (fragile) or refuse to do half the job.

**Verdict:** rejected. The CLI gap is real and small to close.

### Option B — Keep `cp-workflow-import` as separate skill in addition to `cp-workflow-customize`

**Pros:** Maps 1:1 to CLI commands.

**Cons:** Pure import is a thin wrapper — paste a path, run a command. No LLM value-add. Two skills for one user task = surface bloat.

**Verdict:** rejected. `customize` covers the import flow; if a power-user really wants raw import, `cp workflow import` is one shell command away.

### Option C — Use a YAML library to rewrite `workflow:` key

**Pros:** Bulletproof against odd YAML shapes (multi-line strings, anchors).

**Cons:** Adds a dependency or hand-rolled YAML serialiser; reserialisation changes formatting, breaks diff-friendliness across export-edit-export cycles; users would see spurious diffs.

**Verdict:** rejected. Regex on the top-level scalar is precise enough; tests cover the edge cases.

## Open Questions

- [ ] Should `cp workflow export` default `--out` to `.planning/workflows/<name>.yaml` (if init'd) instead of `./<name>.yaml`? **Tentative answer:** Yes — round-trip is the primary use case, and `.planning/workflows/` is where `import` puts it anyway. Will validate during 44-01 implementation.

## References

- v1.1 milestone DESIGN.md: `.planning/milestones/v1-1-workflow-skills/DESIGN.md`
- Phase 43 DESIGN.md: `.planning/phases/43-consumer-skills-cp-workflow-run-cp-workf/DESIGN.md`
- Originating user feedback: "if we have a import workflow command, can we add a export command as well. So that customer can export built in workflow, modify for their purpose, then import again with a new name as a new workflow." (2026-05-25, mid-43-04 closeout)
- v1.0 workflow CLI: `bin/commands/workflow.js`
- v1.0 import path: `lib/workflows.js`
