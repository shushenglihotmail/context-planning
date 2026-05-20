# v0.5 — Generic provider / harness detection

**Status:** Design (approved 2026-05-20)
**Milestone:** v0.5
**Brainstorm session:** 2026-05-20, paired with user @sli
**Spec author:** Copilot CLI (Claude Opus 4.7)
**Implementation provider:** Superpowers (`writing-plans` → `subagent-driven-development`)

---

## 1. Problem statement

`cp` (context-planning) v0.4.5 ships a working but fragile detection layer:

- Workflow provider detection is **literal string matching** against a 5-element list of hardcoded sentinel paths under 5 hardcoded base dirs.
- Only one real workflow provider (Superpowers) is shipped; the schema is "generic" in theory but never proved with a second provider.
- AI harnesses (Copilot CLI, Claude Code, Cursor, Aider) are not modeled at all — detection doesn't know which harness's plugin marketplace it's scanning, so:
  - When a new harness adds a plugin marketplace at a new path, cp needs a code/template change.
  - `cp doctor` can't tell the user *which* harness their Superpowers install came from.
- Brownfield `.planning/config.json` files snapshot the default sentinel list at init time and never refresh — so the v0.4.5 sentinel additions are invisible to existing projects.

The user-visible symptom that surfaced v0.4.5 (`cp doctor` reports Superpowers as missing under Copilot CLI) will keep recurring with every new harness or marketplace layout unless detection is restructured around an extensible model.

## 2. Goals

1. **Harnesses × providers cross-product detection.** A single config-only edit adds support for a new harness or a new provider; no `lib/*.js` changes required.
2. **Marketplace-wildcard support** (`installed-plugins/*/`) so forks of `superpowers-marketplace` (or any plugin distributor) work out of the box.
3. **`cp doctor` enumerates everything found** — all harnesses, all providers, where each was located, what the active configuration resolves to.
4. **Brownfield projects auto-heal** — first v0.5 invocation in a project init'd against v0.4.x silently merges new upstream defaults (sentinels, harnesses, new providers) into the local config and writes the result back, with a stderr notice.
5. **Schema generality proven** — ship a second built-in provider (a no-op `echo-provider` stub) so the assertion "the schema isn't Superpowers-shaped" is testable end-to-end.

## 3. Non-goals (v0.5)

- Full minimatch globbing (`**`, character classes). Trailing-`*` segment only.
- A real second workflow provider (BMAD / GSD-as-provider / etc.) — `echo-provider` is a schema test, not a product offering.
- `cp install <provider>` to auto-install Superpowers / others — out of scope.
- Phase-level workflow_provider override (e.g., "use Superpowers for plan, manual for execute").
- Telemetry / network calls — cp remains fully offline.

## 4. User-facing surface

### 4.1 Schema (`templates/config.json`, schema version 2)

```json
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
      "plugin_roots": ["~/.claude/plugins/*/", "~/.claude/skills/"]
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
      "description": "Jesse Vincent's Superpowers plugin (https://github.com/obra/superpowers)",
      "plugin_shape": {
        "dir_name": "superpowers",
        "required_subdirs": [
          "skills/writing-plans",
          "skills/subagent-driven-development"
        ]
      },
      "detect": {
        "any_of": [
          ".claude/plugins/superpowers",
          ".claude/skills/superpowers",
          ".github/skills/brainstorming",
          ".github/skills/writing-plans",
          ".github/skills/subagent-driven-development",
          "installed-plugins/superpowers-marketplace/superpowers",
          "installed-plugins/superpowers-marketplace/superpowers/skills/writing-plans",
          "installed-plugins/superpowers-marketplace/superpowers/skills/subagent-driven-development"
        ]
      },
      "skills": { "brainstorm": "brainstorming", "plan": "writing-plans", "execute": "subagent-driven-development", "execute_simple": "executing-plans", "review": "requesting-code-review", "receive_review": "receiving-code-review", "finish": "finishing-a-development-branch", "worktree": "using-git-worktrees", "tdd": "test-driven-development", "debug": "systematic-debugging", "verify": "verification-before-completion" }
    },

    "echo-provider": {
      "description": "Schema-test stub. Echoes the role name. Not for end users.",
      "plugin_shape": { "dir_name": "echo-provider", "required_subdirs": [] },
      "skills": { "brainstorm": "echo", "plan": "echo", "execute": "echo", "execute_simple": "echo", "review": "echo", "receive_review": "echo", "finish": "echo", "worktree": "echo", "tdd": "echo", "debug": "echo", "verify": "echo" }
    },

    "manual": { "description": "Inline fallback...", "detect": { "always": true }, "skills": { ... unchanged ... }, "prompts": { ... unchanged ... } }
  },

  "behavior": { ... unchanged ... }
}
```

