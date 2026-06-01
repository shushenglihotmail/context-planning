---
status: ready
created: 2026-05-31
---

# Quick task — implicit attach for `cp quick-setup`

## Problem

Today `cp quick-setup` requires explicit names for both `--project` and
`--milestone` flags. That's awkward when the cwd is already a known project,
and especially when you just want to attach to "the current/latest milestone"
without having to look up its name or slug.

Also: now that v1.7/v1.8 milestone display names carry a `v1.X` prefix,
short forms like `--milestone 1.8` should resolve as expected.

## Approach

Three changes, all in `bin/commands/quick-setup.js` plus one resolver tweak
in `lib/name-resolve.js`. Zero new files.

### 1. Make `--project` value optional

Parser change: detect bare `--project` (no value, or next token starts
with `--`). Behavior:

- **bare `--project`** → use the project that cwd lives in. Implementation:
  walk up from `cwd` to find the nearest `.planning/PROJECT.md`. Already
  available as `registry.findProjectRoot(cwd)` (per the P99 SUMMARY,
  exports include `findProjectRoot`). Error out with a friendly message if
  none found ("cp quick: --project given but cwd is not inside any project
  with .planning/PROJECT.md").
- **`--project <name>`** → unchanged (registry lookup).
- **no `--project` flag** → unchanged (`repoRoot()`).

The bare form adds a validation gate: it confirms cwd is genuinely a
project before scaffolding (vs. silently accepting any cwd as today).

### 2. Make `--milestone` value optional

Parser change: detect bare `--milestone`. Behavior:

- **bare `--milestone`** → resolve to the **latest** milestone of the
  chosen project (after the `--project` step above runs). Latest =
  - **scope first**: if any milestone has `status: 'active'`, restrict
    the search to the active set; otherwise consider all milestones;
  - then pick the milestone whose `DESIGN.md` frontmatter `created:`
    is the most recent (parse with existing `lib/fm.js` or simple regex);
  - tie-breaker: lexicographically largest slug (deterministic).
  
  Error if there are zero milestones ("cp quick: --milestone given but
  project has no milestones in .planning/milestones/").
- **`--milestone <name>`** → unchanged path through `_resolveMilestone`,
  but with the resolver enhancement below.
- **no `--milestone` flag** → unchanged (no tag written).

A new helper `_latestMilestone(root)` lives next to `_resolveMilestone`.

### 3. Version-prefix matching in `_resolveMilestone`

Today `resolveByName` does exact-then-substring on the `name` field
(case-insens). With v-prefix names like `"v1.8 Milestone workflow…"`,
`--milestone 1.8` already substring-matches (because `"1.8"` ⊂ name).
But the user might also type:

- `v1.8`        → already works (substring).
- `1.8`         → already works (substring).
- `v18`, `1-8`  → don't work; not in scope.

So the **current resolver already handles `--milestone 1.8` correctly**
for the renamed v1.7/v1.8 milestones. **Decision: no resolver changes
needed for this iteration.** Document in SUMMARY that
the existing substring rule was sufficient.

If we later discover edge cases (e.g., `--milestone 1.4` ambiguous
between `v1.4` and `v0.10.1`?), revisit. Spot-check now:

- `1.8` → only `v1.8 Milestone workflow…` contains `1.8`. ✓ unique.
- `1.7` → only `v1.7 Template parameterization whitelist` contains `1.7`. ✓
- `1.0` → `v1.0 Workflow Engine` and `v0.10` both contain `1.0`? Let me
  check: `v0.10` contains `0.10`, not `1.0`. ✓ unique.
- `0.10` → `v0.10 Autonomy` and `v0.10.1 Collapse-aware…` both match.
  **Already ambiguous today** — user gets the friendly error listing
  both. No regression.

### 4. Argument parsing detail

Replace the current `_arg(args, '--project')` calls with a tri-state
helper:

```js
function _flag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return { present: false };
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) return { present: true, value: null };
  return { present: true, value: next };
}
```

Then in `run()`:

```js
const projectFlag = _flag(args, '--project');
const milestoneFlag = _flag(args, '--milestone');

let projectDir = repoRoot();
if (projectFlag.present) {
  if (projectFlag.value === null) {
    const found = registry.findProjectRoot(process.cwd());
    if (!found) { /* error and exit */ }
    projectDir = found;
  } else {
    /* existing _resolveProject path */
  }
}

let milestoneSlug = '';
if (milestoneFlag.present) {
  if (milestoneFlag.value === null) {
    const latest = _latestMilestone(projectDir);
    if (!latest) { /* error: no milestones */ }
    milestoneSlug = latest.slug;
  } else {
    /* existing _resolveMilestone path */
  }
}
```

### 5. Tests

Extend `test/unit-quick-attach.js` with 6 new cases:

1. `--project` (bare) inside a project → succeeds, scaffolds at cwd's project.
2. `--project` (bare) outside any project → exits 1 with friendly error.
3. `--milestone` (bare) with one active milestone → tags that milestone's slug.
4. `--milestone` (bare) with zero milestones → exits 1 with friendly error.
5. `--milestone` (bare) with multiple inactive milestones → picks most recent `created:`.
6. `--project --milestone` (both bare) → both resolve from cwd; equivalent to #1+#3.

No unit-name-resolve.js changes (resolver unchanged).

## Done-When

- [ ] `bin/commands/quick-setup.js`: `_flag()` helper added; `--project` and `--milestone` accept bare form.
- [ ] Bare `--project` walks up to find `.planning/PROJECT.md` via `registry.findProjectRoot`; friendly error if missing.
- [ ] Bare `--milestone` picks active → most-recent-created → lex-largest-slug; friendly error if zero milestones.
- [ ] `--milestone` with a value still works (no regression in `_resolveMilestone`).
- [ ] `--project` with a value still works (no regression in `_resolveProject`).
- [ ] 6 new tests added to `test/unit-quick-attach.js`; `npm test` green (existing 122+ pass, +6 new pass).
- [ ] `bin/commands/_usage.js` for `quick-setup`: documents bare `--project` and bare `--milestone`.
- [ ] One atomic commit titled `feat(quick): implicit attach for --project / --milestone (bare forms)` with Co-authored-by trailer.

## Out of scope

- Skill-level slash command updates (`.github/skills/cp-quick/SKILL.md`) — that surface uses `--project <path>`, a different flag. The skill SKILL.md can be updated in a follow-up if/when we plumb name-based attach through `cp run quick` (currently deferred per P100 SUMMARY).
- Number→version alias mapping (`--milestone 18` → `v1.8`). Substring rule covers the common cases; aliases add ambiguity risk.
- New resolver logic in `lib/name-resolve.js` — current substring rule is sufficient (see §3).

## Open questions

None for the planned scope.
