prepare phase complete.

Decomposition: 3 independent documents, one per item, per the user-approved DESIGN.md.

Order: sequential (`optimizable: false`) — recipes references reference, so reference is written first only by chance of list order; quickstart is self-contained. Keeping them sequential to honour the workflow principle of "context flows down" and to keep child commits cleanly ordered for review.

Each item declares an explicit `output` path (`docs/workflow/<id>.md`) overriding the docs-workflow default of `docs/<id>.md` per DESIGN.md's subfolder requirement.

```json
{
  "optimizable": false,
  "items": [
    {
      "id": "quickstart",
      "title": "Workflow templates: quickstart",
      "audience": "project users new to authoring custom workflow templates",
      "format": "Markdown",
      "output": "docs/workflow/quickstart.md",
      "refs": [
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/DESIGN.md#quickstart",
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/CONTEXT.md",
        "templates/workflows/quick.yaml",
        "bin/commands/workflow.js",
        "bin/commands/run.js"
      ]
    },
    {
      "id": "reference",
      "title": "Workflow templates: schema and CLI reference",
      "audience": "project users authoring custom templates who need the authoritative schema, CLI flags, and exit codes",
      "format": "Markdown",
      "output": "docs/workflow/reference.md",
      "refs": [
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/DESIGN.md#reference",
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/CONTEXT.md",
        "lib/workflow.js",
        "lib/workflow-template-validate.js",
        "lib/workflow-template-expand.js",
        "bin/commands/workflow.js",
        "bin/commands/run.js",
        "templates/config.json"
      ]
    },
    {
      "id": "recipes",
      "title": "Workflow templates: recipes and patterns",
      "audience": "project users adapting or composing custom templates from real-world patterns",
      "format": "Markdown",
      "output": "docs/workflow/recipes.md",
      "refs": [
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/DESIGN.md#recipes",
        ".planning/quick/2026-05-29-write-workflow-template-tutorial/CONTEXT.md",
        "templates/workflows/docs.yaml",
        "templates/workflows/dev.yaml",
        "templates/workflows/debug.yaml",
        "templates/workflows/milestone.yaml",
        "templates/workflows/complete-milestone.yaml",
        "templates/workflows/quick.yaml",
        "docs/workflow/reference.md"
      ]
    }
  ]
}
```

Note on skill routing: invoked `writing-plans` per contract. Its native output (markdown TDD plan with checkbox steps) does not match the runtime-expected JSON shape, so I used its decomposition discipline (scope check, file structure, isolation) to produce the JSON the prepare phase declares. The user-approved DESIGN.md already locked the 3-doc split, so no further planning work was needed beyond declaration.
