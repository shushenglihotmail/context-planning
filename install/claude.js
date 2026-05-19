'use strict';

/**
 * Installer for Claude Code.
 *
 * Claude Code looks for slash-commands in `<repo>/.claude/commands/<file>.md`
 * (project-scoped) or `~/.claude/commands/<file>.md` (user-scoped). Each
 * markdown file becomes a /command — the filename without the .md extension.
 *
 * Claude Code also reads `<repo>/.claude/CLAUDE.md` (and `~/.claude/CLAUDE.md`)
 * as ambient instructions for the agent. We append a small cp section so the
 * agent knows when to invoke /cp-* commands and how to talk to the workflow
 * provider.
 *
 * The same command markdown files used by the Copilot installer are reused
 * verbatim — they're harness-agnostic. Claude treats the YAML frontmatter as
 * metadata (name / description) and the body as instructions.
 */

const fs = require('fs');
const path = require('path');
const { listCommandFiles, writeFile, homeDir } = require('./common');

const CP_BLOCK_BEGIN = '<!-- context-planning (cp) — managed by cp installer -->';
const CP_BLOCK_END = '<!-- /context-planning -->';

function install({ pluginRoot, repoRoot }) {
  const userScope = process.env.CP_INSTALL_SCOPE === 'user';
  const base = userScope
    ? path.join(homeDir(), '.claude')
    : path.join(repoRoot, '.claude');
  const cmdDir = path.join(base, 'commands');

  console.log(`Installing cp commands as Claude Code slash-commands into:`);
  console.log(`  ${cmdDir}`);

  let n = 0;
  for (const { name, src } of listCommandFiles(pluginRoot)) {
    // Claude expects the filename to match the command, so /cp-progress reads
    // .claude/commands/cp-progress.md. Our source files are already named
    // {name}.md (no cp- prefix), so we prefix on install.
    const dest = path.join(cmdDir, `cp-${name}.md`);
    const body = fs.readFileSync(src, 'utf8');
    writeFile(dest, body);
    console.log(`  + /cp-${name}`);
    n++;
  }

  // Merge the cp instruction block into CLAUDE.md (project or user) —
  // idempotent. Strip any prior cp block first, then append a fresh one.
  const claudeMdPath = path.join(base, 'CLAUDE.md');
  const block = `${CP_BLOCK_BEGIN}
# Instructions for context-planning (cp)

- When the user invokes a \`/cp-*\` slash command, load the matching command
  file from \`.claude/commands/cp-*.md\`.
- \`cp\` owns the *state layer* (PROJECT.md / ROADMAP.md / STATE.md / phase dirs
  under \`.planning/\`). It delegates *workflow* to whatever provider is
  configured in \`.planning/config.json\` under the top-level \`cp:\` block
  (default provider: superpowers). The same \`config.json\` is shared with GSD
  when GSD is also installed — they coexist via separate top-level keys.
- For each role (brainstorm, plan, execute, review, finish), invoke the
  matching provider skill (e.g. \`brainstorming\`, \`writing-plans\`,
  \`subagent-driven-development\`), then return to cp to record the state
  change.
- Always update .planning/STATE.md after a phase/quick task completes; tick
  the matching checkbox in .planning/ROADMAP.md; write SUMMARY.md.
- Only invoke cp commands when the user explicitly asks. Don't apply cp
  workflows unbidden.
${CP_BLOCK_END}
`;

  let existing = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';
  // Remove any previously installed block (idempotent re-install).
  const blockRe = new RegExp(
    escapeRegex(CP_BLOCK_BEGIN) + '[\\s\\S]*?' + escapeRegex(CP_BLOCK_END) + '\\n?',
    'g'
  );
  existing = existing.replace(blockRe, '');
  // Trim trailing newlines so we get a clean join.
  existing = existing.replace(/\s+$/, '');
  const merged = existing
    ? existing + '\n\n' + block
    : block;

  writeFile(claudeMdPath, merged);

  console.log(`\nInstalled ${n} slash-command(s).`);
  console.log(`Merged cp block into: ${claudeMdPath}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Make sure your workflow provider (default: superpowers) is installed.`);
  console.log(`     - For Claude Code:  /plugin install superpowers@superpowers-marketplace`);
  console.log(`  2. In a project directory:  cp init`);
  console.log(`  3. Then in Claude Code:     /cp-new-milestone "my first milestone"`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { install };
