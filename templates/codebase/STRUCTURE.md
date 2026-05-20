# Folder Structure

Generated: {{DATE}} — fill via `/cp-map-codebase` (arch focus).

Answers "where does this new file go?" for `/cp-execute-phase`.

## Top-level layout

<!-- Annotated tree of top-level directories with one-line purpose for each. -->

```
.
├── bin/        ← CLI entry points
├── lib/        ← runtime modules (no I/O)
├── …
```

## Folder responsibilities

<!-- Per directory: what belongs here, what does NOT, naming pattern for files. -->

## Where do I put a NEW …

<!-- New CLI subcommand → … ; new HTTP route → … ; new test → … ; new migration → … -->

## Filename conventions

<!-- kebab-case vs camelCase, suffixes (`.test.ts`, `.spec.js`, etc.). -->

## Generated / vendored / ignored

<!-- Paths the executor must never edit by hand. Include why. -->
