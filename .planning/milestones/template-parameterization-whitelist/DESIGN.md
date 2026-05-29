---
# Tier marker: cp scaffold substitutes one of:
#   phase: ""     (for phase-tier DESIGN.md)
#   milestone_slug: "template-parameterization-whitelist"  (for milestone-tier DESIGN.md)
milestone_slug: "template-parameterization-whitelist"
milestone: Template parameterization whitelist
status: accepted
created: 2026-05-29
updated: 2026-05-29 (revised: 8-field whitelist; supervisor-supplied params rule)
deciders: []
supersedes: []
superseded_by: null
---

# Design: Template parameterization whitelist

## Status

Accepted on 2026-05-29 (brainstorm phase of milestone workflow).

## Context

`lib/workflow-template-expand.js`' `substituteArgs` walks every string in
every phase and replaces `${...}` / `{{...}}` tokens against the merged arg
map. If a token has no matching arg, the literal text is left in place — no
warning, no error. This causes two real failures:

1. **`{{item.X}}` in child phases looks like it should work** (parent emits
   items; child fans out per item), but template expansion happens once at
   load time, before the parent runs. Items don't exist yet. The literal
   `{{item.id}}` text ships into the runtime prompt and confuses the LLM or
   breaks downstream string handling.
2. **Operationally critical fields can be parameterized today.** `id`,
   `parent`, `after`, `depends_on`, `runner`, `completion`, `config_fallback`,
   etc. all accept tokens silently. A typo or stale parameter mutates the
   workflow's *structure* rather than its content — with no validation.

The first symptom surfaced while authoring the `docs` workflow earlier this
session: an implementer subagent wrote `{{item.title}}` in a child prompt
expecting per-item substitution, and the literal string shipped through.

Inbox seed #1 (captured 2026-05-28) records the deeper discussion.

## Decision

Restrict template parameterization to a whitelist of content-bearing fields,
hard-ban `{{item.X}}` tokens, and reject any unresolved `{{...}}` token after
expansion. Per-item identity (id, title, etc.) is supplied at runtime by the
supervisor injecting context into the child instance — never via template-time
substitution.

### Field whitelist

**Allow** parameterization (`${...}` and `{{...}}` tokens) in:

- `skill`
- `role`
- `prompt`
- `description`
- `command`
- `outputs`
- `max_children`
- `min_children`

**Forbid** parameterization in (validator rejects on load):

- `id`
- `parent`
- `after`
- `depends_on`
- `optimizable`
- `runner`
- `title`
- `require`
- `invoke`
- `config_fallback`
- `completion`

### Hard bans (any field)

- `{{item.X}}` tokens anywhere → reject on load.
- Any `{{...}}` token still present after expansion completes → reject
  UNLESS its name appears in the workflow's declared `params:` list
  (see "Supervisor-supplied params" below).

### Supervisor-supplied params

Some `{{name}}` tokens are supplied by the supervisor at run-time rather
than substituted at load-time (e.g. `task_description`, `slug_with_date`,
`milestone_slug`). To distinguish "intentional runtime injection" from
"undeclared bug" the workflow author MUST declare them in `params:`:

```yaml
params:
  - name: task_description    # no default → supervisor-supplied
  - name: slug_with_date      # no default → supervisor-supplied
  - name: design_skill
    default: "plan"           # has default → substituted at load
```

The validator's post-expand pass accepts leftover `{{name}}` tokens
whose `name` matches a declared param. Tokens with no declaration
trigger an `unresolved-token` rejection.

(Pre-v1.7, undeclared tokens flowed through silently via the
`allowUndeclared: true` substitution pass. v1.7 removes that escape
hatch by requiring an explicit declaration.)

### Scope

Applies to **both** template families:

- `templates/workflows/*.yaml`
- `templates/phases/**` (front-matter AND markdown body)

### Migration

Hard break — no soft-warn period, no `cp workflow migrate` CLI. There is no
known user-authored YAML to migrate; the only migration target is the
shipped built-in templates, fixed within this milestone.

## Consequences

### Positive
- Structural fields cannot be silently parameterized; typos surface at load.
- The `{{item.X}}` failure mode is impossible.
- Loud failure on any unresolved token catches drift between workflow YAML and
  caller-supplied args.
- Workflow-author mental model simplifies: "tokens only live in `skill`,
  `prompt`, `description`, `max_children`, `min_children`."

### Negative
- Breaking change for any external YAML that parameterizes a now-forbidden
  field. (No known consumers today.)
- Adds a new validation pass to template load (small perf cost, negligible).

### Neutral
- Engine-internal `substituteArgs` behavior is unchanged; only a new
  validation layer is added on either side.
