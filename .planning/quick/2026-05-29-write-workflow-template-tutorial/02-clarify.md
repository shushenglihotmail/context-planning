Clarify phase complete.

Scope locked with user: 3-document tutorial set under docs/workflow/ for project users authoring custom workflow templates in .planning/workflows/.

Documents:
- docs/workflow/quickstart.md (~150 lines) — runnable hello-world template walkthrough
- docs/workflow/reference.md (~350 lines) — every YAML field documented
- docs/workflow/recipes.md (~300 lines) — 8 cookbook patterns

Audience: project users (not cp contributors).
Format: Markdown, code-first, mirrors docs/writing-providers.md style.
Success bar: every YAML validates with --strict, every CLI flag exists in --help, every schema field appears in reference.md, first-time user can complete quickstart end-to-end without other docs.

DESIGN.md written to .planning/quick/2026-05-29-write-workflow-template-tutorial/DESIGN.md and explicitly approved by user before mark-complete.

Next: read-materials phase will consume templates/workflows/*.yaml, lib/workflow/*, bin/commands/workflow.js + run.js, docs/writing-providers.md, MIGRATION-v1.{4,6,7}.md, and the v1.6 workflow-contract-hardening design spec to produce CONTEXT.md.
