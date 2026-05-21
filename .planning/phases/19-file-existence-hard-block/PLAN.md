---
phase: "19"
name: File-existence hard-block
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-21
base-commit: d281b7c87ed84be9bd6e22626eb99c204dff27a6
---

# Phase 19: File-existence hard-block

**Milestone**: v0.8 Consistency
**Created**: 2026-05-21
**Design**: see [DESIGN.md](./DESIGN.md)

## Goal

writeSummary refuses (exit 2, ValidationError) if any path in
`key-files.created` / `key-files.modified` is missing on disk. P2's
auto-filled entries are exempt (diff-derived → always real); only
caller-supplied phantoms get blocked. Eliminates drift cause #1.

## Success Criteria

1. `cp write-summary` with a JSON listing a non-existent file in key-files
   exits 2 with a structured ValidationError naming the missing path(s).
2. The same call with `--no-file-check` succeeds and writes the SUMMARY.
3. Both `lib/milestone.js::writeSummary` and `lib/lifecycle.js::writeSummary`
   enforce the rule (lockstep convention from phases 17/18).
4. Error message lists ALL missing paths, not just the first.
5. P2 auto-filled entries never trigger the block (diff entries are real).

## Plans

- [ ] 19-01: `_checkKeyFilesExist` helper + writeSummary hard-block (both paths)
- [ ] 19-02: `--no-file-check` CLI flag + dry-run integration test

---

## Plan 19-01 — helper + hard-block

**Files:**
- `lib/milestone.js` — add `_checkKeyFilesExist`, call it in writeSummary
  AFTER `_autoFillKeyFiles` and BEFORE the final `fm.stringify`. Throws
  `ValidationError` if `missing.length > 0`. Export helper.
- `lib/lifecycle.js` — mirror the call in its writeSummary via
  `milestone._checkKeyFilesExist`.
- `test/unit-lifecycle.js` — +13 assertions across 4 sections.

**Helper signature:**
```js
function _checkKeyFilesExist(normalised, root, opts = {}) {
  if (opts.checkFileExistence === false) return { missing: [] };
  const kf = normalised['key-files'] || {};
  const candidates = [
    ...(Array.isArray(kf.created) ? kf.created.map((p) => ({ p, kind: 'created' })) : []),
    ...(Array.isArray(kf.modified) ? kf.modified.map((p) => ({ p, kind: 'modified' })) : []),
  ];
  const missing = [];
  for (const { p, kind } of candidates) {
    if (typeof p !== 'string' || !p) continue;
    const full = path.isAbsolute(p) ? p : path.join(root, p);
    if (!fs.existsSync(full)) missing.push({ path: p, kind });
  }
  return { missing };
}
```

**Error format (in writeSummary):**
```
key-files paths missing on disk (block at write-summary):
  - lib/phantom.js (created)
  - docs/missing.md (modified)

Either create these files first, list real paths, or pass
--no-file-check to bypass (will be audited later).
```

**Tests (+13):**
- happy: all paths exist → no throw
- phantom in created → throws ValidationError, message names the path
- phantom in modified → throws ValidationError
- multiple phantoms → error message lists ALL of them
- `checkFileExistence: false` opt-out → no throw even with phantoms
- absolute path in key-files → checked as-is (not joined with root)
- auto-filled entry only (no caller phantoms) → no throw
- caller phantom + auto-fill → still throws on the phantom
- empty `key-files` (P2 silent skip) → no throw
- non-string entries silently ignored (no crash)
- helper returns `{ missing: [] }` when opt-out
- helper is pure (no side effects on `normalised`)
- ValidationError thrown is the milestone.ValidationError class

**Verify:** `node test/unit-lifecycle.js` green; `npm test` green.

**Commit:** `cp(19-01): file-existence hard-block in writeSummary`

---

## Plan 19-02 — CLI flag + dogfood

**Files:**
- `bin/commands/write-summary.js` — parse `--no-file-check` flag → pass
  `{ checkFileExistence: false }`. Update usage string.
- `test/dryrun-write-summary.js` — extend with 3 sections:
  - phantom path without flag → exit 2 + error message
  - phantom path WITH `--no-file-check` → exit 0
  - usage string mentions `--no-file-check`

**Tests (+6 assertions):**
- exit code 2 when phantom path
- stderr contains "missing on disk"
- stderr lists the phantom path
- exit code 0 with `--no-file-check`
- summary file written with phantom path when opted out
- usage string mentions `--no-file-check`

**Dogfood:**
After 19-01+19-02 ship, write SUMMARYs via:
```
cp write-summary 19-01 --from <json>
cp write-summary 19-02 --from <json>
```
Then deliberately try writing one with `affects: ["lib/nonexistent.js"]`
in the JSON — assert it fails with the expected error. Then overwrite
with valid paths to ship the real SUMMARY.

**Commit:** `cp(19-02): write-summary --no-file-check CLI flag + integration test`

---

## Notes

- Lockstep rule (from Phase 17/18): both writeSummary code paths must
  carry the same check. Test both.
- `path.isAbsolute(p)` check needed so absolute key-files (rare) don't
  get double-joined with `root`.
- `fs.existsSync` behaviour: returns false if path doesn't exist OR if
  permission denied. Acceptable — permission denied is itself a drift
  signal worth blocking.
- Helper export pattern matches Phase 18's `_autoFillKeyFiles` /
  `_extractPhaseBaseCommit`: underscored, exported for direct unit
  testing, not part of the documented public API.
