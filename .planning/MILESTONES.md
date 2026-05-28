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

## v0.10 Autonomy  — shipped 2026-05-21

**Phases:** 36-38    **Plans:** 3    **Duration:** —

**Key decisions:**
- Lib stays pure: planPhase/executePhase callbacks supplied by skill layer keeps unit tests fast and avoids recursive npm test  _(phase 36)_
- Smart gates live in lib (test/audit are CLI verbs, no agent reasoning needed); deviation detected via callback throw  _(phase 36)_
- Mirror cp update shape: same flag set, same exit code semantics, same JSON return shape  _(phase 36)_
- Skill is outer orchestrator; CLI runAutonomous reserved for --check + lib unit tests  _(phase 37)_
- Smart gates in skill loop (after each plan tick) use cp audit + config.test_command — no agent reasoning needed  _(phase 37)_
- Stop UX uses ask_user with reason-tailored choices; never exit session  _(phase 37)_
- No installer.js edit — install/*.js auto-walk commands/cp/  _(phase 37)_
- Bump to 0.10.0 (MINOR — additive only, no breaking changes)  _(phase 38)_
- CHANGELOG entry links design spec + milestone DESIGN for traceability  _(phase 38)_
- README documents both the slash skill primary path AND the bare CLI --check path  _(phase 38)_

**Files (created):** bin/commands/autonomous.js, lib/autonomous.js, test/unit-autonomous.js, commands/cp/autonomous.md
**Files (modified):** bin/commands/_usage.js, bin/commands/index.js, package.json, CHANGELOG.md, README.md

**Phase summaries:**
- Phase 36: cp autonomous CLI + lib helper — see `.planning/phases/36-cp-autonomous-cli-lib-helper/`
- Phase 37: /cp-autonomous slash skill — see `.planning/phases/37-cp-autonomous-slash-skill/`
- Phase 38: Docs + v0.10.0 release — see `.planning/phases/38-docs-v0-10-0-release/`

## v0.10.1 Collapse-aware milestone close  — shipped 2026-05-22

**Phases:** 39-39    **Plans:** 1    **Duration:** —

**Key decisions:**
- findMilestoneInRoadmap now ALSO walks <summary> lines, not just ### markdown headings — single-source detection for collapsed milestones  _(phase 39)_
- statusReport STATE.md fallback ignores placeholder values (-/Idle/None) to avoid false positives in fresh repos  _(phase 39)_
- alreadyShipped:true is a clean no-op exit 0 — no --force flag needed because idempotency is the desired contract  _(phase 39)_

**Files (created):** test/unit-collapse-aware.js
**Files (modified):** CHANGELOG.md, lib/lifecycle.js, lib/milestone.js, package.json

**Phase summaries:**
- Phase 39: collapse-aware-complete-milestone — see `.planning/phases/39-collapse-aware-complete-milestone/`

## v1.0 Workflow Engine  — shipped 2026-05-25

**Phases:** 40-42    **Plans:** 7    **Duration:** 21min, 21min, 11min, 30min

**Requirements delivered:** v1.0/CLI/run-family, v1.0/CLI/workflow-family, v1.0/built-in-templates/dev, v1.0/built-in-templates/debug, v1.0/built-in-templates/quick, v1.0/CLI/workflow-brainstorm, v1.0/tests/dryrun-run-cli, v1.0/tests/dryrun-workflow-cli, v1.0/tests/integration-run-cli, v1.0/docs/readme-workflow-engine, v1.0/docs/migration, v1.0/release/changelog-entry, v1.0/release/version-bump

**Subsystems touched:** tooling, cli, docs

**Key decisions:**
- computeWaves emits phase OBJECTS (not just ids) per wave — downstream runtime needs full phase metadata (role, model, skill, prompt, persist_output) at instruction-emission time  _(phase 40)_
- validate() runs ALL checks before returning (no short-circuit) so users see every error in one pass  _(phase 40)_
- cycle error messages reconstruct the offending path with → arrows for fast diagnosis  _(phase 40)_
- resolveTemplate tolerates missing built-in templates/workflows/ directory (Phase 41 ships it) — searches project-local .planning/workflows/ first, then built-in, then throws with attempted paths listed  _(phase 40)_
- loadTemplate defaults binds_to='custom', principles=[], defaults={}, per-phase depends_on=[] so templates can omit boilerplate  _(phase 40)_
- markPhaseComplete takes summaryText as a function argument; Phase 41 CLI will read stdin and pass through — keeps the lib pure  _(phase 40)_
- startRun supports dryRun:true returning waves[i].instruction without writing state — Phase 41's --plan-only relies on this  _(phase 40)_
- Module name is runtime.js (broader than wave-walker.js; matches typical workflow-engine terminology)  _(phase 40)_
- retryPhase rolls back current_wave to the phase's wave (not just removes from completed[]) — spec interpretation: re-emitting a past-wave instruction requires actually returning there  _(phase 40)_
- Per-run state files: custom-tier uses STATE.yaml (existing convention); milestone-tier uses .planning/milestones/<slug>/RUN.yaml; phase-tier uses .planning/phases/<dir>/.workflow-runs/<slug>.yaml. Lookup by slug walks all three locations.  _(phase 40)_
- Instruction format: omit `Global directives` preamble entirely when both constraints and principles are absent; omit `[parallel]` header for single-phase waves  _(phase 40)_
- scaffoldPhase audit gate (prior-phase-incomplete) bypassed via force:true when scaffolding milestone-bound phases — empty plan list would otherwise block 2nd+ phase  _(phase 40)_
- STATE.yaml stays YAML (not JSON) for symmetry with workflow templates and easy hand-editing during recovery  _(phase 40)_
- writeState ALWAYS overwrites last_activity regardless of patch contents — matches the file's name semantics and removes a footgun where callers forget to bump it  _(phase 40)_
- artifacts gets shallow-merged (existing entries preserved); other top-level keys overwrite — minimum surprise for the common 'append phase' case  _(phase 40)_
- pruneAbandoned defaults to dry-run; {apply: true} required to actually delete — matches cp's safety.always_confirm_destructive convention  _(phase 40)_
- Slug collision suffix starts at -2 (not -1) — base name has no suffix, collision starts immediately at -2/-3/...  _(phase 40)_
- Single run.js module hosts the full sub-command tree (start, resume, retry, abandon, mark-complete, status); dispatched on argv[0].  _(phase 41)_
- Stdout reserved for actionable text (instruction body, --json payloads); stderr for slug/wave logs and errors. Exit codes: 0 ok, 1 duplicate/abort, 2 usage, 3 template-not-found, 4 run-not-found, 5 phase-not-in-wave.  _(phase 41)_
- mark-complete reads summary text from stdin (matching write-summary convention); abandon supports --yes for non-interactive flows.  _(phase 41)_
- Imports lib/workflow.js#computeWaves directly to format 'wave N of M' in resume/mark-complete logs — pure computation, no state mutation.  _(phase 41)_
- Seven sub-commands hosted in a single workflow.js module (mirrors run.js sub-tree pattern).  _(phase 41)_
- Exit-code matrix: 0 ok, 2 usage/validation/strict-warnings, 3 template-not-found, 6 file-already-exists.  _(phase 41)_
- diagram emits Mermaid flowchart only (DESIGN.md open-question resolved: mermaid-only for v1.0).  _(phase 41)_
- All three built-in templates pass workflow.validate ok=true; each carries a principles: block (≥2 entries) and a defaults: block per DESIGN.md requirements.  _(phase 41)_
- dev.yaml ships with 6 phases (brainstorm → research-prior-art ∥ research-constraints → plan → execute → review) to demonstrate parallel-wave authoring.  _(phase 41)_
- brainstorm sub-command delegates to provider.resolveSkill('brainstorm') and emits a structured 'Designing a new workflow' starter context block; it does NOT write any file (matching cp run's instruction-emit pattern).  _(phase 41)_
- Manual-fallback path prints provider.resolvePrompt('brainstorm') followed by context block; provider-installed path prefixes with 'Designing a new workflow. Please invoke the {name} brainstorm skill ...'.  _(phase 41)_
- Three new dryrun/integration test files exceed the assertion targets (31/53/20 vs ~20/25/10) for stronger coverage at zero extra runtime cost.  _(phase 41)_
- cp run resume on a completed run returns the last wave's instruction (exit 0) rather than erroring — documented in integration test.  _(phase 41)_
- MIGRATION-v1.0.md placed at repo root (not docs/) for discoverability on GitHub front page  _(phase 42)_
- README Workflow Engine H2 section inserted between Command surface and State layer  _(phase 42)_
- Two commits used - docs commit then version bump commit as recommended by DESIGN.md  _(phase 42)_

**Patterns established:**
- YAML workflow template canonical shape: {workflow, version, binds_to?, defaults?, principles?, phases[{id, depends_on?, role?, model?, skill?, prompt?, persist_output?}]}  _(phase 40)_
- Test fixture directory layout: test/fixtures/workflows/<scenario>.yaml — one fixture per validation scenario plus happy paths  _(phase 40)_
- Wave instruction format (see lib/runtime.js formatInstruction): Global directives preamble (project constraints + workflow principles, both optional) → `Wave N of M — K phase(s)` header → optional `[parallel]` block → per-phase blocks with `(absent)` literal for absent fields → closing `cp run mark-complete` line  _(phase 40)_
- Three-tier binding resolution: detect by trying custom.readState first, then scanning .planning/phases/*/.workflow-runs/, then .planning/milestones/<slug>/RUN.yaml — throw RunNotFound if none match  _(phase 40)_
- Custom-tier directory layout: .planning/custom/<YYYY-MM-DD-slug>/STATE.yaml + NN-<phase-id>.md per phase  _(phase 40)_
- STATE.yaml canonical shape: workflow, slug, status (in-progress|done|abandoned), binding (custom), started, last_activity, current_phase, completed[], artifacts{}  _(phase 40)_
- Sub-command sub-tree inside a single registry entry (alternative to one file per leaf command).  _(phase 41)_
- Exit-code matrix per CLI module (documented at top of run.js).  _(phase 41)_
- Built-in templates resolved from repo-root templates/workflows/ via lib/workflow.js#resolveTemplate; project-level overrides live in .planning/workflows/.  _(phase 41)_
- Path-vs-name argument detection: contains / \\ or ends with .yaml/.yml → path; else → named lookup.  _(phase 41)_
- CLI commands that delegate to AI skills emit instructions rather than executing inline (same model as cp run): stdout = the instruction/context, stderr = operational hints.  _(phase 41)_
- End-to-end CLI integration tests spawn bin/cp.js via spawnSync for full stdout/stderr/exit-code coverage (vs lib-only tests in integration-runtime.js).  _(phase 41)_
- Release phases with new public API surface get a dedicated MIGRATION-vX.Y.md at repo root  _(phase 42)_

