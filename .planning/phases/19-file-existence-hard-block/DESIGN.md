---
phase: "19"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [sli]
supersedes: []
superseded_by: null
---

# Design: Phase 19: File-existence hard-block

## Status

Accepted on 2026-05-21. Third "prevent" phase of v0.8 Consistency, building
on P1 (SHA pinning) and P2 (auto key-files).

## Context

The milestone DESIGN.md identifies "Forgetful executor" as drift cause #1:
SUMMARY claims `lib/foo.js` was created but the file isn't on disk. With
P2 (auto key-files), the diff-driven path is now self-correcting — entries
discovered via `git diff base..end` are by construction present in the
working tree.

But the SUMMARY data path still accepts **caller-supplied** entries (the
LLM agent emits a JSON blob that may list files it intended to write
but didn't). P2 unions those entries verbatim and would happily stamp a
phantom path into SUMMARY frontmatter, only for downstream consumers
(milestone aggregation, audit, docs) to chase 404s later.

`key-decisions` already has a write-time hard-block (P12, shipped in
v0.7): writeSummary throws `ValidationError` if the list is empty. That
established the pattern.

## Decision

Add a second write-time `ValidationError` to `lib/milestone.js::writeSummary`:
**every path in `key-files.created` and `key-files.modified` must exist
on disk relative to the project root**, otherwise refuse the write with
a structured error that names the missing paths.

The check runs AFTER P2 auto-fill so diff-discovered entries (always
real) never trigger it; it only catches caller-supplied phantoms.

Mirror the same check in `lib/lifecycle.js::writeSummary` so both code
paths stay in lockstep (per the convention established in phases 17/18).

Provide a `--no-file-check` CLI flag and `{ checkFileExistence: false }`
option for edge cases (write-summary against a stash, dry-run preview
against a pre-merge tree, etc.). Default is on.

## Consequences

### Positive
- Eliminates drift cause #1 at the source (no phantom paths reach disk).
- Catches LLM hallucination before it pollutes the milestone aggregation.
- Reuses the established `ValidationError` + exit-code-2 pattern.
- Zero risk to auto-filled entries — only checks caller-supplied paths
  (auto-fill entries are diff-derived → guaranteed to exist).

### Negative
- One extra `fs.existsSync` per key-files entry. Negligible.
- Pre-existing SUMMARYs with stale paths cannot be overwritten without
  the opt-out flag. Acceptable — opt-out is explicit and audited.

### Neutral
- The check is non-recursive (only the listed path, not transitively).
- Glob patterns are not expanded; entries must be literal paths.

---

## Architecture

```
writeSummary(root, planId, data, opts)
   │
   ├─► _normaliseSummary (snake→kebab, defaults)
   ├─► key-decisions hard-block        (P12, existing)
   ├─► P2: _autoFillKeyFiles            (Phase 18)
   ├─► P3: _checkKeyFilesExist          ◄── NEW
   │       └─ throws ValidationError if any path missing
   ├─► P1: end-commit stamping          (Phase 17)
   └─► fm.stringify → writeFile
```

## Components

| Name | Purpose | Interface |
|---|---|---|
| `_checkKeyFilesExist(normalised, root)` | Resolve each key-file path relative to `root`; collect missing | returns `{ missing: string[] }` (pure) |
| `writeSummary` hard-block | After auto-fill, if `missing.length > 0`, throw `ValidationError` | structured message lists each missing path |
| `bin/commands/write-summary.js` | New `--no-file-check` flag → `{ checkFileExistence: false }` | passes option through |

## Data Flow

1. P2 auto-fill populates `key-files` from diff.
2. Caller-supplied entries from `data['key-files']` are already union-merged.
3. `_checkKeyFilesExist` walks all entries (`created` + `modified`).
4. For each entry, `fs.existsSync(path.join(root, entry))`.
5. If any are missing → `ValidationError` with structured message.

Error message shape:
```
key-files paths missing on disk (block at write-summary):
  - lib/phantom.js (created)
  - docs/missing.md (modified)

Either create these files first, list real paths, or pass
--no-file-check to bypass (will be audited later).
```

## Error Handling

- `ValidationError` → caught by `bin/commands/write-summary.js` → exit 2.
- `{ checkFileExistence: false }` opt-out short-circuits the helper, returns
  `{ missing: [] }`.
- Helper never throws on its own; only the caller (`writeSummary`) decides
  whether to throw based on the result.
- Symlink handling: `fs.existsSync` follows symlinks (we want target to
  exist, not the link itself).

## Testing Strategy

| Layer | Coverage | File |
|---|---|---|
| Unit: hard-block on phantom path | +6 | `test/unit-lifecycle.js` |
| Unit: opt-out via `checkFileExistence: false` | +3 | `test/unit-lifecycle.js` |
| Unit: passes when all paths exist | +2 | `test/unit-lifecycle.js` |
| Unit: error message lists ALL missing paths (not just first) | +2 | `test/unit-lifecycle.js` |
| CLI integration: `--no-file-check` flag | +3 | `test/dryrun-write-summary.js` |

Target: ~16 new assertions.

## Alternatives Considered

### Option A — Warn instead of block

**Pros:** Friendlier; lets agent keep moving.
**Cons:** Drift cause #1 stays unresolved — warnings get ignored by
  agents and humans alike. Established `key-decisions` precedent is
  block-then-explain.
**Verdict:** rejected.

### Option B — Auto-strip missing paths

**Pros:** Self-healing; no error surface.
**Cons:** Hides drift instead of surfacing it. Agent never learns the
  files weren't really created. Breaks the "claim must match reality"
  contract that the whole milestone is built around.
**Verdict:** rejected.

### Option C — Defer check to `cplan audit` only

**Pros:** Keeps writeSummary fast; centralises drift logic.
**Cons:** Phantom paths persist on disk until next audit run. Per-phase
  SUMMARYs would carry lies in the meantime. Wastes the cheap O(N)
  check at write-time.
**Verdict:** rejected.

## Open Questions

- [ ] Should the check be case-sensitive on Windows? Currently
      `fs.existsSync` is case-insensitive on Windows by default. Acceptable
      — matches developer intuition. Revisit if cross-platform audit
      surfaces discrepancies.

## References

- Milestone DESIGN.md, Drift cause #1: forgetful executor
- Phase 17 DESIGN.md (P1 SHA pinning foundation)
- Phase 18 DESIGN.md (P2 auto key-files)
- Existing `key-decisions` hard-block: `lib/milestone.js::writeSummary` line ~495
- `ValidationError` class: `lib/milestone.js`
