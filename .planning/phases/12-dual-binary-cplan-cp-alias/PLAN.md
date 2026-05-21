---
phase: "12"
name: Dual-binary cplan + cp alias
milestone: v0.6 Quality Wave
status: in-progress
created: 2026-05-20
base-commit: a709a75710391d7521f752e0e27ef582230a7930
---

# Phase 12: Dual-binary `cplan` + `cp` alias

**Milestone**: v0.6 Quality Wave
**Created**: 2026-05-20

## Goal

Ship a second binary name (`cplan`) alongside `cp` so PowerShell users
don't collide with the built-in `Copy-Item` (aliased to `cp`). Both
binaries point at the same entry script — they are siblings, not a
chain. Documentation steers new users toward `cplan`; existing `cp`
users see no change.

## Success Criteria

1. `npm link` installs both `cplan` and `cp` on PATH.
2. `cplan version`, `cp version` produce identical output.
3. PowerShell `cplan doctor` runs the cp binary (NOT `Copy-Item`).
4. `bin/cp.js` is the single source — no code duplication.
5. README, `cp help`, and `cp doctor` mention both names.
6. CHANGELOG entry for v0.6 calls out the new canonical name.

## Plans

- [x] 12-01: Add `cplan` bin entry in package.json + thin shim script + npm-link re-deploy
- [x] 12-02: Update README, `cp help`, doctor banner to reference `cplan` as canonical

## Notes

### Why a shim instead of bin map duplication

Node's package.json `bin` map accepts:

```json
"bin": { "cp": "bin/cp.js", "cplan": "bin/cp.js" }
```

This works — npm creates two distinct symlinks/cmd-shims, both pointing
at the same script. No extra file needed. Approach: just add the second
key.

### PowerShell verification

After `npm link`, in PowerShell:

```pwsh
Get-Command cplan
# Should resolve to C:\ProgramData\global-npm\cplan.cmd
cplan version
# 0.6.0
```

`Get-Command cp` will still show PowerShell's `Copy-Item` alias first —
that's expected and unavoidable. `cp.cmd` continues to work for users
who prefer the legacy short name. Use `Remove-Alias cp` (in $PROFILE) if
you want to expose our binary as bare `cp`.

### Backward compatibility

The PowerShell `cp` alias issue is *not* a cp bug — it's a PowerShell
default. We don't change `cp.cmd`; we just offer `cplan` as an
unambiguous alternative.