**Detection rule for a provider P:**
> Installed if either (a) for some harness H, expanding any of `H.plugin_roots` yields a child directory named `P.plugin_shape.dir_name` AND every entry in `P.plugin_shape.required_subdirs` exists under it; OR (b) any entry in `P.detect.any_of` is found via the legacy 5-base-dir search.

(a) is the preferred path. (b) is back-compat for hand-curated literal sentinels.

### 4.2 `cp doctor` output (sectioned)

```
cp v0.5.0
Repo root:    C:\src\github\stock-analyze-hub\core-service-py
.planning/:   present
Config:       .planning\config.json  (schema v2)

Harnesses detected:
  ✓ copilot   ~/.copilot/installed-plugins/* (2 marketplaces, 4 plugins)
  ✓ claude    ~/.claude/plugins/* (1 plugin), ~/.claude/skills/ (0 plugins)
  ✗ cursor    (no plugins found at ~/.cursor/extensions/*)
  — aider     (file-based — no plugin slot)

Providers detected:
  ✓ superpowers      via copilot @ installed-plugins/superpowers-marketplace/superpowers
                     via claude   @ plugins/superpowers
  ✗ echo-provider    (stub — install with `cp install echo-provider --local`)
  ✓ manual           (always available)

Configured workflow_provider:  superpowers       [`cp config set workflow_provider <name>` to switch]

Roles → resolved skill:
  ✓ brainstorm → superpowers/brainstorming        (via copilot)
  ✓ plan       → superpowers/writing-plans        (via copilot)
  ... (9 total)

GSD compatibility:
  cp-aware config:    ✓
  shared files:       .planning/PROJECT.md, .planning/ROADMAP.md, .planning/STATE.md, .planning/config.json
  phase dirs:         6
```

**Flags**:
- `--json` emits the full `detectAllInstalled()` payload as machine-readable JSON (consumers: statusline, external tooling, CI).
- `--quiet` emits only the `Configured` line + role table (terse mode for CI / tight terminals).

**Exit codes**: `0` if configured provider resolves OR `behavior.fall_back_to_manual_if_provider_missing=true`; `1` otherwise.

### 4.3 `cp config refresh`

```
$ cp config refresh [--dry-run]
cp: would add 3 sentinels to providers.superpowers.detect.any_of
cp: would add provider 'echo-provider'
cp: would migrate schema v1 → v2
(no changes written — use without --dry-run to apply)
```

Idempotent. Second run is a no-op. Implementation: call `mergeCpDefaults` with `verbose: true`, print planned mutations, write back unless `--dry-run`.

### 4.4 Auto-heal at `loadConfig` time

First v0.5 invocation in any project with a `.planning/config.json` that lacks new defaults (sentinels, harnesses, new providers, schema bump) **silently merges and writes back**, with one stderr line:

```
cp: refreshed .planning/config.json with 3 new sentinels, 1 new provider (echo-provider), schema v1 → v2
```

Subsequent invocations are no-ops (idempotent merge).

## 5. Internal architecture

### 5.1 New module: `lib/detect.js` (~250 LOC target)

```
// Public API (also re-exported through lib/provider.js for back-compat)
detectAllInstalled(cfg) → DetectionReport
detectProviderAtAnyHarness(cfg, providerName) → ProviderHit | { installed: false }
expandRoot(rootSpec) → string[]      // trailing-* glob expansion with tilde
```

