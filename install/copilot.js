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
const { listCommandFiles, writeFile, homeDir } = require('./common');

function install({ pluginRoot, repoRoot }) {
  const target = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.copilot', 'skills')
    : path.join(repoRoot, '.github', 'skills');

  console.log(`Installing cp commands as Copilot skills into:`);
  console.log(`  ${target}`);

  let n = 0;
  for (const { name, src } of listCommandFiles(pluginRoot)) {
    const skillName = `cp-${name}`;
    const skillDir = path.join(target, skillName);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const body = fs.readFileSync(src, 'utf8');
    writeFile(skillMd, body);
    console.log(`  + ${skillName}`);
    n++;
  }

  // Also write a tiny CONTEXT.md that the harness picks up to teach the agent
  // how to invoke /cp commands.
  const ctxDest = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.copilot', 'context-planning.md')
    : path.join(repoRoot, '.github', 'context-planning.md');

  writeFile(ctxDest, `<!-- context-planning (cp) — managed by cp installer -->
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
`);

  console.log(`\nInstalled ${n} skill(s).`);
  console.log(`Wrote context: ${ctxDest}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Make sure your workflow provider (default: superpowers) is installed.`);
  console.log(`     copilot plugin install superpowers@superpowers-marketplace`);
  console.log(`  2. In a project directory:  cp init`);
  console.log(`  3. Then in Copilot CLI:     /cp-new-milestone "my first milestone"`);
}

module.exports = { install };