- New parameterizable fields default to forbidden in the future — adding one
  is a deliberate decision.

---

## Architecture

```
templates/workflows/*.yaml  ─┐
                             ├─► load → pre-expand validate ─► expand ─► post-expand validate ─► run
templates/phases/**          ─┘            (whitelist +                    (no leftover
                                            {{item.X}} ban)                 {{...}} tokens)
```

Two validation hooks:

1. **Pre-expand validate** (after YAML parse, before `substituteArgs`):
   - For every phase, walk every field. If the field is NOT in the whitelist
     and its raw value contains `${...}` or `{{...}}`, reject.
   - Anywhere a string contains `{{item.X}}`, reject.
2. **Post-expand validate** (after `substituteArgs`):
   - Walk every expanded string. If any `{{...}}` token remains, reject.

## Components

- **`lib/workflow-template-validate.js`** (new): exports
  `validatePreExpand(template)` and `validatePostExpand(expanded)`. Pure
  functions, no side effects, throw structured errors.
- **`lib/workflow-template-expand.js`** (modified): calls
  `validatePreExpand` before its current substitution loop and
  `validatePostExpand` after.
- **`templates/workflows/*.yaml` & `templates/phases/**`**: audited and
  migrated in the audit/migrate phases.

## Data Flow

1. Loader reads YAML → JS object.
2. `validatePreExpand` walks the object, raising on any whitelist violation
   or `{{item.X}}` token.
3. `substituteArgs` runs unchanged.
4. `validatePostExpand` walks the expanded object, raising on any leftover
   `{{...}}` token.
5. Runtime consumes the validated, expanded template.

## Error Handling

Validator errors are typed (`TemplateValidationError`) and include:

- `filePath` — e.g. `templates/workflows/docs.yaml`
- `phaseId` — e.g. `write-doc`
- `fieldPath` — e.g. `depends_on[0]`
- `rule` — e.g. `"depends_on cannot be parameterized"`
- `token` — e.g. `${config.foo}` (or `{{item.id}}`)

Example human-readable message:

```
templates/workflows/docs.yaml: phase 'write-doc': field 'depends_on[0]'
  contains template token '${config.foo}'. The 'depends_on' field is not
  parameterizable. Allowed fields: skill, prompt, description, max_children,
  min_children.
```

All errors are fatal at load. There is no warn-only mode.

## Testing Strategy

- **Unit tests for `validatePreExpand`** — one positive case per allowed
  field, one negative case per forbidden field, dedicated cases for
  `{{item.X}}` in various positions.
- **Unit tests for `validatePostExpand`** — leftover-token rejection, clean
  expansion passes.
- **Integration test** — load every built-in template through the full
  loader; assert all pass post-migration.
- Add to existing `npm test`. No new test runner.

## Alternatives Considered

### Option A — Strict mode flag, opt-in

Add `cp config strict-templates: true` and only enforce when set.

**Pros:** No breaking change.
**Cons:** Two code paths to maintain; silent-typo bug persists by default;
nobody opts in.
**Verdict:** rejected — the bug is bad enough to justify the break.

### Option B — Auto-migrator CLI

Ship `cp workflow migrate <file>` that rewrites common forbidden patterns.

**Pros:** Smoother for external consumers.
**Cons:** No known external consumers. Adds CLI surface + maintenance for
zero current benefit.
**Verdict:** rejected as YAGNI; revisit only if external authoring emerges.

### Option C — Allow `{{item.X}}` via a deferred-expansion mechanism

Introduce a two-pass expander where `{{item.X}}` is preserved through
pre-expand and resolved at runtime per child instance.

**Pros:** Lets authors write per-item templates inline.
**Cons:** Doubles expander complexity; introduces a new failure mode (token
escapes both passes); supervisor runtime injection already solves the same
problem more cleanly.
**Verdict:** rejected — keeps engine simpler, pushes per-item identity to the
right layer.

## Open Questions

- [ ] Are there fields beyond the listed 12 that should also be in the forbid
      list? (To be settled during the audit phase by exhaustive enumeration.)
- [ ] Should `validatePreExpand` also warn on `${...}` tokens that reference
      undefined config keys? (Out of scope for this milestone; tracked
      separately if needed.)

## References

- Inbox seed #1 (2026-05-28): "Restrict workflow template parameterization …"
- `lib/workflow-template-expand.js` — `substituteArgs`, `CONFIG_FALLBACKS`,
  `expandGroup`.
- Prior failure: `docs` workflow implementer subagent writing
  `{{item.title}}` in child prompt (commit `4794390`).