```
type DetectionReport = {
  harnesses: HarnessReport[],
  providers: ProviderReport[],
}
type HarnessReport = {
  name: string,
  configured: boolean,
  scannedRoots: { root: string, expanded: string[] }[],
  pluginCount: number,
}
type ProviderReport = {
  name: string,
  installed: boolean,
  hits: ProviderHit[],   // empty if installed=false
}
type ProviderHit = {
  via: string,           // harness name, or '_anywhere' for legacy literal match
  source: 'plugin_shape' | 'literal' | 'always',
  evidence: string,      // absolute path that satisfied detection
}
```

**Pure functions** — no I/O caching, no module-level state. Filesystem reads happen at call time. Tests monkey-patch `os.homedir` (same pattern as v0.4.5).

**`expandRoot` algorithm**:
1. Replace leading `~/` with `os.homedir() + '/'`. No env-var expansion.
2. If no `*` in the path → return `[absPath]` if exists else `[]`.
3. Else split on first `*`-segment, `readdirSync(parent)`, filter to dirs, append rest of path to each, recurse.
4. Trailing slashes normalized to platform sep.

### 5.2 Slimmed `lib/provider.js` (~100 LOC target, was 145)

Keeps:
- `loadConfig(root)`, `saveConfig(cfg, root)`, `configPath(root)`, `loadDefaults()`
- `cpGet(cfg, dotted, fallback)`, `cpSet(cfg, dotted, value)`
- `resolveSkill(role, root)` — now a thin wrapper that calls `detect.detectProviderAtAnyHarness` then maps to a skill name.
- `resolvePrompt(role, root)` — unchanged.

Removes (moves to `lib/detect.js`):
- `existsAnywhere(candidate)`
- `detectProvider(cfg, name)` — re-exported from detect.js as `detectProviderAtAnyHarness` for clarity; old export name kept as alias for one minor version.

### 5.3 New module: `lib/merge.js` (~150 LOC target)

```
mergeCpDefaults(raw, defaults, { verbose: false }) → { cfg, changed, summary, plannedChanges }
```

Pure function. No I/O. Caller decides whether to write the result.

**Merge rules** (purely additive — never delete user data):

| Key | Rule |
|---|---|
| `cp.version` | `Math.max(raw, defaults)` |
| `cp.workflow_provider` | user wins (never overwrite) |
| `cp.harnesses[H]` | add missing H entirely; for existing H, deep-merge keys |
| `cp.harnesses[H].plugin_roots` | union (dedupe, preserve order) |
| `cp.providers[P]` | add missing P entirely |
| `cp.providers[P].detect.any_of` | union (dedupe) |
| `cp.providers[P].plugin_shape` | add if missing; never overwrite |
| `cp.providers[P].skills[role]` | add if missing; user wins on conflict |
| `cp.providers[P].prompts[role]` | add if missing; user wins on conflict |
| `cp.behavior[K]` | add if missing; user wins on conflict |

`summary` is a short human-readable string composed from `plannedChanges`. Example: `"3 new sentinels, 1 new provider (echo-provider), schema v1 → v2"`.

### 5.4 `loadConfig` change

```js
function loadConfig(root) {
  const p = configPath(root);
  const defaults = loadDefaults();
  if (!fs.existsSync(p)) return defaults;

  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));

  if (!raw.cp) {                                           // existing pure-GSD path
    raw.cp = defaults.cp;
    fs.writeFileSync(p, JSON.stringify(raw, null, 2) + '\n');
    return raw;
  }

  const merged = mergeCpDefaults(raw, defaults);
  if (merged.changed) {
    fs.writeFileSync(p, JSON.stringify(merged.cfg, null, 2) + '\n');
    process.stderr.write(`cp: refreshed .planning/config.json with ${merged.summary}\n`);
  }
  return merged.cfg;
}
```

Stderr write is intentional — `cp doctor`'s output is parsed in tests / status-line; mutating stdout would break them. Stderr is the right channel for advisory notices.

### 5.5 `bin/cp.js` additions

