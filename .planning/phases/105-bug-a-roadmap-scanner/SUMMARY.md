Bug A complete via SDD.

Commit: 6863637
Files: lib/roadmap.js (+2/-2), test/unit-libs.js (+25)

Change: listPhases() and listCollapsedPhaseNums() regexes widened from ^###  to ^#{3,4} to accept both h3 and h4 Phase headings (the root cause of WCCT's cp status blindness to ####-level phases).

Tests: 129/129 unit-libs green. Full npm test green.

Reviews: Combined spec+quality review (Haiku) approved on first pass: regex bounds tight (no h2/h5 creep), surgical scope (no scope creep into audit.js), comprehensive coverage (h4-only, mixed h3+h4, h4-in-collapsed-milestone).
