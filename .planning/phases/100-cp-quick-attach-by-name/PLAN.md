---
phase: "100"
name: cp-quick-attach-by-name
milestone: Milestone workflow end-to-end + quick attach
status: complete
created: 2026-05-31
base-commit: cb96d190c8d6879cb3c656cd429e4cc485998416
---

# Phase 100: cp-quick-attach-by-name

Add `--project <name>` and `--milestone <name>` to `cp quick-setup`. Exact then
unique-substring resolution; friendly multi-line errors on miss/ambiguity.

## Plans

- [x] 100-01: lib/name-resolve.js + lib/milestone-scan.js + quick-setup.js flag handling + frontmatter prepend; +55 tests — 5102800

See `100-01-SUMMARY.md` for details.
