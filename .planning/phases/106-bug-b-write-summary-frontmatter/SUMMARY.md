Bug B complete via SDD (2 commits).

Commits:
- 19bb703 fix(milestone): read expected_files from PLAN frontmatter (Bug B)
- 1a4195e fix(milestone): add deprecation warning + debug log + e2e tests (Bug B follow-up)

Change: writeSummary() now reads structured expected_files: from PLAN.md frontmatter (back-compat: legacy expected-key-files: still honored, body-scrape fallback removed in favor of explicit no-validation when frontmatter absent + DEBUG log). Added deprecation warning for --no-file-check.

Files: lib/milestone.js, bin/commands/write-summary.js, test/unit-libs.js, test/dryrun-write-summary.js.

Tests: 33 dryrun-write-summary assertions (+4), 132 unit-libs. Full npm test green.

Reviews: Spec+quality review (Haiku) flagged 3 gaps after first commit (deprecation warning, debug log, e2e tests). Follow-up commit 1a4195e closed all 3. TDD: e2e tests written failing first, green after impl.
