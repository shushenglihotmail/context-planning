# Tech Stack

## Languages & runtimes
- Node.js `>=18.0.0` (`package.json:27-29`).
- Plain JavaScript / CommonJS across `bin/`, `lib/`, `install/`, and `test/` (`package.json:5-38`).
- YAML only via `yaml@^2.9.0` (`package.json:36-38`).

## Frameworks
- No app framework. This is a CLI plugin / installer, not a web service.
- Entry point is `bin/cp.js` via the `bin` map (`package.json:5-7`).
- Runtime behavior is organized by focused modules like `lib/lifecycle.js`, `lib/worktree.js`, `lib/inbox.js`, `lib/provider.js`.

## Dependencies (production)
- `yaml` (`package.json:36-38`) — parse/render project state and config YAML; the only direct runtime dependency.
- No other direct prod deps; count is 1.

## Dependencies (dev tooling)
- Test runner: plain Node, not Mocha/Jest. `npm test` chains 14 `node test/*.js` suites (`package.json:30-35`).
- Tests currently total 737 assertions across 14 suites (`README.md:9`, `CHANGELOG.md:11-17`).
- No build step, no transpiler, no bundler.

## Package manager & lockfile
- Package manager: npm (use `npm install`, `npm test`, `npm link`) (`README.md:45-50`).
- No lockfile is committed in this repo; install from `package.json` only.

## Distribution model
- Install from git clone, not npm: `git clone ... && cd context-planning && npm install` (`README.md:45-50`).
- CLI exposure: `package.json` maps `cp` → `bin/cp.js` (`package.json:5-7`).
- Published file set is constrained by `files`: `bin`, `commands`, `install`, `lib`, `templates`, `docs`, `README.md` (`package.json:8-15`).
- Treat `bin/cp.js` as the single user-facing executable; keep all new CLI behavior behind modules so the git-clone install stays lean.

## Node / repo operating rules
- Write new runtime code in CommonJS to match existing modules.
- Prefer `node test/<file>.js` for verification; keep test coverage in the existing plain-Node style.
- Preserve the CLI-plugin shape: editable repo, runnable from a clone, no npm package workflow dependency.

## Release tooling
- Versioning is SemVer; bump `package.json` `version`, update the badge in `README.md` (`Tests: NNN`), and add a `CHANGELOG.md` section under `[Unreleased]` for every release.
- Releases are cut with the `gh` CLI (developer-side): `gh release create vX.Y.Z --title "..." --notes-file ...`. Never call `gh` from `lib/*` or `bin/cp.js` at runtime.
- Tag format is `vX.Y.Z`; tags are pushed to `origin` and match `package.json` `version` exactly.

## What is NOT in the stack
- No web framework, no HTTP client, no DB driver, no ORM, no template engine.
- No transpiler (TypeScript, Babel), no bundler (esbuild, webpack, rollup), no Prettier, no ESLint.
- No process supervisor; every `cp` invocation is a one-shot Node process that exits with an explicit status code.
