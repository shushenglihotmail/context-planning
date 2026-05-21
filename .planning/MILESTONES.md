# Project Milestones: context-planning

<!-- Entries in reverse chronological order — newest first.
     Append a block via /cp-complete-milestone. -->

<!-- Template per milestone:

## v[X.Y] [Name] (Shipped: YYYY-MM-DD)

**Delivered:** [One sentence describing what shipped]

**Phases completed:** [X-Y] ([Z] plans total)

**Key accomplishments:**
- [Major achievement 1]
- [Major achievement 2]
- [Major achievement 3]

**Stats:**
- [X] files created/modified
- [Y] lines of code (primary language)
- [Z] phases, [N] plans

**Git range:** `feat(XX-XX)` → `feat(YY-YY)`

**What's next:** [Brief description of next milestone goals]

---
-->

## v0.4 — Polish & Capture  — shipped 2026-05-20

**Phases:** 1-5    **Plans:** 13    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`

## v0.5 — Generic provider/harness detection  — shipped 2026-05-20

**Phases:** 1-10    **Plans:** 23    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`

## v0.6 Quality Wave  — shipped 2026-05-20

**Phases:** 1-15    **Plans:** 33    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`
- Phase 11: Command decomposition — see `.planning/phases/11-command-decomposition/`
- Phase 12: Dual-binary cplan + cp alias — see `.planning/phases/12-dual-binary-cplan-cp-alias/`
- Phase 13: GitHub Actions CI — see `.planning/phases/13-github-actions-ci/`
- Phase 14: Coverage with c8 — see `.planning/phases/14-coverage-with-c8/`
- Phase 15: Docs + v0.6.0 release — see `.planning/phases/15-docs-v0-6-0-release/`

## v0.7 Design Capture  — shipped 2026-05-20

**Phases:** 1-16    **Plans:** 36    **Duration:** —

**Subsystems touched:** design

**Key decisions:**
- Inbox writes stay as pure file-IO helpers that return action lists so higher-level commands can apply atomic changes safely.  _(phase 1)_
- cp capture and cp inbox use timestamped inbox entries plus scoped path-based commits so triage stays audit-friendly.  _(phase 1)_
- The slash flow and seeded INBOX template share a fixed destination vocabulary so human and CLI triage follow the same routing model.  _(phase 1)_
- The statusline stays silent outside cp projects while exposing tokenized text and JSON output inside a planning repo.  _(phase 2)_
- ANSI styling is gated on TTY and NO_COLOR so the statusline remains safe for prompts, logs, and tests.  _(phase 2)_
- Codebase mapping always scaffolds the same seven docs and distinguishes stub versus filled files with a heuristic check.  _(phase 1.5)_
- Codebase mapping ships through dedicated scaffold-codebase and codebase-status CLIs with an explicit force flag for clobbering.  _(phase 1.5)_
- cp map-codebase fans out to four specialized sub-agents that write docs directly to keep orchestrator context small.  _(phase 1.5)_
- The Cursor installer synthesizes rule files and an ambient alwaysApply context file instead of shipping static copies.  _(phase 3)_
- The Aider installer writes one shared CP-CONTEXT briefing plus per-command files and patches config read blocks automatically.  _(phase 3)_
- Worktrees live as sibling directories tracked in WORKTREES.md with cp-slug branch defaults and optional provider integration.  _(phase 4)_
- Aider config edits switched from regex block replacement to YAML parse-stringify so existing read entries survive migration.  _(phase 5)_
- All worktree shell-outs moved into lib helpers so bin handlers stay as thin dispatch layers.  _(phase 5)_
- Provider detection moved to a v2 harness schema with plugin shape metadata and a centralized lib-detect implementation.  _(phase 6)_
- lib provider resolution now delegates to detect.js while keeping back-compat exports intact.  _(phase 6)_
- Claude detection uses flat plugin_roots semantics and the new detect behavior is locked down with dedicated unit coverage.  _(phase 6)_
- cp doctor became a sectioned diagnostic with JSON and quiet modes instead of a single free-form report.  _(phase 7)_
- Doctor output contracts are enforced with dedicated dry-run coverage for human output, JSON, quiet mode, and exit codes.  _(phase 7)_
- Config loading now auto-heals brownfield defaults through mergeCpDefaults and exposes a manual cp config refresh escape hatch.  _(phase 8)_
- Merge behavior is pinned down with brownfield, idempotency, and dry-run tests before config refresh writes user files.  _(phase 8)_
- The echo-provider installs as a sentinel-backed stub under .planning providers so schema paths can be tested without real integrations.  _(phase 9)_
- Provider-schema generality was proven by switching workflow_provider to echo-provider and verifying all nine roles end to end.  _(phase 9)_
- The v0.5.0 release ships with a paired changelog and migration guide so schema changes are documented alongside the version bump.  _(phase 10)_
- The first extraction wave moved core handlers into bin commands modules behind registry-first dispatch while preserving legacy fall-through.  _(phase 11)_
- Command decomposition continued until every remaining CLI action had its own dedicated handler module in the registry.  _(phase 11)_
- bin cp became a thin dispatcher while keeping public exports stable for tests and external require callers.  _(phase 11)_
- The package bin map now ships both cplan and cp so Windows users can avoid PowerShell conflicts without losing the old name.  _(phase 12)_
- Docs, help text, and doctor output treat cplan as the canonical name while preserving cp as a supported alias.  _(phase 12)_
- CI runs a cross-platform GitHub Actions matrix on Ubuntu and Windows across Node 20 and 22 to catch environment-specific regressions.  _(phase 13)_
- Windows path handling normalizes real paths so worktree and statusline checks survive short-path behavior on GitHub runners.  _(phase 13)_
- c8 became the single coverage tool with enforced 85 line and 75 branch thresholds wired into npm scripts.  _(phase 14)_
- Coverage enforcement runs as a dedicated CI job after the test matrix and publishes the report as an artifact.  _(phase 14)_
- The v0.6.0 release was cut as one coordinated changelog, version bump, git tag, and GitHub release update.  _(phase 15)_
- Union ADR + SP-brainstorm template (single file, both tiers, tier-key substitution)  _(phase 16)_
- scaffoldPhase emits 3 actions: ROADMAP + PLAN + DESIGN  _(phase 16)_
- scaffoldMilestone creates milestones/<slug>/DESIGN.md  _(phase 16)_
- aggregateSummaries adds phaseDesignRefs[] deduped per phase  _(phase 16)_
- MILESTONE-CONTEXT.md promoted to milestone DESIGN.md atomically at complete-milestone, then deleted  _(phase 16)_
- Append-only REVIEW-LOG.md with marker anchor  _(phase 16)_
- scaffoldPhase emits 4th action (REVIEW-LOG.md)  _(phase 16)_
- Regex /^##\s+\d{4}-\d{2}-\d{2}/gm counts entries  _(phase 16)_
- cp-execute-phase Step 4.5 instructs orchestrator (skill-level, no upstream SP code changes)  _(phase 16)_
- writeSummary throws ValidationError (name+code) on empty key-decisions  _(phase 16)_
- Exact error message includes Unicode greater-or-equal so users can grep  _(phase 16)_
- CLI exit code 2 for input-validation (distinct from 1 for runtime errors)  _(phase 16)_
- Backfilled 33 existing SUMMARYs to satisfy new constraint  _(phase 16)_

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`
- Phase 11: Command decomposition — see `.planning/phases/11-command-decomposition/`
- Phase 12: Dual-binary cplan + cp alias — see `.planning/phases/12-dual-binary-cplan-cp-alias/`
- Phase 13: GitHub Actions CI — see `.planning/phases/13-github-actions-ci/`
- Phase 14: Coverage with c8 — see `.planning/phases/14-coverage-with-c8/`
- Phase 15: Docs + v0.6.0 release — see `.planning/phases/15-docs-v0-6-0-release/`
- Phase 16: design capture infrastructure — see `.planning/phases/16-design-capture-infrastructure/`

