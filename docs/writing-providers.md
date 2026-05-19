# Writing a custom provider

A "provider" tells `cp` how to look up a skill for each workflow role.
Providers are defined in `.planning/cp-config.json`:

```json
{
  "workflow_provider": "my-provider",
  "providers": {
    "my-provider": {
      "description": "...",
      "detect": {
        "any_of": [".claude/plugins/my-thing", "some/sentinel/path"]
      },
      "skills": {
        "brainstorm": "my-brainstorm-skill",
        "plan":       "my-plan-skill",
        "execute":    "my-execute-skill",
        "review":     "my-review-skill",
        "finish":     "my-finish-skill",
        "worktree":   "my-worktree-skill",
        "tdd":        "my-tdd-skill",
        "debug":      "my-debug-skill",
        "verify":     "my-verify-skill"
      }
    }
  }
}
```

## Required roles

Only `brainstorm`, `plan`, and `execute` are strictly required. The
others enrich the workflow but cp will skip them gracefully if absent.

| Role | When cp invokes it |
|---|---|
| `brainstorm` | `/cp-new-project`, `/cp-new-milestone` — refine intent |
| `plan` | `/cp-plan-phase`, `/cp-quick` — produce a task list |
| `execute` | `/cp-execute-phase`, `/cp-quick` — do the work |
| `execute_simple` | optional, lighter alternative to `execute` |
| `review` | between tasks if your provider supports it |
| `finish` | when a milestone/phase ships |
| `worktree` | create an isolated branch before risky work |
| `tdd` | during execute, if test-driven cycle is desired |
| `debug` | when verification fails |
| `verify` | confirm Success Criteria after execute |

## Detection

`cp` uses `detect.any_of` paths to decide whether a provider is "installed".
A path can be:

- Project-relative (e.g. `.github/skills/brainstorming`)
- User-home-relative (e.g. `.claude/plugins/my-thing`)

The first match counts. If none match, cp falls back to the `manual` provider
when `behavior.fall_back_to_manual_if_provider_missing` is `true`.

You can also force detection with `"detect": { "always": true }` (this is
what the built-in `manual` provider does).

## The `manual` provider

`manual` has no `skills` mappings. When cp resolves a role to `manual`, the
command-markdown's inline fallback prompts are used. This is the lowest
common denominator — everything still works, just without the polish of a
real workflow plugin.

## Adding a provider

1. Edit `.planning/cp-config.json` and add your entry under `providers`.
2. Optionally set `workflow_provider` to your new entry.
3. Run `cp doctor` to confirm the detection passes.

There is no code to write — providers are pure config.
