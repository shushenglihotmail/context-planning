---
phase: 16-design-capture-infrastructure
plan: "03"
type: execute
wave: 3
depends_on: ["16-01"]
files_modified:
  - lib/milestone.js
  - bin/commands/write-summary.js
  - commands/cp/write-summary.md
  - test/unit-design.js
  - .planning/phases/15-*/summaries (10 backfills, gitignored)
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "cp write-summary exits 2 with exact error message if key-decisions empty"
    - "cp-write-summary skill instructs callers to populate key-decisions"
    - "existing v0.6 SUMMARYs backfilled with key-decisions (dogfood)"
  artifacts:
    - "lib/milestone.writeSummary throws ValidationError on empty key-decisions"
    - "test/unit-design.js extended with validation assertions"
    - "Exit code 2 from CLI on bad input"
  key_links:
    - "docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md"
---

<objective>
Plan 16-03: key-decisions hard-block (Phase 16, milestone v0.7 Design Capture).

Purpose: Prevent silent "key-decisions: []" SUMMARYs that erase decision
rationale. `cp write-summary` MUST exit 2 with the exact error message:

  Error: 'key-decisions' is required and must have ≥1 entry. See spec at
  docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md

The validation runs in `lib/milestone.writeSummary`; the CLI handler
propagates the throw as exit code 2.

Scope: validation + skill update + backfill 10 existing v0.6 dogfood SUMMARYs.
</objective>

<execution_context>
@.planning/config.json
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md
@.planning/phases/16-design-capture-infrastructure/DESIGN.md
</context>

<tasks>

# Implementation Plan — Bite-Sized Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/milestone.js` | Modify | `writeSummary()` throws `ValidationError` if `key-decisions` missing or empty |
| `bin/commands/write-summary.js` | Modify | Catch `ValidationError`; print exact error message; `process.exit(2)` |
| `commands/cp/write-summary.md` (if exists) | Modify | Skill doc — note hard-block, recommend minimum 1 decision per plan |
| `test/unit-design.js` | Modify | Append validation tests (empty array, missing key, valid input, exit code via subprocess) |
| Existing v0.6 SUMMARY files | Backfill (.planning gitignored) | Add at least 1 `key-decisions` entry to each existing SUMMARY |

---

## Task 1: Add validation in lib/milestone.writeSummary

**Files:**
- Modify: `lib/milestone.js`
- Modify: `test/unit-design.js`

- [ ] **Step 1: Inspect** — open `lib/milestone.js`, find `writeSummary` function. Note its exact signature and where it currently writes the YAML — validation must happen BEFORE write.

- [ ] **Step 2: Failing test** — append to `test/unit-design.js`:

```javascript
section('lib/milestone: writeSummary validates key-decisions');
{
  const milestoneLib = require('../lib/milestone');
  const root = mktmp('ws-validate');
  fs.mkdirSync(path.join(root, '.planning', 'phases', '50-test'), { recursive: true });

  const empty = { phase: '50', plan: '01', 'key-decisions': [] };
  let caught = null;
  try { milestoneLib.writeSummary(root, '50-01', empty); }
  catch (e) { caught = e; }
  ok('empty key-decisions throws', caught !== null);
  ok('error message mentions key-decisions',
    caught && caught.message.includes("'key-decisions' is required"));
  ok('error message references spec',
    caught && caught.message.includes('docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md'));

  const missing = { phase: '50', plan: '01' };
  let caught2 = null;
  try { milestoneLib.writeSummary(root, '50-01', missing); }
  catch (e) { caught2 = e; }
  ok('missing key-decisions throws', caught2 !== null);

  const valid = { phase: '50', plan: '01', 'key-decisions': ['decision 1'] };
  let caught3 = null;
  try { milestoneLib.writeSummary(root, '50-01', valid); }
  catch (e) { caught3 = e; }
  ok('valid input does not throw', caught3 === null);
}
```

- [ ] **Step 3: Run** — `node test/unit-design.js` — expect new section fails.

- [ ] **Step 4: Implement validation** — in `lib/milestone.js`, add a `ValidationError` class (or use a tagged Error) and inject validation at the TOP of `writeSummary` body:

```javascript
class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; this.code = 'EVALIDATION'; }
}

// inside writeSummary, before any write:
const kd = data && data['key-decisions'];
if (!Array.isArray(kd) || kd.length === 0) {
  throw new ValidationError(
    "Error: 'key-decisions' is required and must have ≥1 entry. See spec at docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md"
  );
}
```

Export `ValidationError` from `lib/milestone.js` so the CLI handler can `instanceof`-check it.

- [ ] **Step 5: Run test** — `node test/unit-design.js` — expect all pass.

- [ ] **Step 6: Full suite** — `npm test`. If existing tests in `test/unit-libs.js`, `test/dryrun-*.js`, or `test/unit-lifecycle.js` call `writeSummary` with empty/missing key-decisions, those tests will FAIL. For each failing test, EITHER add a stub `'key-decisions': ['test decision']` to its input data, OR (if the test was specifically asserting empty-input behavior) update it to assert the new throw.

- [ ] **Step 7: Commit**

