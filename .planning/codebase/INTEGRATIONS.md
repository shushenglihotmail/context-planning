# External Integrations

## Git
- Use shell-out only: `child_process.execSync('git ...')` in `lib/lifecycle.js` for add/diff/hash flows, and in `lib/worktree.js` paths that wrap `git worktree`.
- Keep all git writes scoped to the repo root passed into the helper; do not introduce a JS git library.
- For commits, worktrees, and status checks, preserve the current atomic-write + commit-scoped pipeline in `lib/lifecycle.js`.

## GitHub releases
- Use the `gh` CLI only in developer/release workflows, not at runtime.
- Do not add runtime network calls for release publishing; keep the CLI local-first.

## AI agent harness targets
- Copilot CLI: install into `.github/skills/` and the ambient instruction file; use `install/copilot.js`.
- Claude Code: install into `.claude/skills/`-style command/rule surfaces and merge `CLAUDE.md`; use `install/claude.js`.
- Cursor IDE: install into `.cursor/rules/*.mdc`; use `install/cursor.js`.
- Aider: install `.aider/CP-CONTEXT.md`, `.aider/cp-commands/*.md`, and patch `.aider.conf.yml`; use `install/aider.js`.
- Keep these installers harness-agnostic: reuse the command markdown emitted from `commands/cp/*.md`.

## Superpowers provider hand-off
- Resolve provider routing in `lib/provider.js`.
- Detect installed providers by sentinel paths; the configured `workflow_provider` defaults to `superpowers` in `.planning/config.json`.
- When a provider exposes a role skill, hand off the workflow and then return to cp for state writes; otherwise fall back to manual prompts.

## GSD interop
- Treat cp as a read/write superset of GSD, with shared state in `.planning/config.json` and additive config merging in `lib/provider.js` and `lib/import.js`.
- Use `lib/gsd-compat.js` and `lib/import.js` for read-only audits and import checks; keep them non-mutating.
- Preserve GSD-compatible filenames and sentinel handling so both tools can coexist in the same `.planning/` tree.

## Local-only boundaries
- No HTTP APIs, databases, queues/pub-sub, or auth providers are integrated by cp.
- No runtime network dependency exists; all integrations are filesystem, shell, or local harness surfaces.

## Secrets & env vars
- `CP_INSTALL_SCOPE=user` switches installers to user-scoped destinations.
- Respect `NO_COLOR` in CLI output paths when present.
- Never print or persist secret values; only surface variable names and required presence.

## CI
- None currently. Do not assume GitHub Actions, release automation, or test automation beyond local `npm test`.
- If you add CI, run `npm test` on Node 18 + 20 across ubuntu-latest and windows-latest; cp is shipped to both platforms.

## Filesystem surfaces
- All state lives under `.planning/` at the repo root: `ROADMAP.md`, `PROJECT.md`, `INBOX.md`, `WORKTREES.md`, `phases/`, `milestones/`, `codebase/`, `config.json`.
- Installer surfaces depend on the harness: `.github/skills/`, `.claude/skills/`, `.cursor/rules/`, `.aider/` + `.aider.conf.yml`.
- Never write outside the repo root unless `CP_INSTALL_SCOPE=user` is set; user-scoped installs target `~/.copilot`, `~/.claude`, `~/.cursor`, `~/.aider` respectively.