## v0.8 Consistency  — shipped 2026-05-21

**Phases:** 1-31    **Plans:** 66    **Duration:** 45min, 20min, 1 session, 1 session, 1 session, 1 session, ~1h, ~25min

**Requirements delivered:** v0.8 P1 part 1 of 2: base-commit on PLAN.md, v0.8 P1 part 2 of 2: end-commit on SUMMARY.md, P2 auto-fill key-files at write-time, P2 CLI opt-out flag, P3 file-existence hard-block, P3 CLI opt-out flag, Drift cause #2: stale STATE — eliminated for tick/write-summary/scaffold-phase/complete-milestone, Tier 3 repair surface for STATE drift exposed as user-facing verb

**Subsystems touched:** design, tooling, milestone, cli, state, lib/milestone + lib/lifecycle + templates, bin/commands/write-summary, lib/lifecycle, bin/commands/scaffold-phase, audit-repair, hooks, ci

**Key decisions:**
- Inbox writes stay as pure file-IO helpers that return action lists so higher-level commands can apply atomic changes safely.  _(phase 1)_
- cp capture and cp inbox use timestamped inbox entries plus scoped path-based commits so triage stays audit-friendly.  _(phase 1)_
- The slash flow and seeded INBOX template share a fixed destination vocabulary so human and CLI triage follow the same routing model.  _(phase 1)_
- The statusline stays silent outside cp projects while exposing tokenized text and JSON output inside a planning repo.  _(phase 2)_
- ANSI styling is gated on TTY and NO_COLOR so the statusline remains safe for prompts, logs, and tests.  _(phase 2)_
- Codebase mapping always scaffolds the same seven docs and distinguishes stub versus filled files with a heuristic check.  _(phase 1.5)_
- Codebase mapping ships through dedicated scaffold-codebase and codebase-status CLIs with an explicit force flag for clobbering.  _(phase 1.5)_
- cp map-codebase fans out to four specialized sub-agents that write docs directly to keep orchestrator context small.  _(phase 1.5)_
- The Cursor installer synthesizes rule files and an ambient alwaysApply context file instead of shipping static copies.  _(phase 3)_
- The Aider installer writes one shared CP-CONTEXT briefing plus per-command files and patches config read blocks automatically.  _(phase 3)_
- Worktrees live as sibling directories tracked in WORKTREES.md with cp-slug branch defaults and optional provider integration.  _(phase 4)_
- Aider config edits switched from regex block replacement to YAML parse-stringify so existing read entries survive migration.  _(phase 5)_
- All worktree shell-outs moved into lib helpers so bin handlers stay as thin dispatch layers.  _(phase 5)_
- Provider detection moved to a v2 harness schema with plugin shape metadata and a centralized lib-detect implementation.  _(phase 6)_
- lib provider resolution now delegates to detect.js while keeping back-compat exports intact.  _(phase 6)_
- Claude detection uses flat plugin_roots semantics and the new detect behavior is locked down with dedicated unit coverage.  _(phase 6)_
- cp doctor became a sectioned diagnostic with JSON and quiet modes instead of a single free-form report.  _(phase 7)_
- Doctor output contracts are enforced with dedicated dry-run coverage for human output, JSON, quiet mode, and exit codes.  _(phase 7)_
- Config loading now auto-heals brownfield defaults through mergeCpDefaults and exposes a manual cp config refresh escape hatch.  _(phase 8)_
- Merge behavior is pinned down with brownfield, idempotency, and dry-run tests before config refresh writes user files.  _(phase 8)_
- The echo-provider installs as a sentinel-backed stub under .planning providers so schema paths can be tested without real integrations.  _(phase 9)_
- Provider-schema generality was proven by switching workflow_provider to echo-provider and verifying all nine roles end to end.  _(phase 9)_
- The v0.5.0 release ships with a paired changelog and migration guide so schema changes are documented alongside the version bump.  _(phase 10)_
- The first extraction wave moved core handlers into bin commands modules behind registry-first dispatch while preserving legacy fall-through.  _(phase 11)_
- Command decomposition continued until every remaining CLI action had its own dedicated handler module in the registry.  _(phase 11)_
- bin cp became a thin dispatcher while keeping public exports stable for tests and external require callers.  _(phase 11)_
- The package bin map now ships both cplan and cp so Windows users can avoid PowerShell conflicts without losing the old name.  _(phase 12)_
- Docs, help text, and doctor output treat cplan as the canonical name while preserving cp as a supported alias.  _(phase 12)_
- CI runs a cross-platform GitHub Actions matrix on Ubuntu and Windows across Node 20 and 22 to catch environment-specific regressions.  _(phase 13)_
- Windows path handling normalizes real paths so worktree and statusline checks survive short-path behavior on GitHub runners.  _(phase 13)_
- c8 became the single coverage tool with enforced 85 line and 75 branch thresholds wired into npm scripts.  _(phase 14)_
- Coverage enforcement runs as a dedicated CI job after the test matrix and publishes the report as an artifact.  _(phase 14)_
- The v0.6.0 release was cut as one coordinated changelog, version bump, git tag, and GitHub release update.  _(phase 15)_
- Union ADR + SP-brainstorm template (single file, both tiers, tier-key substitution)  _(phase 16)_
- scaffoldPhase emits 3 actions: ROADMAP + PLAN + DESIGN  _(phase 16)_
- scaffoldMilestone creates milestones/<slug>/DESIGN.md  _(phase 16)_
- aggregateSummaries adds phaseDesignRefs[] deduped per phase  _(phase 16)_
- MILESTONE-CONTEXT.md promoted to milestone DESIGN.md atomically at complete-milestone, then deleted  _(phase 16)_
- Append-only REVIEW-LOG.md with marker anchor  _(phase 16)_
- scaffoldPhase emits 4th action (REVIEW-LOG.md)  _(phase 16)_
- Regex /^##\s+\d{4}-\d{2}-\d{2}/gm counts entries  _(phase 16)_
- cp-execute-phase Step 4.5 instructs orchestrator (skill-level, no upstream SP code changes)  _(phase 16)_
- writeSummary throws ValidationError (name+code) on empty key-decisions  _(phase 16)_
- Exact error message includes Unicode greater-or-equal so users can grep  _(phase 16)_
- CLI exit code 2 for input-validation (distinct from 1 for runtime errors)  _(phase 16)_
- Backfilled 33 existing SUMMARYs to satisfy new constraint  _(phase 16)_
- headSha is a pure helper (no caching); caller passes cwd explicitly  _(phase 17)_
- Single stderr warning per process when git is missing (not per call)  _(phase 17)_
- Forward-only stamping: null SHA leaves template comment line in place, never throws  _(phase 17)_
- Template comment line is the visible signal that base-commit is unset (vs accidental loss)  _(phase 17)_
- Both writeSummary code paths (lib/milestone.js canonical + lib/lifecycle.js internal) stamp end-commit identically to avoid divergence  _(phase 17)_
- Caller-supplied end-commit in summaryData is preserved (not overwritten) — supports manual stamping for reconcile flows in phase 26  _(phase 17)_
- Stamping happens via frontmatter object injection (cleaner than the string-level approach used for PLAN.md, because writeSummary already constructs an object that goes through fm.stringify)  _(phase 17)_
- SUMMARY.md template intentionally not modified — end-commit is an output, not a placeholder  _(phase 17)_
- Renames + copies normalised to status=M with new-path only (one entry, deliverable-focused)  _(phase 18)_
- Caller-supplied key-files entries are preserved verbatim and deduped against diff entries  _(phase 18)_
- .planning/ paths filtered out at union step (cp bookkeeping is not phase deliverable)  _(phase 18)_
- auto-fill is silent when base-commit is absent (forward-compat with pre-v0.8 PLAN.md)  _(phase 18)_
- Both writeSummary code paths (lib/milestone.js + lib/lifecycle.js) extended in lockstep to avoid divergence  _(phase 18)_
- endSha computed once near top of writeSummary and reused for both stamping (P1) and diff (P2)  _(phase 18)_
- Flag name --no-auto-key-files (negative form mirrors --no-X convention; default behavior is positive auto-fill)  _(phase 18)_
- Spawn-based integration test (executes real cp.js binary) chosen over unit-mocking the CLI parser, to catch wiring regressions  _(phase 18)_
- Usage string explicitly lists --no-auto-key-files so users can discover it from `cp write-summary` with no args  _(phase 18)_
- Block-then-explain pattern (mirrors key-decisions hard-block from v0.7) chosen over warn-only and auto-strip alternatives — drift cause #1 needs surfacing not hiding  _(phase 19)_
- Check runs AFTER P2 auto-fill so diff-derived entries (always real) are exempt; only caller-supplied phantoms trigger  _(phase 19)_
- Both writeSummary code paths (lib/milestone.js + lib/lifecycle.js) extended in lockstep per the convention from phases 17/18  _(phase 19)_
- Error message lists ALL missing paths in one shot (not just first) so agent can fix everything in one re-try  _(phase 19)_
- Absolute paths checked as-is (not joined with root); supports rare absolute key-files entries  _(phase 19)_
- Existing tests that wrote phantom paths (src/a.js, src/b.js) updated to pre-create files OR opt out — surfaces test intent (existence vs union semantics)  _(phase 19)_
- Flag name --no-file-check (negative form mirrors --no-auto-key-files from Phase 18)  _(phase 19)_
- Spawn-based integration test pattern (mkFixture + runCp) reused from Phase 18 — proves CLI plumbing end-to-end, not just the lib function  _(phase 19)_
- deriveState reuses statusReport rather than re-implementing milestone detection  _(phase 20)_
- Preserve existing Last activity line when no cp commit is found, so callers like completeMilestone keep their context-specific message  _(phase 20)_
- Force Idle status + 0% when no in-progress milestone, even if old phases still appear in ROADMAP  _(phase 20)_
- Lazy require state from lib/milestone to avoid cyclic load (state -> lifecycle -> milestone)  _(phase 20)_
- state is a multi-subcommand verb (state regen) for future room: state diff, state reset etc.  _(phase 20)_
- Exit 0 for skipped (missing .planning) — non-error so wrappers/CI can call it safely  _(phase 20)_
- Default emits one-line summary; --quiet suppresses all output for hook usage  _(phase 20)_
- Two shapes for expected-key-files frontmatter: flat array (phase-wide) or object keyed by plan id (with sibling-SUMMARY union)  _(phase 21)_
- Soft by default - drift -> stderr notice + key-decisions appendage; strictExpected=true raises ValidationError  _(phase 21)_
- P5 runs after P2/P3 in writeSummary, before end-commit stamp; .planning/ paths filtered from actual side  _(phase 21)_
- Two new CLI flags: --no-expected-check (skip P5 entirely) and --strict-expected (hard-block on drift, exit 2)  _(phase 21)_
- Defaults preserve soft behavior - drift emits stderr notice + key-decisions sentence but does not block  _(phase 21)_
- Dryrun integration test in test/dryrun-write-summary.js covers default/strict/opt-out paths  _(phase 21)_
- Tier 2 hard gate (not warning): refuse scaffold-phase N when phase N-1 has ticked plans without SUMMARY.md  _(phase 22)_
- _priorPhaseAudit returns null when no prior exists; fail-open on internal errors so audit bugs never block scaffolding  _(phase 22)_
- Only check immediately preceding phase (N-1) - broader sweeps belong to phase 23 (complete-milestone) and 24 (cplan audit)  _(phase 22)_
- expected-vs-actual drift: 4 unexpected (test/dryrun-scaffold-phase.js, bin/commands/_usage.js, bin/commands/scaffold-phase.js, package.json)  _(phase 22)_
- Distinct exit code 2 for drift block (separate from generic exit 1) so callers/CI can distinguish drift from other failures  _(phase 22)_
- Pretty-printed refusal message names the actionable next step (cp write-summary <id>) - drift defense should always suggest a remediation  _(phase 22)_
- --force notice fires unconditionally on stderr (audit transparency) - even when no drift would have been detected  _(phase 22)_
- expected-vs-actual drift: 1 unexpected (bin/commands/_usage.js)  _(phase 22)_
- MEDIUM blocks by default — drift compounds silently otherwise  _(phase 23)_
- Fail-closed on runAudit throw — refuse to ship blind  _(phase 23)_
- Exit 2 distinct from generic 1 so CI can route audit failure separately  _(phase 23)_
- Legacy tests use noAudit:true to preserve original assertions while gate is on by default for users  _(phase 23)_
- expected-vs-actual drift: 3 unexpected (test/dryrun-complete-milestone-audit.js, package.json, test/unit-atomic.js); 1 expected-but-untouched (test/dryrun-complete-milestone.js)  _(phase 23)_
- Check fn signature: (root, ctx) -> [findings] for easy extension  _(phase 24)_
- Explicit sevRank lookup function to avoid 0-falsy bug from || operator  _(phase 24)_
- state-stale uses regenerate dryRun mode to inherit last-activity preservation logic  _(phase 24)_
- Per-check errors caught into check-error LOW finding (fail-soft per check)  _(phase 24)_
- expected-vs-actual drift: 7 unexpected (bin/commands/audit.js, test/dryrun-audit.js, CHANGELOG.md, bin/commands/_usage.js, bin/commands/index.js, lib/git.js, package.json)  _(phase 24)_
- Exit-code separation: 0 / 1 / 2 lets CI distinguish noise from drift  _(phase 24)_
- --json shape: {findings, summary, exit_code} stable for tooling  _(phase 24)_
- --strict explicit override emits notice; default sev-based behavior  _(phase 24)_
- Phase post-filter so --phase 99 produces empty result not project-wide findings  _(phase 24)_
- expected-vs-actual drift: 2 unexpected (CHANGELOG.md, lib/git.js)  _(phase 24)_
- Unreleased CHANGELOG block describes full Tier 1+2 ship surface for v0.8 in progress  _(phase 24)_
- STRUCTURE.md drift defense section is the codebase-map pointer to lib/audit.js et al  _(phase 24)_
- Did not backfill legacy phase SHAs now — defer to phase 29 dedicated reconcile command  _(phase 24)_
- expected-vs-actual drift: 2 unexpected (CHANGELOG.md, lib/git.js); 2 expected-but-untouched (.planning/codebase/STRUCTURE.md, .planning/CHANGELOG.md)  _(phase 24)_
- Pluggable FIXERS registry — phase 26 will append reconcile/supersede/deviate  _(phase 25)_
- Default --max 5 matches GSD  _(phase 25)_
- atomic commit subject format cp(audit-fix): {id} {location}  _(phase 25)_
- Stop loop on first fixer error vs collect-all — atomicity > completeness  _(phase 25)_
- tickPlan no-op throw makes summary-without-tick safe to re-run  _(phase 25)_
- expected-vs-actual drift: 4 unexpected (test/dryrun-audit-fix.js, bin/commands/_usage.js, bin/commands/audit.js, package.json)  _(phase 25)_
- --interactive accepted but deferred to avoid TTY complexity in v0.8 MVP  _(phase 25)_
- Exit 2 when manual findings remain alerts user without --strict  _(phase 25)_
- --fix shares detect-mode filters (--milestone, --phase) for free  _(phase 25)_
- Validation of --max in CLI not lib keeps registry pure  _(phase 25)_
- FIXERS additions for missing-base-commit/missing-end-commit delegate to reconcile.reconcileFinding so the audit-fix loop applies SHA backfill atomically — no separate code path.  _(phase 26)_
- Inference uses generic git log + post-filter (cp(NN-MM) regex) instead of --grep with phaseNum, to tolerate zero-padded plan IDs like 01-01 from older commits.  _(phase 26)_
- _findPhaseDir strips leading zeros so reconcile is callable with phaseNum from either listings ('1') or commit subjects ('01').  _(phase 26)_
- expected-vs-actual drift: 11 unexpected (bin/commands/deviate.js, bin/commands/supersede.js, test/dryrun-scaffold-continue.js, test/dryrun-supersede-deviate.js, test/unit-supersede-deviate.js, bin/commands/index.js, test/unit-audit-fix.js, CHANGELOG.md, bin/commands/scaffold-phase.js, lib/lifecycle.js, lib/roadmap.js)  _(phase 26)_
- Supersede uses [~] checkbox marker (extending roadmap.setPlanDone regex to accept [~] for idempotency). Distinct from done/undone semantics.  _(phase 26)_
- Both supersede and deviate append to '## Notes' if present, else append a new ## Notes section. Avoids fragile per-plan-section parsing.  _(phase 26)_
- Deviation block always creates a fresh '## Deviation YYYY-MM-DD' heading so multiple deviations accumulate; no de-duplication.  _(phase 26)_
- expected-vs-actual drift: 6 unexpected (test/dryrun-scaffold-continue.js, lib/roadmap.js, bin/commands/index.js, CHANGELOG.md, bin/commands/scaffold-phase.js, test/unit-audit-fix.js)  _(phase 26)_
- --continue is semantically distinct from --force: both bypass the prior-summary gate, but --continue stamps a 'Continues from phase N-1' note in the new PLAN.md, while --force is silent. Users choose based on whether the carryover should be auditable.  _(phase 26)_
- The Continues-from note includes the list of missing summaries from the prior phase, making the carry-over self-documenting in PLAN.md without needing to consult ROADMAP separately.  _(phase 26)_
- expected-vs-actual drift: 3 unexpected (bin/commands/index.js, lib/roadmap.js, test/unit-audit-fix.js); 1 expected-but-untouched (.planning/codebase/STRUCTURE.md)  _(phase 26)_
- Smart shim model: .git/hooks/pre-commit is a 4-line script that execs node bin/cp-hook.js. Upgrading the cp package upgrades hook behavior — no reinstall needed.  _(phase 27)_
- Sentinel '# cp:hook v1' baked into the script content lets install/uninstall safely refuse to clobber user-owned hook files (use --force to override).  _(phase 27)_
- findCpProjects walks for .planning/STATE.md markers under git root (maxDepth=4, env override CP_HOOK_MAXDEPTH). Monorepo-safe; stops recursing once a cp project is found to avoid double-running on nested projects.  _(phase 27)_
- Hook flags (--hooks / --uninstall-hooks) short-circuit before the harness arg check, so users do not need a harness positional. Mirrors install --uninstall semantics other tools use.  _(phase 27)_
- Exit code 3 when a user-owned hook is refused (without --force) — matches the existing harness-install exit-3 contract for partial installs.  _(phase 27)_
- Subject parser requires the captured group to start with a digit (regex ^cp\((\d+-\d+)). This explicitly excludes housekeeping subjects like cp(reconcile):, cp(supersede):, cp(deviate):, and bare cp: foo from triggering an auto-tick.  _(phase 28)_
- tick-auto is OFF by default (behavior.post_commit='off'). Teams that prefer a clean linear history are not surprised by trailing auto-tick commits; opt-in is explicit per project.  _(phase 28)_
- tryAutoTick was extracted as a pure-ish lifecycle helper so the file-coverage decision is unit-testable without spawning git. The shim only does I/O (lastCommitInfo + spawnSync cp tick).  _(phase 28)_
- Single-template GitHub Actions workflow. GitLab/Azure are deferred until requested — keeps scope focused on the dominant CI provider for OSS.  _(phase 29)_
- Sentinel '# cp:ci v1' in the workflow file matches the hook-install ownership pattern (phase 27): refuses to overwrite a user-modified file unless --force is passed.  _(phase 29)_
- Workflow runs with fetch-depth: 0 because cp audit walks git log for base/end SHA inference — shallow clones would defeat the inferer.  _(phase 29)_
- expected-vs-actual drift: 4 unexpected (test/dryrun-reconcile-all.js, test/unit-reconcile-all.js, bin/commands/reconcile.js, lib/reconcile.js)  _(phase 29)_
- Bulk mode (--all / --phase) is a sibling code path inside bin/commands/reconcile.js rather than a separate verb. Keeps the cognitive surface small and lets all existing flags (--infer-shas / --accept / --dry-run / --json / --no-commit) compose with bulk mode for free.  _(phase 29)_
- _parsePhaseRange accepts 5 shapes: N, N-M, N..M (escape-friendly), N,P,Q comma list, and any combo (5,7-9). Dot-dot form added because many shells interpret a bare hyphen as a flag.  _(phase 29)_
- Backfill on this repo collapsed 70 → 16 findings in one bulk commit (54 ops). For phases 1-16 the SHAs are all 9d57b67 because .planning/ was checked in en-masse there; that's accurate file-history, not a bug.  _(phase 29)_
- Single shared template wins over 4 per-installer template strings — eliminates drift between harnesses and keeps the v0.8 verb list maintained in one place  _(phase 30)_
- Sentinel pattern '<!-- cp:drift-defense v1 -->' matches the existing v1 versioning convention used by hooks ('# cp:hook v1') and CI ('# cp:ci v1') so future format bumps can be detected by sentinel comparison  _(phase 30)_
- stripDriftBlock exported alongside buildDriftDefenseBlock so installers that own the whole file (claude) can do strip+append for true idempotency; installers that own a cp-only file (copilot/cursor/aider) can just include the block inline  _(phase 30)_
- expected-vs-actual drift: 6 unexpected (install/aider.js, install/claude.js, install/copilot.js, install/cursor.js, test/unit-installers.js, test/unit-v034.js)  _(phase 30)_
- claude.js uses true strip+append (handles existing CLAUDE.md content from other plugins) — verified via 're-install ⇒ block appears exactly once' assertion in unit-v034.js  _(phase 30)_
- copilot/cursor own their ambient files end-to-end so they inline the drift block and rely on existing --force semantics for upgrade collisions; matches their existing behavior  _(phase 30)_
- aider's buildContextBriefing takes optional pluginRoot — keeps the function still callable in tests without pluginRoot for the original briefing-structure assertions, while real install path always passes it  _(phase 30)_
- expected-vs-actual drift: 1 unexpected (test/unit-v034.js)  _(phase 30)_
- Single concentrated doc beats splitting prevent/detect/repair across 3 sub-docs — the 3-layer mental model is the whole point and needs to be skimmed in one pass  _(phase 31)_
- Loud destructive-action warning for 'cp reconcile --accept' embedded twice (in repair section + in migration recipe) because it inverts the usual 'docs follow code' intuition  _(phase 31)_
- README gets just an overview table + link rather than the full content — README is already long and the playbook is canonical  _(phase 31)_
- expected-vs-actual drift: 2 unexpected (CHANGELOG.md, package.json)  _(phase 31)_
- CHANGELOG entries reorganised in newest-phase-first order with the v0.8 narrative summary at top — easier to scan than chronological because v0.8's value prop lands in phase 24-30  _(phase 31)_
- Did NOT auto-run npm publish — requires user's 2FA OTP and account-bound credentials. Leave the actual publish + complete-milestone roll-up as the user's final manual step  _(phase 31)_
- Loud Docs subsection at end of changelog calls out the new drift-playbook.md so npm-page readers see it  _(phase 31)_

**Patterns established:**
- v0.8 SHA pinning frontmatter convention: base-commit on PLAN.md, end-commit on SUMMARY.md (added in 17-02)  _(phase 17)_
- Two cp lifecycle paths (milestone vs lifecycle) must stay behaviour-consistent for the bin/commands/* CLI vs internal helpers  _(phase 17)_
- stderr notice format: cp: key-files auto-filled (N files: X created, Y modified)  _(phase 18)_
- Pure helpers (_extractPhaseBaseCommit, _autoFillKeyFiles) exported for direct unit testing  _(phase 18)_
- Test fixture pattern: seed file in base commit, stamp base-commit into PLAN.md, then make work commits between base and HEAD  _(phase 18)_
- dryrun-write-summary.js fixture mirrors freshProject + base-commit stamp pattern for end-to-end CLI testing  _(phase 18)_
- Helper signature: _checkKeyFilesExist(normalised, root, opts?) -> { missing: [{path, kind}] } — pure, never throws, caller decides ValidationError  _(phase 19)_
- Error message format includes opt-out hint (--no-file-check) so users discover the escape hatch  _(phase 19)_
- checkFileExistence: false short-circuits the helper at the top (no work done on opt-out)  _(phase 19)_
- Usage string lists every opt-out flag so users can discover them from `cp write-summary` with no args  _(phase 19)_
- try { state.regenerate(root) } catch — never block lifecycle ops on state sync  _(phase 20)_
- _splitState carves on the Progress: line as the derived/curated boundary  _(phase 20)_
- Subcommand dispatcher pattern in bin/commands/<verb>.js  _(phase 20)_

**Files (created):** lib/git.js, test/unit-git-sha.js, test/dryrun-write-summary.js, bin/commands/state.js, test/dryrun-state.js, test/unit-state.js, test/dryrun-scaffold-phase.js, test/dryrun-complete-milestone-audit.js, bin/commands/audit.js, lib/audit.js, test/dryrun-audit.js, test/unit-audit.js, lib/audit-fix.js, test/dryrun-audit-fix.js, test/unit-audit-fix.js, lib/reconcile.js, bin/commands/reconcile.js, test/unit-reconcile.js, test/dryrun-reconcile.js, bin/commands/deviate.js, bin/commands/supersede.js, test/dryrun-scaffold-continue.js, test/dryrun-supersede-deviate.js, test/unit-supersede-deviate.js, lib/hooks.js, bin/cp-hook.js, test/unit-hooks.js, test/dryrun-install-hooks.js, test/unit-tick-auto.js, test/dryrun-post-commit-tick.js, templates/ci/cp-audit.yml.example, test/dryrun-install-ci.js, test/dryrun-reconcile-all.js, test/unit-reconcile-all.js, templates/agent-instructions.md, test/unit-drift-block.js, docs/drift-playbook.md
**Files (modified):** lib/lifecycle.js, templates/phase-PLAN.md, test/unit-lifecycle.js, package.json, lib/milestone.js, bin/commands/write-summary.js, lib/git.js, test/unit-git-sha.js, test/dryrun-write-summary.js, bin/commands/_usage.js, bin/commands/index.js, lib/state.js, bin/commands/scaffold-phase.js, bin/commands/complete-milestone.js, test/unit-atomic.js, CHANGELOG.md, bin/commands/audit.js, lib/audit-fix.js, test/unit-audit-fix.js, lib/roadmap.js, .planning/codebase/STRUCTURE.md, bin/commands/install.js, lib/hooks.js, bin/cp-hook.js, bin/commands/reconcile.js, lib/reconcile.js, install/aider.js, install/claude.js, install/common.js, install/copilot.js, install/cursor.js, test/unit-installers.js, test/unit-v034.js, README.md

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`
- Phase 11: Command decomposition — see `.planning/phases/11-command-decomposition/`
- Phase 12: Dual-binary cplan + cp alias — see `.planning/phases/12-dual-binary-cplan-cp-alias/`
- Phase 13: GitHub Actions CI — see `.planning/phases/13-github-actions-ci/`
- Phase 14: Coverage with c8 — see `.planning/phases/14-coverage-with-c8/`
- Phase 15: Docs + v0.6.0 release — see `.planning/phases/15-docs-v0-6-0-release/`
- Phase 16: design capture infrastructure — see `.planning/phases/16-design-capture-infrastructure/`
- Phase 17: SHA pinning foundation — see `.planning/phases/17-sha-pinning-foundation/`
- Phase 18: Auto key-files at write-time — see `.planning/phases/18-auto-key-files-at-write-time/`
- Phase 19: File-existence hard-block — see `.planning/phases/19-file-existence-hard-block/`
- Phase 20: Derived STATE.md — see `.planning/phases/20-derived-state-md/`
- Phase 21: Plan-time expected-key-files — see `.planning/phases/21-plan-time-expected-key-files/`
- Phase 22: scaffold-phase prior-summary check — see `.planning/phases/22-scaffold-phase-prior-summary-check/`
- Phase 23: complete-milestone audit gate — see `.planning/phases/23-complete-milestone-audit-gate/`
- Phase 24: cplan audit detection — see `.planning/phases/24-cplan-audit-detection/`
- Phase 25: cplan audit --fix loop — see `.planning/phases/25-cplan-audit-fix-loop/`
- Phase 26: Repair commands — see `.planning/phases/26-repair-commands/`
- Phase 27: Pre-commit hook smart shim — see `.planning/phases/27-pre-commit-hook-smart-shim/`
- Phase 28: Post-commit hook tick auto — see `.planning/phases/28-post-commit-hook-tick-auto/`
- Phase 29: CI template + backfill — see `.planning/phases/29-ci-template-backfill/`
- Phase 30: Agent literacy injection — see `.planning/phases/30-agent-literacy-injection/`
- Phase 31: Docs + v0.8.0 release — see `.planning/phases/31-docs-v0-8-0-release/`

## v0.9 Onboarding  — shipped 2026-05-21

**Phases:** 32-35    **Plans:** 5    **Duration:** 15m, 45m, 25m, 10m

**Subsystems touched:** milestone-aggregation

**Key decisions:**
- Auto-init invokes cp init (not a custom mini-init) — cp init is already idempotent and additive so re-runs are safe  _(phase 32)_
- Notice line is mandatory before invoking cp init; never auto-init silently — users must understand new files appearing in their repo  _(phase 32)_
- No installer.js changes — installers re-read commands/cp/*.md at install time, so editing the skill source propagates on next cp install  _(phase 32)_
- Audit-fix runs at severity=low,medium only — never auto-touch HIGH findings (user-visible decisions)  _(phase 33)_
- No version-tracking file in v0.9 — cp update is stateless w.r.t. previous cp version; current-version templates re-applied idempotently  _(phase 33)_
- SHA backfill deferred to v0.10 — auto-running reconcile --infer-shas is destructive; flag missing SHAs via audit and let user run reconcile deliberately  _(phase 33)_
- Detection seeds from config cp.harness first then falls back to filesystem markers — matches real-world install patterns  _(phase 33)_
- --check flag implies --dry-run and exits 1 on pending changes (CI-friendly)  _(phase 33)_
- Skill follows pre-flight -> cp update --json -> structured-summary template — matches /gsd-update's 4-step shape but cp-flavored  _(phase 33)_
- README restructured to lead with npx one-liner; manual per-verb steps demoted to alternatives — most users want one-liner per user feedback  _(phase 33)_
- No CHANGELOG version bump in this plan — 33-02 lands in [Unreleased]; version bump happens at milestone close in a future phase or release plan  _(phase 33)_
- Placed matrix between Why? and Install sections (not at very top) — TL;DR diagram still leads, matrix appears where users start scanning for 'how do I begin'  _(phase 34)_
- 4-row table format chosen over prose — copy-paste-able commands are the win; long explanations live in the slash-skill docs  _(phase 34)_
- Case 4 row shows the npx one-liner not bare cp update — leads with the form that works even if the binary is stale  _(phase 34)_
- Emit Phase designs + Reviews sections only when their data is non-empty (no '(none)' placeholders) — keeps digest concise.  _(phase 35)_
- Stub-detection heuristic for DESIGN.md (placeholder string + empty Decision section) prevents noisy scaffold links from leaking into MILESTONES.md.  _(phase 35)_
- Out-of-scope: cp-plan-phase Step 3.5 manual-provider fallback. Skill already handles it; further polish deferred to v0.10.  _(phase 35)_

**Patterns established:**
- renderDigest follows additive section pattern: each block guarded by Array.isArray + length check, emits nothing on empty.  _(phase 35)_

**Files (created):** bin/commands/update.js, commands/cp/update.md, lib/update.js, test/unit-update.js
**Files (modified):** lib/milestone.js, test/unit-design.js, CHANGELOG.md, README.md, bin/commands/_usage.js, bin/commands/index.js, commands/cp/map-codebase.md, package.json

**Phase summaries:**
- Phase 32: map-codebase auto-init — see `.planning/phases/32-map-codebase-auto-init/`
- Phase 33: cp update command — see `.planning/phases/33-cp-update-command/`
- Phase 34: README onboarding decision matrix — see `.planning/phases/34-readme-onboarding-decision-matrix/`
- Phase 35: DESIGN.md lifecycle polish — see `.planning/phases/35-design-md-lifecycle-polish/`