- `cp doctor` rewritten to consume `detect.detectAllInstalled` and emit the sectioned format. New flags: `--json`, `--quiet`.
- `cp config refresh [--dry-run]` — new subcommand. Reads config, calls `mergeCpDefaults(verbose:true)`, prints planned changes, writes unless `--dry-run`.
- `cp install echo-provider --local` — new flag on existing `install` dispatcher. Plants `~/.cp/providers/echo-provider/skills/echo/SKILL.md` (single file, ~5 lines). Pure local install, no network.

## 6. Error handling

| Scenario | Behavior |
|---|---|
| Malformed `~/.copilot/installed-plugins/<x>` (file instead of dir) | Skipped by `readdirSync` + dir filter; no error surfaced |
| `cp.harnesses[H].plugin_roots` entry has multiple `*` | Each `*` segment expanded recursively; works as expected |
| `~/` expansion when `os.homedir()` returns empty | Skip the root; log a warning to stderr via `cp doctor` (once per invocation) |
| User-edited `cp.providers[P].plugin_shape.required_subdirs` is not an array | `detectProviderAtAnyHarness` returns `{installed: false, reason: 'malformed plugin_shape'}` and `cp doctor` shows `✗ P (config error: ...)` instead of crashing |
| `mergeCpDefaults` encounters a value-type conflict (e.g., user set `plugin_roots: "string"` instead of array) | User value preserved; one stderr warning; merge continues for other keys |
| `cp config refresh` against a missing `.planning/config.json` | Exit 1 with `cp: no .planning/config.json found — run \`cp init\` first` |

