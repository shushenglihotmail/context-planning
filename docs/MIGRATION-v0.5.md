# Migrating to cp v0.5

## What changed

v0.5 restructures provider detection from hardcoded literal sentinel
matching to a data-driven **harnesses × providers** cross-product.
Adding a new harness (AI editor) or workflow provider is now a config-only
edit — no code changes needed.

## Automatic migration

**Most users don't need to do anything.** The first time any `cp` command
runs in your project after upgrading to v0.5, `loadConfig()` automatically:

1. Bumps `cp.version` from 1 to 2.
2. Adds the `cp.harnesses` block (4 harnesses with `plugin_roots`).
3. Adds `plugin_shape` to the `superpowers` provider.
4. Adds the `echo-provider` schema-test stub.
5. Unions any new sentinels into `cp.providers.*.detect.any_of`.
6. Fills missing `behavior.*` keys.

A one-line notice is printed to stderr:
```
cp: refreshed .planning/config.json with schema v1 → v2, new harness 'copilot', ...
```

The merge is **purely additive** — your existing config values are never
overwritten or removed. Second invocation is a no-op.

## Manual migration (optional)

If you prefer explicit control:

```bash
# Preview what would change
cp config refresh --dry-run

# Apply
cp config refresh
```

## Before / after config shape

### v0.4.x (schema v1)

```json
{
  "cp": {
    "version": 1,
    "workflow_provider": "superpowers",
    "providers": {
      "superpowers": {
        "detect": {
          "any_of": [".claude/plugins/superpowers", "..."]
        },
        "skills": { "brainstorm": "brainstorming", "..." }
      },
      "manual": { "..." }
    },
    "behavior": { "atomic_commits": true, "..." }
  }
}
```

### v0.5.0 (schema v2)

```json
{
  "cp": {
    "version": 2,
    "workflow_provider": "superpowers",

    "harnesses": {
      "copilot": {
        "description": "GitHub Copilot CLI",
        "plugin_roots": ["~/.copilot/installed-plugins/*/"]
      },
      "claude": {
        "description": "Claude Code",
        "plugin_roots": ["~/.claude/plugins/", "~/.claude/skills/"]
      },
      "cursor": {
        "description": "Cursor",
        "plugin_roots": ["~/.cursor/extensions/*/"]
      },
      "aider": {
        "description": "Aider (file-based, no plugin slot today)",
        "plugin_roots": []
      }
    },

    "providers": {
      "superpowers": {
        "plugin_shape": {
          "dir_name": "superpowers",
          "required_subdirs": ["skills/writing-plans", "skills/subagent-driven-development"]
        },
        "detect": { "any_of": ["... (8 sentinels, was 5 in v0.4.4)"] },
        "skills": { "..." }
      },
      "echo-provider": {
        "description": "Schema-test stub. Echoes the role name.",
        "plugin_shape": { "dir_name": "echo-provider", "required_subdirs": [] },
        "detect": { "any_of": [".planning/providers/echo-provider"] },
        "skills": { "brainstorm": "echo", "..." }
      },
      "manual": { "..." }
    },
    "behavior": { "..." }
  }
}
```

## `cp doctor` output changes

v0.5 rewrites the doctor output into 5 sections:

1. **Harnesses detected** — which AI editors have plugins installed
2. **Providers detected** — which workflow providers were found, and via which harness
3. **Configured workflow_provider** — what's active, with switch hint
4. **Roles → resolved skill** — same as before, with harness annotation
5. **GSD compatibility** — unchanged

New flags: `--json` (machine-parsable), `--quiet` (configured + roles only).

## Removing local workarounds

If you manually added `installed-plugins/superpowers-marketplace/superpowers`
to your project's `.planning/config.json` `detect.any_of` as a workaround
for the v0.4.4 detection bug, you can now remove it — the auto-heal merge
adds it from upstream defaults. Run `cp config refresh --dry-run` to verify.

## New commands

| Command | Description |
|---|---|
| `cp config refresh [--dry-run]` | Re-sync local config with upstream defaults |
| `cp install echo-provider` | Install the schema-test stub provider |
| `cp doctor --json` | Machine-parsable detection report |
| `cp doctor --quiet` | Minimal: configured + roles only |