**Files (created):** lib/workflow.js, test/unit-workflow.js, test/fixtures/workflows/linear.yaml, test/fixtures/workflows/parallel.yaml, test/fixtures/workflows/cycle.yaml, test/fixtures/workflows/dangling-dep.yaml, test/fixtures/workflows/bad-yaml.yaml, test/fixtures/workflows/missing-id.yaml, lib/runtime.js, test/integration-runtime.js, test/fixtures/workflows/dev-mini.yaml, test/fixtures/workflows/debug-mini.yaml, test/fixtures/workflows/quick-mini.yaml, lib/custom.js, test/unit-custom.js, bin/commands/run.js, bin/commands/workflow.js, templates/workflows/dev.yaml, templates/workflows/debug.yaml, templates/workflows/quick.yaml, test/dryrun-run-cli.js, test/dryrun-workflow-cli.js, test/integration-run-cli.js, MIGRATION-v1.0.md
**Files (modified):** package.json, bin/commands/index.js, bin/commands/_usage.js, bin/commands/workflow.js, README.md, CHANGELOG.md

**Phase summaries:**
- Phase 40: Core engine + custom tier — see `.planning/phases/40-core-engine-custom-tier/`
- Phase 41: CLI surface + built-in templates + AI authoring — see `.planning/phases/41-cli-surface-built-in-templates-ai-author/`
- Phase 42: Docs + v1.0.0 release — see `.planning/phases/42-docs-v1-0-0-release/`

**Phase designs:**
- Phase 40 — `.planning/phases/40-core-engine-custom-tier/DESIGN.md`
- Phase 41 — `.planning/phases/41-cli-surface-built-in-templates-ai-author/DESIGN.md`
- Phase 42 — `.planning/phases/42-docs-v1-0-0-release/DESIGN.md`

**Reviews:** 6 entries across 3 phases
- Phase 40 — `.planning/phases/40-core-engine-custom-tier/REVIEW-LOG.md`
- Phase 41 — `.planning/phases/41-cli-surface-built-in-templates-ai-author/REVIEW-LOG.md`
- Phase 42 — `.planning/phases/42-docs-v1-0-0-release/REVIEW-LOG.md`

