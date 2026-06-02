Milestone review complete. Final cross-cutting review (background, code-review agent) surfaced 1 MEDIUM blocker + 1 LOW nit. Both fixed in commit f2ca64a.

Fixes:
- MEDIUM: Bug F audit rule false-positive on scaffold/skill-less phases. Fix B: write resolved_skill alongside invoked_skill; audit rule skips records where resolved_skill = '(absent)'. ~10 lines plumbing. Future-proof contract.
- LOW: Bug B follow-up deprecation warning misleadingly named the legacy key for plans that never used it. Reworded.

Files: lib/runtime.js, lib/audit.js, lib/milestone.js, +3 test files extended (+6 assertions).

All 14 prior audit assertions still pass; back-compat preserved (old run-state JSON without resolved_skill field gets conservative treatment — no skip, original behavior). Full npm test green.

Reviews this milestone:
- Bug A: combined spec+quality (Haiku) APPROVED first pass
- Bug B: spec+quality flagged 3 gaps → follow-up commit 1a4195e closed all
- Bug C: spec+quality APPROVED first pass
- Bug D: spec+quality flagged spec deviation → reconciled via doc commit 5d9b19c (size/mtime rule deliberate override; safer than draft)
- Bug E: spec+quality APPROVED first pass
- Bug F: spec+quality APPROVED first pass
- Cross-cutting final review (code-review agent): 1 MEDIUM + 1 LOW → fixed in f2ca64a

invoked_skill: (inline-fallback)