```bash
git add lib/milestone.js test/unit-design.js test/<any-other-modified-tests>
git commit -m "cp(16-03): writeSummary throws ValidationError on empty key-decisions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: CLI handler exits 2 on validation error

**Files:**
- Modify: `bin/commands/write-summary.js`
- Modify: `test/unit-design.js`

- [ ] **Step 1: Read current handler** — open `bin/commands/write-summary.js`. Find where it calls `milestone.writeSummary(...)`. Wrap in try/catch.

- [ ] **Step 2: Add try/catch**

```javascript
try {
  milestone.writeSummary(root, planId, data);
} catch (err) {
  if (err && (err.name === 'ValidationError' || err.code === 'EVALIDATION')) {
    process.stderr.write(err.message + '\n');
    process.exit(2);
  }
  throw err;
}
```

- [ ] **Step 3: Subprocess test** — append to `test/unit-design.js`:

```javascript
section('CLI: cp write-summary exits 2 on empty key-decisions');
{
  const { spawnSync } = require('child_process');
  const root = mktmp('ws-cli');
  fs.mkdirSync(path.join(root, '.planning', 'phases', '50-test'), { recursive: true });
  const json = path.join(root, 'bad.json');
  fs.writeFileSync(json, JSON.stringify({ phase: '50', plan: '01', 'key-decisions': [] }));

  const cpBin = path.join(__dirname, '..', 'bin', 'cp.js');
  const r = spawnSync(process.execPath, [cpBin, 'write-summary', '50-01', '--from', json], { cwd: root, encoding: 'utf8' });
  ok('exit code is 2', r.status === 2);
  ok('stderr includes key-decisions error',
    (r.stderr || '').includes("'key-decisions' is required"));
}
```

- [ ] **Step 4: Run** — `node test/unit-design.js` — expect all pass.

- [ ] **Step 5: Full suite** — `npm test`. All green.

- [ ] **Step 6: Commit**

```bash
git add bin/commands/write-summary.js test/unit-design.js
git commit -m "cp(16-03): write-summary CLI exits 2 on ValidationError

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Update cp-write-summary skill doc

**Files:**
- Modify: `commands/cp/write-summary.md` (if exists; else `.github/skills/cp-write-summary/SKILL.md`)

- [ ] **Step 1: Locate the skill** — `Get-ChildItem commands/cp/ | Where-Object Name -Match write-summary`.

- [ ] **Step 2: Add a "Required keys" section** at the top:

```markdown
## Required keys (v0.7 hard-block)

- `key-decisions`: **REQUIRED**. Array with ≥1 entry. Each entry is one
  sentence describing a non-trivial decision made during the plan
  (architecture, library choice, trade-off, deferred work, etc.).
  Trivial / mechanical steps do not count.

The cp CLI exits with code 2 and prints the following exact message if
this constraint is violated:

  Error: 'key-decisions' is required and must have ≥1 entry. See spec at
  docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md

If a plan genuinely had no decisions worth recording (e.g. a typo fix),
note that explicitly: `key-decisions: ['mechanical edits only — no design decisions']`.
```

If the file doesn't exist, create it with that section plus a brief skeleton.

- [ ] **Step 3: Verify**

`node -e "const f=require('fs').readFileSync('commands/cp/write-summary.md','utf8'); if(!f.includes('Required keys')||!f.includes('key-decisions')){console.error('missing');process.exit(1);} console.log('OK');"`

- [ ] **Step 4: Commit**

```bash
git add commands/cp/write-summary.md
git commit -m "cp(16-03): document key-decisions hard-block in cp-write-summary skill

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Backfill existing v0.6 SUMMARY files

**Files:** `.planning/phases/15-*/15-*-SUMMARY.md` and prior phases (10 files; all gitignored).

- [ ] **Step 1: List all existing SUMMARY files** — `Get-ChildItem .planning/phases -Recurse -Filter "*-SUMMARY.md" | Select-Object FullName`.

- [ ] **Step 2: For each file, check if `key-decisions:` is empty (`[]`) or missing**. If so, edit to add at least one entry summarizing the plan's actual decisions (look at the plan's commit messages and the SUMMARY body for context).

   This is a manual / semi-manual task. A minimum acceptable entry is one sentence describing the plan's primary architectural or process decision. For purely mechanical plans (typo fix, version bump), use: `key-decisions: ['mechanical edits only — no design decisions']`.

- [ ] **Step 3: After backfill, verify by running** — `cp progress` (or scan summaries) — no SUMMARY file has empty `key-decisions`.

- [ ] **Step 4: No commit** — `.planning/` is gitignored. Document backfill in plan SUMMARY.

---

## Task 5: Coverage gate + verification

- [ ] **Step 1:** `npm run coverage:ci` — exit 0; ≥85L / ≥75B.

- [ ] **Step 2: End-to-end verification** of v0.7:
  - `node bin/cp.js scaffold-phase 99 --name smoke --dry-run` lists 4 actions
  - `node bin/cp.js scaffold-milestone "v0.99 Smoke" --dry-run` lists 2 actions
  - `echo '{"phase":"99","plan":"01"}' > bad.json; node bin/cp.js write-summary 99-01 --from bad.json` — exit 2, exact error message
  - `echo '{"phase":"99","plan":"01","key-decisions":["dec1"]}' > good.json; node bin/cp.js write-summary 99-01 --from good.json` — exit 0

</tasks>

<verification>
- [ ] `npm test` — all 20 files `Failed: 0`
- [ ] `npm run coverage:ci` — ≥85L / ≥75B
- [ ] Empty key-decisions JSON → exit 2 + exact stderr message
- [ ] Valid key-decisions JSON → exit 0
- [ ] All existing SUMMARY files have ≥1 key-decisions entry
</verification>

<success_criteria>
- lib/milestone.writeSummary validates key-decisions; throws ValidationError
- bin/commands/write-summary.js catches and exits 2 with exact spec message
- cp-write-summary skill doc updated
- All v0.6 SUMMARYs backfilled
- v0.7 is feature-complete; ready for release
</success_criteria>

<output>
After completion: `cp write-summary 16-03 --from <json>` (with non-empty key-decisions!), then release v0.7.0.
</output>