## v1.1 Workflow Skills  — shipped 2026-05-25

**Phases:** 43-48    **Plans:** 15    **Duration:** 20min, 8min, 10min, 35min, 30min, 12min, 15min, 20min, 20min, 25min, 0min, 35min, 50min, 12min, 3min

**Requirements delivered:** v1.1 phase 43, v1.1 phase 44

**Subsystems touched:** tooling, testing, docs, workflow

**Key decisions:**
- Wave-loop logic lives in cp-workflow-run only; cp-workflow-resume cross-references rather than duplicates (43-03)  _(phase 43)_
- Smart-gate sentinels (test fail, audit HIGH, DEVIATION: prefix) match cp-autonomous exactly so phase-45 shim is transparent  _(phase 43)_
- --scope and --check argv contract matches cp-autonomous historical contract  _(phase 43)_
- Skill never mutates .planning/runs/ directly; all state changes go through cp run sub-commands  _(phase 43)_
- DESCRIPTION column derived from first principles: entry, not a separate description: field (schema doesn't have one today; deferred to future rev)  _(phase 43)_
- List mode separates built-ins from project templates in two table sections  _(phase 43)_
- End-of-output suggestions point to /cp-workflow-run, /cp-workflow-list <name>, /cp-workflow-new --from for full discoverability loop  _(phase 43)_
- Optional 'want me to run one?' offer suppressed if user already ran a workflow in session  _(phase 43)_
- Wave-loop logic is NOT duplicated here — skill body cross-references cp-workflow-run Step 5 by name  _(phase 43)_
- --scope intentionally not supported on resume (would create inconsistent STATE); user must abandon + start fresh to re-scope  _(phase 43)_
- Argument modes: enumeration / resume / --retry / --abandon; --abandon wins over --retry if both passed  _(phase 43)_
- cp doctor re-resolved on resume to pick up newly-installed providers  _(phase 43)_
- Added installer auto-pickup assertions in test/unit-v034.js (not test/unit-installers.js as DESIGN.md suggested) because copilot/claude installer e2e coverage already lived in unit-v034.js. Documented as plan-level deviation.  _(phase 43)_
- Normalised CRLF to LF when asserting on skill markdown body so tests pass on Windows.  _(phase 43)_
- integration-workflow-skills.js covers the slices integration-run-cli.js does not: skill source shape, named slug honour, and abandon-flow status transition.  _(phase 43)_
- Rewrite top-level workflow: key via per-line regex instead of YAML reserialisation. Reason: preserves formatting so export-edit-export cycles produce minimal diffs; reserialisation would change quoting/ordering.  _(phase 44)_
- Strip the # template: header that cp workflow show emits (kept in show for back-compat). Without this, import round-trip would treat the comment as content drift.  _(phase 44)_
- Validate the rewritten YAML before writing — even with --force. Refuse to ship a broken file.  _(phase 44)_
- Default destination is ./<name>.yaml (or ./<as-name>.yaml). The DESIGN's open question (default into .planning/workflows/) was answered no — users may want to inspect before committing to the project tree; --out covers the explicit case.  _(phase 44)_
- Skill refuses to reuse built-in template names outright (no --force escape hatch) — you cannot override quick/dev/debug from the project tree.  _(phase 44)_
- Skill refuses project-name collision unless --force, mirroring the underlying CLI behavior.  _(phase 44)_
- Added explicit When-to-use-this vs cp-workflow-customize callout so the two creator skills do not compete during agent skill selection — authoring is fresh-start; customize is tweak-existing.  _(phase 44)_
- Skill ends with a /cp-workflow-run <name> hint so the next user action is one click away.  _(phase 44)_
- Skill replaces the originally-planned cp-workflow-import — pure import would have been a thin LLM-less wrapper; customize is the actual user task. User-approved in mid-43-04 conversation.  _(phase 44)_
- Skill is interactive-first: missing built-in or new-name prompts the user with a menu rather than failing — discoverability over strict argv.  _(phase 44)_
- Step 7 validates by PATH (not name) because the template is not yet registered. Both forms are accepted by cp workflow validate.  _(phase 44)_
- Skill ends with a re-customize hint pointing users at 'cp workflow import <path> --force' for later iterations without re-walking the full export step.  _(phase 44)_
- Extended the cp-workflow-* skills array in unit-v034.js from 3 to 5 entries rather than adding a parallel section — keeps installer-pickup assertions data-driven and trivially extensible for v1.2+.  _(phase 44)_
- Integration test reuses dir2 fixture across both round-trip scenarios (basic export and rename-export) — cheaper than separate fixtures and exercises that 'init' + 'import' are idempotent across multiple invocations.  _(phase 44)_
- Test count badge bumped to 2100+ (was 751; actual ✓ count is ~2111)  _(phase 46)_
- v1.1 skill subsection placed under existing slash-command table, not a new top-level section  _(phase 46)_
- MIGRATION-v1.1.md follows MIGRATION-v1.0.md structure: What's New / Do I Need to Migrate / Discovery / Deferred / Worked Example / Compatibility / Upgrade Steps  _(phase 46)_
- Did NOT add MIGRATION-v1.1.md to package.json iles array — follows v1.0 precedent (migration guides are GitHub-only, not shipped in npm tarball)  _(phase 46)_
- Explicit Deferred to v1.2 section in CHANGELOG documents the cp-quick/cp-autonomous shim deferral with full rationale so future contributors understand why phase 45 was skipped  _(phase 46)_
- Plan obsoleted mid-flight — paused during execution when scope expanded to include 7 additional agent skills + cp workflow inspect CLI. Actual publish work moved to Phase 48-01.  _(phase 46)_
- Reused lib/workflow.js#computeWaves (already existed) rather than reimplementing topological sort  _(phase 47)_
- Human-readable output places YAML first then wave decomposition; --json emits structured form for tooling  _(phase 47)_
- Inserted as Section 5.5 in dryrun tests (between diagram and init) to keep test order matching CLI grouping  _(phase 47)_
- Exit codes match the rest of cp workflow family: 2 usage, 3 template-not-found, 2 validation-failure  _(phase 47)_
- 12 cp-workflow-* skills total now mirror every cp workflow CLI verb except 'init' (which is a one-shot bootstrap that does not benefit from agent orchestration)  _(phase 47)_
- Brainstorm is the only non-trivial skill (orchestrates provider delegation); other 6 are thin wrappers because their underlying CLI is already complete  _(phase 47)_
- All skills carry a 'When to use this vs <sibling>' callout to disambiguate from cp-workflow-customize (round-trip) and cp-workflow-new (clone-from-built-in)  _(phase 47)_
- Skipped /cp-workflow-init — the bootstrap path doesn't benefit from agent orchestration  _(phase 47)_
- Organise the 12 cp-workflow-* skills into 3 functional groups in every doc surface (README, MIGRATION, CHANGELOG): Drive / Author / Inspect — mirrors how users actually reach for them.  _(phase 47)_
- Document /cp-workflow-init's absence and why (one-shot bootstrap, no agent value) so reviewers don't read the missing entry as an oversight.  _(phase 47)_
- Update test-count line in CHANGELOG to actual deltas (integration 39->93, dryrun 75->103, unit 64->92) — was previously approximated.  _(phase 47)_
- Created annotated tag v1.1.0 with full release-note body in the tag message — searchable via git show v1.1.0.  _(phase 48)_
- User ran npm publish from their own terminal (OTP-driven browser flow cannot be automated).  _(phase 48)_

**Patterns established:**
- cp-workflow-* skill family naming under unified prefix (Q2 of v1.1 brainstorm)  _(phase 43)_
- Skill bodies use numbered Step 1..N sections mirroring commands/cp/autonomous.md structure  _(phase 43)_
- Read-only cp-workflow-* skills end with next-action suggestions linking to write-side cp-workflow-* skills  _(phase 43)_
- cp-workflow-* skills explicitly cross-reference each other when sharing execution sections (single-source-of-truth for wave-loop)  _(phase 43)_
- New cp-* agent skill must ship with both a unit-v034.js installer assertion (3 per skill: file exists in copilot tree, file exists in claude tree, frontmatter name matches file) and at least one shape-of-skill assertion in integration-workflow-skills.js.  _(phase 43)_
- New cp workflow subcommands follow the existing arg-parse pattern: positional args first, --flag args after, unknown options exit 2.  _(phase 44)_
- Interactive-first agent skills: when a required argv is missing, present an enumerated picker via cp workflow ls --json rather than printing usage and exiting.  _(phase 44)_
- Round-trip integration tests for CLI surfaces should exercise both directions in the same fixture: write side (export) verifies content, read side (import + ls) verifies the writer's output is consumable.  _(phase 44)_
- Workflow-skills subsection format wraps the agent-side companions for each new CLI verb family  _(phase 46)_
- Per-minor-version MIGRATION-vN.M.md files at repo root  _(phase 46)_
- CHANGELOG Deferred to vNEXT subsection convention for documenting non-shipped intent  _(phase 46)_
- Inspect-style CLI = raw artifact + deduced semantic view in one command  _(phase 47)_
- 'Every CLI verb has a slash companion' contract is now complete for cp workflow family  _(phase 47)_
- Group skill catalogues by user intent (drive/author/inspect) rather than alphabetically — applies to all future skill cluster docs.  _(phase 47)_

**Files (created):** commands/cp/workflow-run.md, commands/cp/workflow-list.md, commands/cp/workflow-resume.md, test/integration-workflow-skills.js, commands/cp/workflow-new.md, commands/cp/workflow-customize.md, MIGRATION-v1.1.md, commands/cp/workflow-brainstorm.md, commands/cp/workflow-diagram.md, commands/cp/workflow-export.md, commands/cp/workflow-import.md, commands/cp/workflow-inspect.md, commands/cp/workflow-show.md, commands/cp/workflow-validate.md
**Files (modified):** test/unit-v034.js, package.json, bin/commands/workflow.js, test/dryrun-workflow-cli.js, test/integration-workflow-skills.js, README.md, CHANGELOG.md, bin/commands/_usage.js, package-lock.json, MIGRATION-v1.1.md

**Phase summaries:**
- Phase 43: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume — see `.planning/phases/43-consumer-skills-cp-workflow-run-cp-workf/`
- Phase 44: Creator skills: cp-workflow-new, cp-workflow-customize (+ cp workflow export) — see `.planning/phases/44-creator-skills-cp-workflow-new-cp-workfl/`
- Phase 46: Docs + MIGRATION-v1.1.md + v1.1.0 release — see `.planning/phases/46-docs-migration-v1-1-md-v1-1-0-release/`
- Phase 47: Complete CLI-verb-to-agent-skill coverage + `cp workflow inspect` — see `.planning/phases/47-complete-cli-verb-to-agent-skill-coverag/`
- Phase 48: Resume v1.1.0 release (re-tag, publish, push) — see `.planning/phases/48-resume-v1-1-0-release-re-tag-publish-pus/`

**Phase designs:**
- Phase 43 — `.planning/phases/43-consumer-skills-cp-workflow-run-cp-workf/DESIGN.md`
- Phase 44 — `.planning/phases/44-creator-skills-cp-workflow-new-cp-workfc/DESIGN.md`

## v1.2 Unified Phase Model  — shipped 2026-05-26

**Phases:** 49-52.5    **Plans:** 20    **Duration:** 36min, 11min, 11min, 19min, 13min, 15min, 17min, 55min

**Requirements delivered:** REQ-V1.2-workflow-adapter, REQ-V1.2-persist-primitives, REQ-V1.2-schema-validation, REQ-V1.2-fanout-expander, REQ-V1.2-runtime-contract, REQ-V1.2-integration-coverage

**Subsystems touched:** tooling

**Key decisions:**
- Single unified Phase type usable by both milestone and workflow layers  _(phase 49)_
- validatePhase tolerates layer-specific extension fields (parent, persist, after, meta)  _(phase 49)_
- JSDoc over TypeScript for codebase consistency  _(phase 49)_
- readPhases derives status from ROADMAP checkbox state alone (no PLAN.md frontmatter reads)  _(phase 49)_
- scaffoldTierFiles is idempotent — safe to call on every cp run; returns {designCreated, stateCreated}  _(phase 49)_
- Surfaces forward-compat workflow: field from phase annotation/frontmatter for phase 51 consumption  _(phase 49)_
- Reuses lib/roadmap.js#listPhases instead of re-implementing the parser  _(phase 49)_
- phasesFromTemplate is an append-only adapter; loadTemplate/validate/computeWaves/resolveTemplate/normalisePhase untouched  _(phase 49)_
- persist_output -> persist alias with one-shot console.warn deduped per template (workflow name)  _(phase 49)_
- Parent phases get max_children=20 / min_children=1 defaults; non-parents leave them undefined  _(phase 49)_
- Parent is inferred by scanning siblings for parent: <id> references  _(phase 49)_
- foldIntoDesign anchors on `## <phaseId>` and replaces in-place when present, appends otherwise (idempotent)  _(phase 49)_
- Atomic write via tmp + rename to avoid partial DESIGN.md on crash  _(phase 49)_
- mergePersistAlias is a pure normaliser; deprecation warning stays in lib/workflow.js (no shared sink)  _(phase 49)_
- persist wins over persist_output when both present (consistent with phasesFromTemplate precedence)  _(phase 49)_
- Extended existing validate(template) in-place; preserved errors/warnings shape  _(phase 50)_
- 8 v1.2 rules enforced: parent ref, no grandchildren, max/min only on parents, max>=min, positive ints, sibling-only child after, top-level after refs top-level only, persist boolean  _(phase 50)_
- Defaults applied during validation: min=1 when only max set, max=20 when only min set  _(phase 50)_
- Subtree-wait semantics documented in JSDoc; not implemented (executor's job)  _(phase 50)_
- Children emitted grouped by itemIndex (item0/child0..N, item1/child0..N) for cache locality  _(phase 50)_
- Expanded child id: <childTemplate.id>::<item.id || itemIndex>  _(phase 50)_
- Pure function: inputs not mutated; output objects are fresh  _(phase 50)_
- Picks LAST fenced JSON block when multiple are present (chain-of-thought tolerant)  _(phase 50)_
- Item id must match /^[a-z0-9-]+$/ for slug-safe filenames in fan-out output dirs  _(phase 50)_
- Empty items accepted at parse; count enforced separately so callers can compose  _(phase 50)_
- All-or-nothing DAG rule: only switch to optimised parallel order when every item declares depends_on (incl. [])  _(phase 50)_
- Partial depends_on silently falls back to array order to avoid ambiguous ordering bugs  _(phase 50)_
- Cross-item ordering implemented as `after` edges on expanded children; executor scheduler needs no new primitive  _(phase 50)_
- Field name `depends_on` chosen on items (matches phase-level vocabulary; clearer to agents than `after`)  _(phase 50)_
- Schema unchanged — DAG is runtime data the agent supplies, not template config  _(phase 50)_
- [object Object]  _(phase 51)_
- [object Object]  _(phase 51)_
- [object Object]  _(phase 51)_
- [object Object]  _(phase 51)_
- [object Object]  _(phase 51)_
- DESIGN.md is the contract, STATE.md is the journal, SUMMARY.md closes the loop - same shape as milestone-phases for easy promotion later.  _(phase 51)_
- Quick tasks default to skipping the heavyweight plan skill; --full re-enables it as opt-in.  _(phase 51)_
- STATE.md is updated during execution (not just at end) so quick-resume can pick up mid-flight without losing progress.  _(phase 51)_
- Discovered bin/commands/quick.js does NOT exist - cp-quick is purely a skill, so 51-02 reduced to a templates+skill refactor.  _(phase 51)_
- Legacy .planning/custom/ runs stay in custom/ for their lifetime - writes do NOT migrate. Avoids surprising data movement; users move them with git mv when ready.  _(phase 51)_
- createRun ALWAYS writes to quick/. New work never lands in legacy custom/, even on legacy-only projects.  _(phase 51)_
- binds_to: custom is normalized to quick at template-load time (silent). The user-facing deprecation warning fires only when a legacy .planning/custom/ directory is actually touched.  _(phase 51)_
- Free-slug check spans BOTH roots so a new quick-run cannot collide with a legacy custom slug.  _(phase 51)_
- lib/custom.js filename kept (not renamed to quick.js) to minimize churn. Module exports add _quickRoot/_legacyCustomRoot/_resetDeprecationWarning for testing.  _(phase 51)_
- ALLOWED_BINDS keeps custom as an alias so user templates with binds_to: custom still validate. The validation error message reframes custom as a deprecated alias.  _(phase 51)_
- Keep the cp-plan-phase skill file registered (deprecated: true) instead of deleting it. Users who type /cp-plan-phase get a clear nudge rather than a 'skill not found' error. Removal moves to v1.3.  _(phase 51)_
- Leave the autonomous legacy pass-through CODE in place for v1.2 — this very milestone (v1.2) was scaffolded the legacy way, so removing the pass-through would break the self-host. Pass-through prints a one-time deprecation warning when it fires; removal is now scheduled for v1.3 in writing.  _(phase 51)_
- Test/install briefing (test/unit-installers.js) still mentions /cp-plan-phase by name because the installer iterates the skill files it finds. Kept the test as-is — the briefing surfacing a deprecated skill is correct behavior.  _(phase 51)_
- Error messages route to cp scaffold-phase (low-level) rather than /cp-autonomous (high-level) because they fire from lib code that can't assume a provider is available.  _(phase 51)_
- Smart-gate trip tests use process.platform-aware testCommand strings (cmd /c exit N on Windows, true/false on POSIX) so tests run cross-platform.  _(phase 51)_
- CLI argv tests shell out via execSync against bin/cp.js and accept both exit 0 (clean) and exit 1 (phases pending) for --check, since bin/commands/autonomous.js intentionally exits 1 when phasesWouldRun > 0.  _(phase 51)_
- Quick-tier parity is exercised via lib/custom.js (createRun + readState) rather than a bin/quick.js CLI, since cp-quick is a pure skill with no JS entry point.  _(phase 51)_
- Did not attempt to mock lib/audit at runtime — runAuditGate test asserts ok=true on a synthetic fixture with no audit-trippable findings; HIGH-finding path remains covered by integration tests, not unit.  _(phase 51)_
- All renames documented as one-release deprecation aliases (removed in v1.3) — never as immediate breaks — matching the back-compat invariants enforced by the test suite.  _(phase 52)_
- Fan-out section documents the depends_on inter-child ordering refinement (today's design decision) as the primary v1.2 fan-out feature; array-order fallback is explained as the safety net for partial fills.  _(phase 52)_
- Cheatsheet table at the bottom lists every old->new pairing on one page for fast scanning; full prose explanations precede it for migrators who want context.  _(phase 52)_
- Did NOT touch CHANGELOG.md or README.md (those are 52-02). Did NOT bump package.json or tag (those are 52-03). Stayed in-scope.  _(phase 52)_
- Listed fan-out + depends_on as the headline v1.2 feature in both CHANGELOG and README — it's the most user-visible authoring change.  _(phase 52)_
- Marked /cp-plan-phase as deprecated in the slash-commands table rather than removing the row, so v1.1 users searching the README still find it and see the migration target.  _(phase 52)_
- Added a short v1.2 callout banner under the built-in templates table and the State layer diagram instead of restructuring those sections — keeps existing v1.1 readers oriented while flagging the renames.  _(phase 52)_
- Did NOT bump package.json or tag (that's 52-03). Only doc files touched.  _(phase 52)_
- Folded the 52.5 doc work into the canonical root MIGRATION-v1.2.md rather than maintaining a parallel docs/MIGRATION-v1.2.md — single source of truth, easier for migrators.  _(phase 52)_
- Updated CHANGELOG inline rather than appending a new [1.2.1] section: 1.2.0 has not shipped yet, so the optimizable refinement belongs in the 1.2.0 entry next to the rest of the fan-out work.  _(phase 52)_
- Tagged v1.2.0 locally only (no push). Leaving `git push origin main --tags` and `npm publish` to the user per project convention.  _(phase 52)_
- Defaulted optimizable to false on omission so back-compat bare arrays and partial declarations both resolve to the SAFE sequential mode — no silent DAG execution from incomplete agent output.  _(phase 52.5)_
- When optimizable:true but some items omit depends_on, treated as [] (parallel root) rather than rejecting. This lets agents express full parallelism by just setting optimizable:true with no depends_on edges.  _(phase 52.5)_
- Kept enforceChildCount and resolveItemOrder accepting BOTH wrapped {optimizable,items} AND bare array shapes so v1.1 callers don't break.  _(phase 52.5)_
- Adapted in expandPhases rather than requiring callers (run/runtime loop) to pre-unwrap — keeps the public contract symmetric with parseParentOutput's return value and makes back-compat free.  _(phase 52.5)_
- Kept the legacy bare-array test alongside the wrapped-object tests rather than deprecating it — back-compat is a real contract for any v1.1 caller upgrading.  _(phase 52.5)_
- Renamed scenario C from 'partial depends_on -> array fallback' to 'no-optimizable -> array mode' to reflect that the trigger is now the missing top-level flag, not the partiality of per-item edges.  _(phase 52.5)_
- Wrote MIGRATION-v1.2.md as a fresh file rather than amending CHANGELOG — the 52-02 CHANGELOG entry stays accurate for the broader v1.2 surface area; the migration note focuses just on the optimizable contract change so future readers find it under one heading.  _(phase 52.5)_
- Quoted the principles list entry to escape the inline backtick block containing 'optimizable: true' — YAML otherwise parses the unquoted colon as a mapping.  _(phase 52.5)_
- Kept the dev.yaml prompt prescriptive about WHEN to set optimizable:true ('only if confident about ALL') so agents default to safe sequential rather than overclaiming knowledge.  _(phase 52.5)_

**Patterns established:**
- lib/types.js as the shared typedef home for cross-layer data shapes  _(phase 49)_
- Plain counter test harness with 'Passed: N   Failed: 0' output format  _(phase 49)_
- Tier-file scaffolding pattern: opt-in via explicit call from CLI layer; never auto-overwrite  _(phase 49)_
- Unified Phase[] emission from template — call site for runtime fan-out planning (consumed by phase 50)  _(phase 49)_
- Persist primitive call site — consumed by phase 50 fan-out runtime to materialise structured-list children into milestone DESIGN.md  _(phase 49)_
- Parent-set pre-pass once per validate call; reused by all parent-aware rules  _(phase 50)_
- Fan-out expander returns a single flat execution order; runtime walks it like a normal Phase list  _(phase 50)_
- Three-stage parent contract: build -> parse -> enforce, each independently testable  _(phase 50)_
- Runtime contract amendments amplify the parent agent's expressive power without changing workflow YAML schema  _(phase 50)_
- All-or-nothing resolution surfaces a clear opt-in path to parallelism (agent annotates everything) and a safe default (sequential)  _(phase 50)_

**Files (created):** lib/types.js, test/unit-types.js, test/unit-milestone-reader.js, test/unit-workflow-phase-adapter.js, lib/persist.js, test/unit-persist.js, test/unit-workflow-schema-v12.js, lib/fanout.js, test/unit-fanout.js, lib/runtime-fanout.js, test/unit-runtime-fanout.js, templates/workflows/dev-v2.yaml, test/integration-fanout-v12.js
**Files (modified):** package.json, lib/milestone.js, lib/workflow.js, lib/runtime-fanout.js, lib/fanout.js, test/unit-runtime-fanout.js, test/unit-fanout.js, .planning/phases/50-fan-out-runtime/DESIGN.md, lib/autonomous.js, bin/commands/autonomous.js, commands/cp/autonomous.md, test/unit-autonomous.js, test/dryrun-workflow-cli.js, test/integration-fanout-v12.js, templates/workflows/dev.yaml

**Phase summaries:**
- Phase 49: Foundations + tier files + persist primitives — see `.planning/phases/49-foundations-tier-files-persist-primitive/`
- Phase 50: Fan-out runtime (parent: field, sibling pairing, max_children, 1-level limit) — see `.planning/phases/50-fan-out-runtime-parent-field-sibling-pai/`
- Phase 51: CLI shims + deprecate cp-plan-phase — see `.planning/phases/51-cli-shims-deprecate-cp-plan-phase/`
- Phase 52: Docs + MIGRATION-v1.2.md + v1.2.0 release — see `.planning/phases/52-docs-migration-v1-2-md-v1-2-0-release/`
- Phase 52.5: optimizable fan-out flag — see `.planning/phases/52.5-optimizable-fan-out-flag/`

**Phase designs:**
- Phase 49 — `.planning/phases/49-unified-phase-type-reader-abstractions/DESIGN.md`
- Phase 50 — `.planning/phases/50-fan-out-runtime/DESIGN.md`

## v1.3 Reusable Phase Templates  — shipped 2026-05-27

**Phases:** 53-58    **Plans:** 23    **Duration:** —

**Key decisions:**
- _wrapperKind is non-enumerable so it never leaks into JSON.stringify but is readable for validate() in 53-02.  _(phase 53)_
- Multi-key entries containing phase: are treated as bare (not wrapped) to avoid ambiguity; only single-key wrappers count.  _(phase 53)_
- expected-vs-actual drift: 2 expected-but-untouched (lib/workflow.js, test/unit-workflow-schema-v13.js)  _(phase 53)_
- Template entries share the same id-uniqueness map as phase entries so collisions surface as duplicate-id errors at validation time.  _(phase 53)_
- validateV12Schema filters out template entries so v1.2 parent/persist/max_children rules do not fire against them.  _(phase 53)_
- DAG analysis is fully disabled when any template entry is present; Phase 55 will re-enable it after expansion.  _(phase 53)_
- expected-vs-actual drift: 2 expected-but-untouched (lib/workflow.js, test/unit-workflow-schema-v13.js)  _(phase 53)_
- depends_on is auto-added by normalisePhase so it cannot be a forbidden key; instead it is flagged only when user-populated (length > 0).  _(phase 53)_
- Phase-template references emit a Phase 54 guard error (separate from the Phase 55 guard for workflow-template inclusion) since the two resolve in different phases.  _(phase 53)_
- Inner template: blocks accept only name + args; any other key (e.g., a misspelled override field) is rejected with a precise path.  _(phase 53)_
- expected-vs-actual drift: 2 expected-but-untouched (lib/workflow.js, test/unit-workflow-schema-v13.js)  _(phase 53)_
- Fixtures live under templates/workflows/_fixtures-v13/ so they share the resolution path with shipping workflows but are namespaced for test-only use.  _(phase 53)_
- Integration tests assert ONLY the absence of field-rules violations on the well-formed template-include-stub.yaml fixture, so future Phase 55 work can flip the guard off without forcing test rewrites.  _(phase 53)_
- The error fixtures pin the exact violation classes (forbidden prompt: on template inclusion; phase-level role/prompt overrides on a phase-template reference) to lock down DESIGN.md Q3/Q4 semantics.  _(phase 53)_
- expected-vs-actual drift: 3 expected-but-untouched (test/integration-workflow-v13.js, lib/workflow.js, test/unit-workflow-schema-v13.js)  _(phase 53)_
- Loader returns {name,params,body,sourcePath}; body excludes template meta keys.  _(phase 54)_
- Inner template: in body is permitted at loader level — chain semantics handled by 54-03 resolver.  _(phase 54)_
- expected-vs-actual drift: 2 expected-but-untouched (lib/phase-template-loader.js, test/unit-phase-template-loader.js)  _(phase 54)_
- TOKEN_RE requires JS-identifier characters; {{a-b}} treated as literal.  _(phase 54)_
- Whole-string preservation is critical for numeric fields like max_children — resolver casts at field boundary.  _(phase 54)_
- expected-vs-actual drift: 4 expected-but-untouched (lib/template-substitute.js, test/unit-template-substitute.js, lib/phase-template-loader.js, test/unit-phase-template-loader.js)  _(phase 54)_
- Try/catch around resolver call so missing-template errors do not block field-rules validation of the same wrapper.  _(phase 54)_
- Resolved phase preserves wrapper id (caller wins) and after[] array; template body cannot override.  _(phase 54)_
- _resolverErrors and _resolverWarnings stashed on template object for validate() to surface.  _(phase 54)_
- expected-vs-actual drift: 7 expected-but-untouched (lib/workflow.js, lib/phase-template-resolver.js, test/unit-phase-template-resolver.js, lib/phase-template-loader.js, test/unit-phase-template-loader.js, lib/template-substitute.js, test/unit-template-substitute.js)  _(phase 54)_
- Chain fixtures live under templates/phase-templates/_fixtures-v13/ to avoid polluting top-level user-facing dir; tests copy into temp project dir.  _(phase 54)_
- reviewer.yaml is real shipping content, not a fixture — Phase 57 will adopt in dev.yaml.  _(phase 54)_
- expected-vs-actual drift: 9 expected-but-untouched (templates/phase-templates/_fixtures-v13/, test/integration-phase-templates-v13.js, lib/phase-template-loader.js, test/unit-phase-template-loader.js, lib/template-substitute.js, test/unit-template-substitute.js, lib/workflow.js, lib/phase-template-resolver.js, test/unit-phase-template-resolver.js)  _(phase 54)_
- Separate namespace for workflow-templates (vs phase-templates)  _(phase 55)_
- Reserve -- as namespace separator; reject internal ids containing --  _(phase 55)_
- Accept bare, phase: and template: wrapped entries; loader extracts canonical internal id  _(phase 55)_
- Prefix every materialized id with <groupId>--  _(phase 55)_
- Rewrite internal after/depends_on edges with prefix; leave external refs alone  _(phase 55)_
- Wrapper after: prepended to entry phases; exit-phase ids returned for outer rewriter  _(phase 55)_
- MAX_DEPTH=3 chain cap; empty group is an error  _(phase 55)_
- Run expansion as a second pass after phase-template resolver; splice phases in place  _(phase 55)_
- Pass 3: rewrite after: <groupId> on outside phases to the exit-phase id list  _(phase 55)_
- Drop obsolete Phase 54/55 not-yet-implemented guards; keep field-rules enforcement  _(phase 55)_
- Ship review-and-address.yaml as the canonical workflow template  _(phase 55)_
- Quote {{token}} inside YAML flow-sequence values to avoid parser errors  _(phase 55)_
- Chain fixtures stage into project dir to exercise project-shadows-builtin lookup  _(phase 55)_
- [object Object]  _(phase 56)_
- [object Object]  _(phase 56)_
- [object Object]  _(phase 56)_
- [object Object]  _(phase 56)_
- [object Object]  _(phase 56)_
- [object Object]  _(phase 57)_
- [object Object]  _(phase 57)_
- [object Object]  _(phase 57)_
- [object Object]  _(phase 58)_
- [object Object]  _(phase 58)_
- [object Object]  _(phase 58)_

**Phase summaries:**
- Phase 53: Schema and loader for phase/template wrappers — see `.planning/phases/53-schema-and-loader-for-phase-template-wra/`
- Phase 54: Template resolution and args substitution — see `.planning/phases/54-template-resolution-and-args-substitutio/`
- Phase 55: Workflow-template expansion and dependency rewriting — see `.planning/phases/55-workflow-template-expansion-and-dependen/`
- Phase 56: CLI commands for templates — see `.planning/phases/56-cli-commands-for-templates/`
- Phase 57: Dogfood dev.yaml with templates — see `.planning/phases/57-dogfood-dev-yaml-with-templates/`
- Phase 58: Docs and v1.3.0 release — see `.planning/phases/58-docs-and-v1-3-0-release/`

## v1.4 Workflow-driven quick and milestone  — shipped 2026-05-28

**Phases:** 59-63    **Plans:** 16    **Duration:** —

**Key decisions:**
- [object Object]  _(phase 59)_
- [object Object]  _(phase 59)_
- [object Object]  _(phase 59)_
- [object Object]  _(phase 59)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- [object Object]  _(phase 60)_
- JSON not YAML for project-update payloads  _(phase 61)_
- Idempotent ops via substring match on bullet text  _(phase 61)_
- STATE.md marker block uses HTML comments  _(phase 61)_
- Soft abandon only — code revert is the user's decision  _(phase 61)_
- cp status dispatches on positional arg presence (no breaking change)  _(phase 61)_
- Quick slugs prefixed with UTC date for natural sort  _(phase 61)_
- Mark workflow as supervised: true (Option A)  _(phase 62)_
- Use kind: scaffold for the four deterministic CLI steps  _(phase 62)_
- Materialize phase breakdown to ROADMAP.md, not inline children  _(phase 62)_
- quick.yaml is supervised (LLM in design+execute); complete-milestone is pure deterministic  _(phase 62)_
- execute phase declares outputs: ['**/*'] since arbitrary code change is the point  _(phase 62)_
- Slash wrappers contain zero orchestration logic — they sanitize args and shell out to `cp run`.  _(phase 62)_
- Use `depends_on:` (not `after:`) for top-level sequencing because that is what the workflow engine reads for wave computation.  _(phase 62)_
- Update v1.3 contract test (unit-autonomous.js quick-DESIGN.md check) to v1.4 reality: wrapper delegates, scaffolding is the workflow's job.  _(phase 62)_
- Quick start example uses the real v1.4 quick.yaml shape (setup/design/execute/finalize) to keep docs in sync with code.  _(phase 63)_
- Internal `*-setup` / `*-finalize` verbs are documented but flagged as 'internal verb used by the workflow phase' to discourage direct user invocation.  _(phase 63)_
- Forward-reference MIGRATION-v1.4.md (authored in 63-02).  _(phase 63)_
- Frame v1.4 as backwards-compatible for end users; only workflow customizers and CLI scripters need to act.  _(phase 63)_
- Document the `after:` vs `depends_on:` distinction as a clarification (not a new rule) so users understand why v1.4 built-ins switched.  _(phase 63)_
- Provide a concrete bash recipe for re-merging a project-local quick.yaml fork.  _(phase 63)_
- Follow Keep a Changelog ordering: Added, Changed, then a Migration callout pointing at MIGRATION-v1.4.md.  _(phase 63)_
- Explicitly flag the quick workflow phase-id rename as breaking, matching the migration guide.  _(phase 63)_

**Files (created):** bin/commands/checkpoint.js, bin/commands/classify.js, commands/cp/classify.md, commands/cp/run-supervised.md, lib/checkpoint.js, lib/classify.js, lib/supervisor.js, test/unit-checkpoint.js, test/unit-classify.js, test/unit-supervisor-state.js, test/integration-supervisor-flow.js, bin/commands/milestone-finalize.js, bin/commands/milestone-setup-check.js, bin/commands/project.js, lib/milestone-helpers.js, lib/project-update.js, test/unit-milestone-helpers.js, test/unit-project-update.js, bin/commands/abandon.js, bin/commands/list.js, bin/commands/quick-finalize.js, bin/commands/quick-setup.js, lib/quick-helpers.js, lib/run-lifecycle.js, test/unit-run-lifecycle.js, templates/workflows/milestone.yaml, templates/workflows/complete-milestone.yaml, MIGRATION-v1.4.md
**Files (modified):** bin/commands/index.js, bin/commands/run.js, lib/workflow.js, test/unit-workflow-schema-v14.js, package.json, bin/commands/status.js, templates/workflows/quick.yaml, commands/cp/complete-milestone.md, commands/cp/new-milestone.md, commands/cp/quick.md, test/dryrun-run-cli.js, test/dryrun-workflow-cli.js, test/integration-run-cli.js, test/unit-autonomous.js, README.md, CHANGELOG.md

**Phase summaries:**
- Phase 59: YAML grammar overhaul: phase/template wrappers + description — see `.planning/phases/59-yaml-grammar-overhaul-phase-template-wra/`
- Phase 60: Engine + supervisor + broker + checkpoint (unified runtime) — see `.planning/phases/60-engine-supervisor-broker-checkpoint-unif/`
- Phase 61: Reserved CLI verbs (project + milestone + quick helpers) — see `.planning/phases/61-reserved-cli-verbs-project-milestone-qui/`
- Phase 62: Workflow YAMLs + slash wrappers (quick / milestone / complete-milestone) — see `.planning/phases/62-workflow-yamls-slash-wrappers-quick-mile/`
- Phase 63: Docs + MIGRATION-v1.4.md + v1.4.0 release — see `.planning/phases/63-docs-migration-v1-4-md-v1-4-0-release/`

## v1.5 Role/skill semantics  — shipped 2026-05-28

**Phases:** 64-75    **Plans:** 0    **Duration:** —

**Phase summaries:**
- Phase 64: setup — see `.planning/phases/64-setup/`
- Phase 65: brainstorm — see `.planning/phases/65-brainstorm/`
- Phase 66: propose-project-updates — see `.planning/phases/66-propose-project-updates/`
- Phase 67: apply-project-updates — see `.planning/phases/67-apply-project-updates/`
- Phase 68: propose-phases — see `.planning/phases/68-propose-phases/`
- Phase 69: finalize — see `.planning/phases/69-finalize/`
- Phase 70: Config token interpolation in workflow expansion — see `.planning/phases/70-config-token-interpolation-in-workflow-e/`
- Phase 71: Skill routing via provider.resolveSkill in runtime — see `.planning/phases/71-skill-routing-via-provider-resolveskill-/`
- Phase 72: Schema validator role/skill orthogonality — see `.planning/phases/72-schema-validator-role-skill-orthogonalit/`
- Phase 73: Rewrite built-in workflow YAMLs — see `.planning/phases/73-rewrite-built-in-workflow-yamls/`
- Phase 74: Migrate workflow test fixtures and tests — see `.planning/phases/74-migrate-workflow-test-fixtures-and-tests/`
- Phase 75: Docs + CHANGELOG + v1.5.0 release — see `.planning/phases/75-docs-changelog-v1-5-0-release/`
