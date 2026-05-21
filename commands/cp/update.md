---
name: cp-update
description: Refresh per-repo cp state (skill files, config defaults, drift fixes) after a version bump. Wraps `cp update` with helpful pre-flight and post-flight summarisation.
argument-hint: "[--dry-run | --check]"
requires: []
---

# /cp-update

You are running `cp-update`. Your job is to refresh the per-repo cp state
in this project after a cp version bump (case-4 onboarding). This is
**cp-native** — no provider involvement; the work is mechanical.

## TL;DR — recommended one-liner

If the user invoked you directly without having upgraded the global cp
package, the canonical one-liner is:

```
npx -y --package=context-planning@latest -- cp update
```

That fetches the latest cp via npx (per-user cache, no sudo) and runs
`cp update` against the current repo in one shot. Mirrors GSD's
`/gsd-update` pattern.

If the user has already upgraded the global package (e.g. via
`npm install -g context-planning@latest`), plain `cp update` does the
same per-repo work without re-fetching.

## Step 1 — Pre-flight

Before running anything, sanity-check the repo:

- Confirm `.planning/PROJECT.md` exists. If not, abort with: "This
  doesn't look like a cp project (no `.planning/PROJECT.md`). Run
  `/cp-new-project` or `/cp-map-codebase` first."
- Run `cp version` and report the installed cp CLI version.
- Run `cp doctor --quiet` and note any pre-existing errors.

## Step 2 — Parse flags

Parse `$ARGUMENTS`:

- No flags — apply the update.
- `--dry-run` — preview only, no writes.
- `--check` — exit 1 if anything would change (CI gate). Implies dry-run.

## Step 3 — Run cp update

Invoke the CLI with the parsed flags plus `--json` so you can read the
structured result:

```
cp update --json
```

(Append `--dry-run` or `--check` if the user passed them.)

Parse the JSON result. It looks like:

```json
{
  "ok": true,
  "changed": true,
  "dryRun": false,
  "steps": [
    { "step": "detect", "harnesses": ["copilot"] },
    { "step": "install", "harness": "copilot", "written": 12, "identical": 14, "userModified": 0 },
    { "step": "config-refresh", "changed": true, "summary": "schema v1 → v2, ..." },
    { "step": "audit-fix", "applied": 3, "remaining": 0, "manual": 2 }
  ]
}
```

## Step 4 — Summarise for the user

Print a friendly summary using the JSON. Use this template:

```
✓ cp update complete

  Harness:       <comma-list>
  Skill files:   <written> rewritten, <identical> unchanged, <userModified> kept (locally modified)
  Config:        <changed ? config.summary : "already up to date">
  Audit fixes:   <applied> auto-fixed (<remaining> couldn't auto-fix, <manual> need your attention)

  Next: review `git log -5` and run `cp status` to confirm where you are.
```

If `ok: false`:

- Surface the error message verbatim.
- Suggest the corrective command (`cp init` for missing planning, `cp install <harness>` for missing harness).

If `userModified > 0`:

- List the files. Explain that cp left them alone because they don't
  match the shipped template — the user may want to diff them against
  the new version and merge by hand.

If `manual > 0` from audit-fix:

- Suggest the user run `cp audit` to see the manual findings.

## Step 5 — Report

Print the summary and exit. Do NOT commit anything else — `cp update`
already commits its own changes atomically (one commit per fix).

## Notes

- **Idempotent.** Running `/cp-update` twice in a row is safe; the second
  run will report "everything already up to date."
- **Does NOT touch the npm package.** This skill only refreshes per-repo
  state. To upgrade the cp binary itself, prefix with the `npx` one-liner
  at the top of this file, or run `npm install -g context-planning@latest`
  separately.
- **No SHA backfill in v0.9.** If `cp audit` reports `missing-base-commit`
  or `missing-end-commit` findings after `cp update`, run
  `cp reconcile --all --infer-shas` deliberately. Auto-backfill is
  intentionally not part of `cp update` because it rewrites planning
  history and warrants explicit consent.
