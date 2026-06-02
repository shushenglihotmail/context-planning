# templates/workflows/milestone.yaml: insert verify scaffold phase before review + depends_on wiring + integration tests

Insert new verify phase in milestone.yaml immediately before review, kind: scaffold, command: 'cp run-verify {{milestone_slug}}'. Add depends_on: [verify] to review phase. Confirm authoring policy in the file: brainstorm_skill: brainstorming (strict), plan_skill: writing-plans (strict), review_skill: (code-review) (fuzzy). Integration test: full milestone run on synthetic fixture; verify-fail blocks review wave; --skip-verify works.
