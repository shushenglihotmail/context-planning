Decomposed v1.6 into 4 implementation phases (scaffolded as 82-85):

- Phase 82 prompt-scrub-and-config-fallbacks (D3+D4): expand CONFIG_FALLBACKS with 5 rows; 6 inline prompt-scrub edits in cp-quick/cp-workflow-run/cp-new-project/cp-execute-phase. depends_on: []
- Phase 83 invoke-skill-directive (D2): formatWaveBlock change to 'invoke skill:' directive + one-time wave legend with unavailable-skill fallback; gate (source: routing-key) behind --verbose. depends_on: []
- Phase 84 auto-inject-finalize (D1): inject implicit finalize phase at workflow-load when YAML omits one; add generic 'cp run-finalize <slug>' CLI. depends_on: []
- Phase 85 docs-changelog-release: README + skill docs + CHANGELOG + npm publish as context-planning@1.6.0. depends_on: [82, 83, 84]

82-84 are parallelizable; 85 is the release wrapper. User approved breakdown as-is.