No `try/catch` around `fs.readFileSync` for config — let the parse error propagate (matches v0.4.x behavior). The merge function is wrapped in try/catch only at the `loadConfig` boundary; on merge failure, log to stderr and return the unmerged config (don't block the command).

## 7. Testing strategy

### Test fixtures

| Fixture name | Purpose |
|---|---|
| `host-copilot-only` | `~/.copilot/installed-plugins/superpowers-marketplace/superpowers/` exists with required subdirs |
| `host-claude-only` | `~/.claude/plugins/superpowers/` exists |
| `host-both` | Both layouts present (multi-harness detection) |
| `host-neither` | Empty home — manual fallback only |
| `host-stub-installed` | `~/.cp/providers/echo-provider/skills/echo/` exists |
| `host-malformed` | `~/.copilot/installed-plugins/junk-marketplace/superpowers/` is a file, not dir |

### Test files

| File | Coverage | Assertions |
|---|---|---|
| `test/unit-detect.js` (NEW) | `expandRoot` (10 cases incl. tilde, missing parent, mixed literals, multi-`*`); `detectProviderAtAnyHarness` against all 6 host fixtures; back-compat with legacy `any_of` literals; full `detectAllInstalled` shape check | ~40 |
| `test/unit-merge.js` (NEW) | Each merge rule (~11) × edge cases (user-empty / user-extra / user-conflict / schema v1→v2 / type mismatch); idempotency (apply twice == apply once); summary string format | ~50 |
| `test/dryrun-doctor.js` (NEW) | Spawn `bin/cp.js doctor` against temp roots, assert output sections; `--json` shape; `--quiet` shape; exit codes for missing-provider + fallback-disabled | ~25 |
| `test/dryrun-config-refresh.js` (NEW) | Brownfield fixtures (v0.4.4 config / v0.3.x config / pure-GSD / hand-rolled / empty-cp) go through refresh; assert diff; assert second run is no-op | ~25 |
| `test/unit-libs.js` (EXTEND) | Keep v0.4.5 sections; add smoke test that `provider.resolveSkill` still works through the new path | ~5 |

Total new: ~145. Baseline 751 → ~895.

All new tests follow the v0.4.5 isolation pattern: monkey-patch `os.homedir()` to a temp dir so the host machine state doesn't leak.

### Manual / dogfood verification

- Run `cp doctor` in this repo (`context-planning`) → expect all 4 harnesses, both superpowers + echo-provider listed.
- Run `cp doctor` in `StockAnalyzer/core-service-py` → expect identical output (proves brownfield auto-heal worked).
- Remove the local `installed-plugins/...` override from StockAnalyzer's config, run `cp doctor` again → auto-heal restores it, detection still works.
- `cp config refresh --dry-run` in a freshly init'd v0.4.x project → expect non-empty diff; without `--dry-run` → first run mutates, second run is no-op.

## 8. Rollout plan

Each phase ships as an internal pre-release; the final tag is `v0.5.0`.

| Phase | Tag | Scope | Ships when |
|---|---|---|---|
| 1. Schema + detection core | v0.5.0-alpha | Templates updated; `lib/detect.js` lands; `lib/provider.js` slimmed; existing tests still pass; `cp doctor` output unchanged externally (uses old code path) | `test/unit-detect.js` green |
| 2. `cp doctor` rewrite | v0.5.0-beta | Sectioned output; `--json`/`--quiet` flags; `test/dryrun-doctor.js` green | Manual eyeball OK |
| 3. Auto-heal + `cp config refresh` | v0.5.0-rc | `lib/merge.js` lands; `loadConfig` writes back on first encounter; new subcommand; `test/unit-merge.js` + `test/dryrun-config-refresh.js` green | Brownfield fixtures verified by hand |
| 4. Echo-provider stub + installer | v0.5.0 | `install/echo-provider.js` plants local files; `cp doctor` shows echo as detected after install; README example | End-to-end "switch workflow_provider to echo-provider" demo works |
| 5. Migration doc + CHANGELOG (no version) | — | `docs/MIGRATION-v0.5.md` (before/after configs); CHANGELOG; README update; GitHub release with summary | All above shipped |

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| First-run auto-heal mutates user's config without their knowing | Medium | Loud stderr message; `cp config refresh --dry-run` documented in v0.4.5 → v0.5 upgrade notes; auto-heal is purely additive so worst case is extra entries the user can prune |
| Trailing-`*` semantics confuse users expecting `**` | Low | Documented explicitly in `cp doctor --help` and migration doc; trailing-`*` covers all known real-world cases |
| `cp.harnesses` block under `cp.*` confuses GSD users | Very low | GSD ignores unknown keys under the `cp` block by design (existing convention) |
| Echo-provider sets a precedent users misuse as a real provider | Low | `description` says "Not for end users"; `cp doctor` doesn't recommend switching to it; README example labels it a schema test |
| `~/.cp/providers/` directory convention conflicts with future cp-managed user state | Low | Document the convention in v0.5; if v0.6 needs cp-managed user state, put it under `~/.cp/state/` or `~/.cp/cache/` |

## 10. Out of scope (parked for v0.6+)

- Full minimatch globbing (`**`, character classes)
- A real second workflow provider (BMAD / GSD-as-provider integration)
- `cp install superpowers` (auto-install Superpowers via npm / curl)
- Phase-level workflow_provider override
- Telemetry / first-run survey
- Multi-OS testing matrix in CI (currently zero CI; that's a separate concern in `.planning/codebase/CONCERNS.md`)
- Refactoring `bin/cp.js` LOC growth (1100+ lines, hand-rolled argv per handler — open MEDIUM concern, not v0.5)

## 11. Open questions

None at spec-write time. All scoping decisions captured in the Q1-Q5 interactive brainstorm:

| Q | Decision |
|---|---|
| Harness scope | All four (Copilot, Claude, Cursor, Aider) modeled in schema |
| Glob support | Trailing-`*` segment only (zero-deps) |
| `cp doctor` output | Sectioned (full enumeration) |
| Brownfield merge | Auto-write on first load + explicit `cp config refresh` |
| Second provider | Schema-test stub (`echo-provider`) only |

## 12. References

- Triggering bug: `cp doctor` reports Superpowers missing under Copilot CLI marketplace install (fixed as a band-aid in v0.4.5, full structural fix is this milestone).
- Predecessor commit: `a168fbd` — `fix(v0.4.5): detect Superpowers via Copilot CLI marketplace install`
- Brownfield issue surfaced during v0.4.5 verification: `loadConfig` only merges defaults when `cp` block is entirely missing — root cause of the auto-heal requirement in this design.
- Architecture principle drawn from existing PROJECT.md: "Node-only runtime: keep zero-deps in `bin/`/`lib/`" — gates Q2 against minimatch.
