# Milestone Context — milestone-workflow-end-to-end-quick-attach

**Active milestone:** Milestone workflow end-to-end + cp quick attach-by-name
**Slug:** `milestone-workflow-end-to-end-quick-attach`
**Target version:** v1.8.0
**DESIGN.md:** `.planning/milestones/milestone-workflow-end-to-end-quick-attach/DESIGN.md`

## One-paragraph summary

Fix the milestone workflow so `cp run milestone "X"` actually drives every
planned ROADMAP row to commit + SUMMARY (today it stops after planning,
leaving execution to manual `/cp-execute-phase` calls). Add validator rules
that hard-fail any `materialize: roadmap-phases` parent missing
`supervised: true` or a `parent: <id>` child template, so this bug class
cannot recur. Separately, give `cp quick` a `--project <name>` /
`--milestone <name>` UX backed by a lightweight `~/.config/cp/projects.json`
registry and new `cp project list` + `cp milestone list` commands;
deprecate the existing `--project-path` flag.

## Three workstreams

- **A. Template fix** — milestone.yaml gains `child-plan` + `child-execute`
  children (mirrors quick.yaml) and `execute_skill` / `execute_role` params.
- **B. Runtime + validator hardening** — enforce supervised + has-children
  invariants; verify supervisor dispatch + ROADMAP write-back.
- **C. cp quick attach-by-name** — project registry, name resolution,
  `cp project list`, `cp milestone list`, deprecate `--project-path`.

## Why now

Surfaced by dogfooding v1.7. Symptom: ROADMAP currently has stale rows
(`Phase 96: setup`, `Phase 97: brainstorm`, etc.) from the milestone
workflow's internal phase ids leaking through — visible proof that the
fan-out isn't happening.
