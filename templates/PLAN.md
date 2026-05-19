---
phase: {{PHASE_DIR}}
plan: {{PLAN_NUM_PADDED}}
type: execute
wave: {{WAVE}}
depends_on: []
files_modified: []
autonomous: true
requirements: []
user_setup: []

# Goal-backward verification (derived during planning, verified after execution)
must_haves:
  truths: []
  artifacts: []
  key_links: []
---

<objective>
{{OBJECTIVE}}

Purpose: {{PURPOSE}}
Output: {{OUTPUT}}
</objective>

<execution_context>
@.planning/config.json
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

<!--
Only reference prior plan SUMMARYs if genuinely needed:
  - This plan uses types/exports from prior plan
  - Prior plan made a decision that affects this plan
Do NOT reflexively chain summaries together.
-->
</context>

<tasks>

<!--
This section is owned by the workflow provider (configured: {{PROVIDER}},
plan skill: {{PLAN_SKILL}}). The provider replaces this comment with one
<task>…</task> block per actionable step. Each task should be 2-5 minutes,
file-scoped, and have a measurable verify/acceptance criterion.

GSD-compatible task shape:

  <task type="auto">
    <name>Task N: action-oriented name</name>
    <files>path/to/file.ext</files>
    <read_first>path/to/reference.ext</read_first>
    <action>What to do, with concrete values</action>
    <verify>Command or check that proves it worked</verify>
    <acceptance_criteria>
      - Grep-verifiable condition
    </acceptance_criteria>
    <done>Measurable acceptance criteria</done>
  </task>
-->

</tasks>

<verification>
Before declaring plan complete:
- [ ] {test command}
- [ ] {build / type check passes}
- [ ] {behavior verification}
</verification>

<success_criteria>
- All tasks completed
- All verification checks pass
- No errors or warnings introduced
- {plan-specific criteria}
</success_criteria>

<output>
After completion, create `.planning/phases/{{PHASE_DIR}}/{{PHASE_PLAN_PREFIX}}-SUMMARY.md`
</output>
