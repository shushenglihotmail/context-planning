'use strict';

/**
 * Installer for GitHub Copilot CLI.
 *
 * Copilot CLI looks for skills in `<repo>/.github/skills/<name>/` (project-scoped)
 * or `~/.copilot/skills/<name>/` (user-scoped). It also reads a custom instruction
 * block injected into the system prompt.
 *
 * Each command becomes a skill named `cp-<name>`, with a SKILL.md that contains
 * the command's instructions. The skill files are harness-agnostic (just markdown);
 * Copilot picks them up by name.
 */

const fs = require('fs');
const path = require('path');
const { listCommandFiles, writeFile, writeFileSafe, homeDir, buildDriftDefenseBlock } = require('./common');

function install({ pluginRoot, repoRoot, force = false }) {
  const target = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.copilot', 'skills')
    : path.join(repoRoot, '.github', 'skills');

  console.log(`Installing cp commands as Copilot skills into:`);
  console.log(`  ${target}`);

  let written = 0;
  let identical = 0;
  const userModified = [];
  for (const { name, src } of listCommandFiles(pluginRoot)) {
    const skillName = `cp-${name}`;
    const skillDir = path.join(target, skillName);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const body = fs.readFileSync(src, 'utf8');
    const r = writeFileSafe(skillMd, body, { force });
    if (r.status === 'written')           { console.log(`  + ${skillName}`); written++; }
    else if (r.status === 'identical')    { console.log(`  = ${skillName} (unchanged)`); identical++; }
    else if (r.status === 'user-modified') { console.log(`  ! ${skillName} (LOCALLY MODIFIED — kept)`); userModified.push(skillName); }
  }

  // The ambient instruction file is cp-owned end-to-end (we rewrite the
  // whole block every install). Apply the same collision rule though so a
  // user who hand-edited it doesn't silently lose changes.
  const ctxDest = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.copilot', 'context-planning.md')
    : path.join(repoRoot, '.github', 'context-planning.md');

  const ctxBody = `<!-- context-planning (cp) — managed by cp installer -->
# Instructions for context-planning (cp)

- When the user invokes a \`/cp-*\` slash command (or \`cp-*\` skill), load the
  matching SKILL.md from \`.github/skills/cp-*\`.
- \`cp\` owns the *state layer* (PROJECT.md / ROADMAP.md / STATE.md / phase dirs).
  It delegates *workflow* to whatever provider is configured in
  \`.planning/config.json\` under the top-level \`cp:\` block (default
  provider: superpowers). The same \`config.json\` is shared with GSD when
  GSD is also installed — they coexist via separate top-level keys.
- For each role (brainstorm, plan, execute, review, finish), invoke the matching
  provider skill via its own slash-command, then return to cp to record the
  state change.
- Always update .planning/STATE.md after a phase/quick task is completed; tick
  the matching checkbox in .planning/ROADMAP.md; write SUMMARY.md.
- Only invoke cp commands when the user explicitly asks. Don't apply cp
  workflows unbidden.
<!-- /context-planning -->

${buildDriftDefenseBlock(pluginRoot)}`;
  const ctxR = writeFileSafe(ctxDest, ctxBody, { force });
  if (ctxR.status === 'user-modified') userModified.push(path.basename(ctxDest));

  console.log(`\nInstalled: ${written} written, ${identical} unchanged${userModified.length ? `, ${userModified.length} kept (locally modified)` : ''}.`);
  console.log(`Context file: ${ctxDest} (${ctxR.status})`);
  if (userModified.length > 0) {
    console.log(`\n⚠ The following files exist on disk with local modifications and were NOT overwritten:`);
    for (const f of userModified) console.log(`    - ${f}`);
    console.log(`  Re-run with \`cp install copilot --force\` to overwrite them, or delete the local copy first.`);
  }
  console.log(`\nNext steps:`);
  console.log(`  1. Make sure your workflow provider (default: superpowers) is installed.`);
  console.log(`     copilot plugin install superpowers@superpowers-marketplace`);
  console.log(`  2. In a project directory:  cp init`);
  console.log(`  3. Then in Copilot CLI:     /cp-new-milestone "my first milestone"`);

  return { written, identical, userModified };
}

module.exports = { install };
