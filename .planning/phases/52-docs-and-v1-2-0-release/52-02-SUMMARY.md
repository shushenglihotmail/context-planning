---
phase-id: "52"
title: CHANGELOG.md + README.md v1.2 updates
outcome: "Added complete [1.2.0] section to CHANGELOG.md (Added/Changed/Deprecated/Internal) covering fan-out, depends_on inter-child ordering, persist_output->persist rename, custom->quick collapse, cp-plan-phase deprecation, cp-quick rewrite, and cp autonomous --workflow flag. Updated README.md: slash-commands table marks cp-plan-phase deprecated and documents new cp-autonomous --workflow + cp-quick DESIGN+STATE shape; built-in templates table reflects binds_to:quick; added new 'Fan-out (v1.2)' section with parent/after/max_children YAML example and depends_on toposort JSON example; State layer diagram now shows DESIGN.md+STATE.md per phase and renames custom/->quick/ with migration note."
key-decisions:
  - Listed fan-out + depends_on as the headline v1.2 feature in both CHANGELOG and README — it's the most user-visible authoring change.
  - Marked /cp-plan-phase as deprecated in the slash-commands table rather than removing the row, so v1.1 users searching the README still find it and see the migration target.
  - Added a short v1.2 callout banner under the built-in templates table and the State layer diagram instead of restructuring those sections — keeps existing v1.1 readers oriented while flagging the renames.
  - Did NOT bump package.json or tag (that's 52-03). Only doc files touched.
key-files:
  - path: CHANGELOG.md
    change: modified
    note: added [1.2.0] section, ~75 lines
  - path: README.md
    change: modified
    note: slash-commands table, templates table, new Fan-out section, State layer diagram
phase: 52
plan: 52-02
completed: 2026-05-26
end-commit: fddebfe80251268c1a3c30e26914c1203e15a04b
---
# Summary 52-02

Plan 52-02 completed.
