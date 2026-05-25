# Roadmap: context-planning

## Overview

<!-- One paragraph: the journey from here to shipped. -->

## Phases

<details>
<summary>✅ v0.9 Onboarding (Phases 1-35) — SHIPPED 2026-05-21</summary>

<details>
<summary>✅ v0.8 Consistency (Phases 1-31) — SHIPPED 2026-05-21</summary>

<details>
<summary>✅ v0.7 Design Capture (Phases 1-16) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.6 Quality Wave (Phases 1-15) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.5 — Generic provider/harness detection (Phases 1-10) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.4 — Polish & Capture (Phases 1-5) — SHIPPED 2026-05-20</summary>

<!--
  Milestone heading shape (parsed by lib/milestone.js findMilestoneInRoadmap):
    ### 🚧 v0.1 — name (In Progress)     (active)
    ### 📋 v0.2 — name (Planned)          (queued)
    ### ✅ v0.1 — name (Shipped YYYY-MM-DD) — wraps a <details> block after close-out

  Phase heading shape (must follow a milestone heading):
    ### Phase 1: name
    ### Phase 2.1: name    (decimal = urgent insert between integers)

  After /cp-complete-milestone the milestone heading is replaced with a collapsed
  <details><summary>...</summary>...</details> block; phase headings remain inside.

  Start your first milestone with:
    cp scaffold-milestone "v0.1 — <your milestone name>"
    cp scaffold-phase 1 --name "<phase name>" --plans <count>
-->


### Phase 1: cp-capture command

Plans:
- [x] 01-01: `lib/inbox.js` pure helpers + `test/unit-inbox.js` (45 assertions)
- [x] 01-02: `cp capture` + `cp inbox` CLI handlers in `bin/cp.js`
- [x] 01-03: `/cp-capture` slash command + `templates/INBOX.md`

### Phase 2: Status-line hook

Plans:
- [x] 02-01: `cmdStatusline` handler in `bin/cp.js` with token format `%M %P %D %N %B`
- [x] 02-02: `test/unit-statusline.js` (28 assertions) — silent-outside-project invariant + color gating

### Phase 1.5: Map codebase

Plans:
- [x] 1.5-01: `lib/codebase-mapper.js` + 7 template stubs in `templates/codebase/`
- [x] 1.5-02: `cp scaffold-codebase` + `cp codebase-status` CLI handlers
- [x] 1.5-03: `/cp-map-codebase` slash command with 4-agent parallel dispatch protocol

### Phase 3: Cursor + Aider installers

Plans:
- [x] 03-01: `install/cursor.js` with `buildRule()` frontmatter synthesis
- [x] 03-02: `install/aider.js` with `buildContextBriefing()` + `patchAiderConfig()` + `test/unit-installers.js` (50 assertions)

### Phase 4: git worktree integration

Plans:
- [x] 04-01: `lib/worktree.js` (~190 LOC) + `bin/cp.js cmdWorktree{Create,List,Remove}` + `test/unit-worktree.js` (56 assertions)

### Phase 5: Dogfood hotfix

Plans:
- [x] 05-01: `install/aider.js` → switch to `yaml` parser + auto-migrate legacy fenced blocks (+8 test assertions)
- [x] 05-02: `lib/worktree.js` → extract `runGitWorktreeAdd/Remove` + `listGitWorktrees` from `bin/cp.js` (+6 test assertions)

</details>

### Phase 6: Schema + detection core

Plans:
- [x] 06-01: Schema v2 in templates/config.json + lib/detect.js with expandRoot + detectProviderAtAnyHarness + detectAllInstalled
- [x] 06-02: Slim lib/provider.js — move existsAnywhere/detectProvider to detect.js, rewire resolveSkill, re-export for back-compat
- [x] 06-03: test/unit-detect.js — 6 host fixtures, ~40 assertions covering expandRoot + detection + legacy back-compat

### Phase 7: cp doctor rewrite

Plans:
- [x] 07-01: Rewrite cmdDoctor in bin/cp.js — sectioned output (harnesses → providers → configured → roles), --json and --quiet flags
- [x] 07-02: test/dryrun-doctor.js — ~25 assertions covering sectioned output, --json shape, --quiet, exit codes

### Phase 8: Auto-heal merge + cp config refresh

Plans:
- [x] 08-01: lib/merge.js with mergeCpDefaults + loadConfig auto-write + cp config refresh command
- [x] 08-02: test/unit-merge.js + test/dryrun-config-refresh.js — ~75 assertions covering merge rules + brownfield fixtures

### Phase 9: Echo-provider stub + installer

Plans:
- [x] 09-01: echo-provider installer (cp install echo-provider --local) + SKILL.md stub
- [x] 09-02: End-to-end verification: install echo-provider, switch workflow_provider, cp doctor shows all roles → echo

