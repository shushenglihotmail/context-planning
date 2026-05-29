# Migration guide: v1.6 → v1.7

**TL;DR**: v1.7 introduces a hard whitelist of which workflow-template
fields may contain `{{...}}` substitution tokens, and a loud
post-expand pass that rejects any stray tokens left after substitution.
The built-in workflows (`quick`, `milestone`, `docs`) and the included
`review-and-address` workflow-template have been migrated. If you
author custom workflow templates, read on.

If you only consume cp through the slash commands and built-in
workflows, you can stop reading. Just `npm install -g context-planning@1.7`
and continue.

---

## What changed

### 1. Whitelist of templatable fields

Inside a workflow-template phase (or a top-level workflow phase), the
**only** fields whose values may contain `{{...}}` substitution tokens
are now:

```
skill           role
prompt          command
description     outputs
max_children
min_children
```

Everything else — most importantly `id`, `parent`, `after`,
`depends_on`, `runner`, `title`, `require`, `invoke`,
`config_fallback`, `completion`, `optimizable` — is **forbidden** from
containing `{{...}}` tokens. The validator rejects offenders at load
time.

### 2. Post-expand pass rejects stray tokens

After all substitution runs, the validator walks every leaf string in
the expanded phase tree. Any remaining `{{foo}}` is an error — there
is no longer a silent escape hatch for "the supervisor will sort it
out".

### 3. Supervisor-supplied params get a first-class declaration

If your workflow expects a token the supervisor agent will inject at
run-time (e.g. `slug_with_date`, `milestone_slug`), declare it at the
top of the workflow YAML as a **no-default param**:

```yaml
workflow: my-flow
version: 1
params:
  - name: slug_with_date           # supervisor-supplied — no default
  - name: clarify_skill
    default: cp:manual/brainstorm  # author-supplied — has default
phases:
  - phase:
      id: setup
      command: "cp setup {{slug_with_date}}"
```

The loader collects all no-default param names into a per-run
`supervisorTokenNames` set and passes it to the post-expand validator,
so those tokens are allow-listed. Undeclared tokens still fail.

> Dotted tokens like `{{x.y}}` are **always** rejected, even if `x`
> is in the supervisor set.

---

## Recipe: fix a custom workflow-template that fails v1.7 validation

### Symptom A — forbidden field templated

```
TemplateValidationError: field 'id' may not contain '{{...}}' tokens
  at templates/workflow-templates/my-template.yaml phase 'review-{{scope}}'
```

**Cause**: pre-v1.7, you could write `id: review-{{scope}}` and the
caller's `args.scope` would be substituted in. v1.7 forbids this.

**Fix**: drop the `{{scope}}` from `id:` (and `after:` if you
templated those too). Uniqueness across multiple inclusions now comes
from the caller's `template.id` — cp auto-prefixes every included
phase id with `<include-id>--`, so:

```yaml
# caller
- template:
    id: review-auth                # <-- the include id
    name: my-template
    args: { scope: auth }
- template:
    id: review-payments
    name: my-template
    args: { scope: payments }
```

…now produces unique phase ids `review-auth--review` and
`review-payments--review` automatically. Move the `{{scope}}` value
into `description:` / `prompt:` where templating is still allowed.

### Symptom B — stray token after expansion

```
TemplateValidationError: unsubstituted token '{{milestone_slug}}'
  at phase 'finalize' field 'command'
```

**Cause**: the workflow references a token nobody declared.

**Fix**: declare it. If the supervisor will inject it at run-time,
add a no-default entry to `params:`:

```yaml
params:
  - name: milestone_slug
```

If it was a typo or stale name, fix the reference instead.

### Symptom C — `params:` block silently ignored

If your params block was written as a YAML map:

```yaml
params:
  slug:
    default: foo
```

…the loader (pre-v1.7) silently ignored it because only the array
shape was supported. v1.7 still requires the array shape:

```yaml
params:
  - name: slug
    default: foo
```

Any references to `{{slug}}` that previously worked by accident (via
the silent-token escape) will now fail loudly. Convert to the array
shape.

---

## Verification

After migrating, run:

```
npm test          # all green
cp audit --json   # summary.high should be 0
```

Then `cp run <your-workflow> "<name>"` should load without
`TemplateValidationError`.
