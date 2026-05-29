Brainstorm complete. Locked scope captured in DESIGN.md + MILESTONE-CONTEXT.md.

Whitelist: skill, prompt, description, max_children, min_children.
Forbid: id, parent, after, depends_on, optimizable, runner, outputs, title, require, invoke, config_fallback, completion.
Hard ban: {{item.X}} anywhere; any unresolved {{...}} after expansion.
Scope: both templates/workflows/*.yaml and templates/phases/**.
Migration: hard break, no migrator CLI. Built-ins audited and migrated in-milestone.