### Phase 10: Migration docs + CHANGELOG

Plans:
- [x] 10-01: docs/MIGRATION-v0.5.md + CHANGELOG v0.5.0 + README badge update + version bump to 0.5.0

</details>

### Phase 11: Command decomposition

Plans:
- [x] 11-01: TBD
- [x] 11-02: TBD
- [x] 11-03: TBD

### Phase 12: Dual-binary cplan + cp alias

Plans:
- [x] 12-01: TBD
- [x] 12-02: TBD

### Phase 13: GitHub Actions CI

Plans:
- [x] 13-01: TBD
- [x] 13-02: TBD

### Phase 14: Coverage with c8

Plans:
- [x] 14-01: TBD
- [x] 14-02: TBD

### Phase 15: Docs + v0.6.0 release

Plans:
- [x] 15-01: TBD

</details>

### Phase 16: design capture infrastructure

Plans:
- [x] 16-01: TBD
- [x] 16-02: TBD
- [x] 16-03: TBD

</details>

### Phase 17: SHA pinning foundation

Plans:
- [x] 17-01: TBD
- [x] 17-02: TBD

### Phase 18: Auto key-files at write-time

Plans:
- [x] 18-01: TBD
- [x] 18-02: TBD

### Phase 19: File-existence hard-block

Plans:
- [x] 19-01: TBD

### Phase 20: Derived STATE.md

Plans:
- [x] 20-01: TBD
- [x] 20-02: TBD

### Phase 21: Plan-time expected-key-files

Plans:
- [x] 21-01: TBD
- [x] 21-02: TBD

### Phase 22: scaffold-phase prior-summary check

Plans:
- [x] 22-01: TBD

### Phase 23: complete-milestone audit gate

Plans:
- [x] 23-01: TBD

### Phase 24: cplan audit detection

Plans:
- [x] 24-01: TBD
- [x] 24-02: TBD
- [x] 24-03: TBD

### Phase 25: cplan audit --fix loop

Plans:
- [x] 25-01: TBD
- [x] 25-02: TBD

### Phase 26: Repair commands

Plans:
- [x] 26-01: TBD
- [x] 26-02: TBD
- [x] 26-03: TBD

### Phase 27: Pre-commit hook smart shim

Plans:
- [x] 27-01: TBD
- [x] 27-02: TBD

### Phase 28: Post-commit hook tick auto

Plans:
- [x] 28-01: TBD

### Phase 29: CI template + backfill

Plans:
- [x] 29-01: TBD
- [x] 29-02: TBD

### Phase 30: Agent literacy injection

Plans:
- [x] 30-01: TBD
- [x] 30-02: TBD

### Phase 31: Docs + v0.8.0 release

Plans:
- [x] 31-01: TBD
- [x] 31-02: TBD

</details>

### Phase 32: map-codebase auto-init

Plans:
- [x] 32-01: TBD

### Phase 33: cp update command

Plans:
- [x] 33-01: TBD
- [x] 33-02: TBD

### Phase 34: README onboarding decision matrix

Plans:
- [x] 34-01: TBD

### Phase 35: DESIGN.md lifecycle polish

Plans:
- [x] 35-01: TBD

</details>

<details>
<summary>✅ v0.10 Autonomy (Phases 36-38) — SHIPPED 2026-05-21</summary>

### Phase 36: cp autonomous CLI + lib helper

Plans:
- [x] 36-01: TBD

### Phase 37: /cp-autonomous slash skill

Plans:
- [x] 37-01: TBD

### Phase 38: Docs + v0.10.0 release

Plans:
- [x] 38-01: TBD

</details>

<details>
<summary>✅ v0.10.1 Collapse-aware milestone close (Phases 39-39) — SHIPPED 2026-05-22</summary>

### Phase 39: collapse-aware-complete-milestone

Plans:
- [x] 39-01: TBD

</details>

<details>
<summary>✅ v1.0 Workflow Engine (Phases 40-42) — SHIPPED 2026-05-25</summary>

### Phase 40: Core engine + custom tier

Plans:
- [x] 40-01: TBD
- [x] 40-02: TBD
- [x] 40-03: TBD

### Phase 41: CLI surface + built-in templates + AI authoring

Plans:
- [x] 41-01: TBD
- [x] 41-02: TBD
- [x] 41-03: TBD

### Phase 42: Docs + v1.0.0 release

Plans:
- [x] 42-01: TBD

</details>
## Progress

**Execution Order:**
Phases execute in numeric order (decimal phases like 2.1 are urgent inserts between integers).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| *(none yet — run `cp scaffold-phase 1 --name <name> --plans <count>`)* | | | | |

