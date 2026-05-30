'use strict';

/**
 * Installer for Cursor IDE.
 *
 * Cursor reads project rules from `.cursor/rules/*.mdc` (Markdown with YAML
 * frontmatter). Unlike Claude / Copilot CLI, Cursor has no per-project
 * slash-command extension mechanism — its slash commands are hard-coded.
 * The closest analog is to install each cp command as an INVOKABLE RULE so
 * the user can attach it to their chat with `@cp-<name>` or the rule picker.
 *
 * Layout:
 *   .cursor/rules/context-planning.mdc   — alwaysApply: true, ambient
 *                                          routing instructions (mirrors the
 *                                          `.github/context-planning.md` we
 *                                          install for Copilot CLI).
 *   .cursor/rules/cp-<name>.mdc          — alwaysApply: false, one per
 *                                          `commands/cp/*.md`. User pulls
 *                                          them in via `@cp-<name>` or the
 *                                          rule picker.
 *
 * v0.4.2.
 */

const fs = require('fs');
const path = require('path');
const { listCommandFiles, writeFileSafe, homeDir, buildDriftDefenseBlock } = require('./common');

// Cursor rule body wrapper: add frontmatter on top of the raw command body.
// If the source already has YAML frontmatter (most cp slash commands do),
// strip its `description:` to use as the rule description, and discard the
// rest — Cursor only understands its own keys.
function buildRule({ name, body, alwaysApply }) {
  let description = `cp slash-command: ${name}`;
  let bodyOnly = body;
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fm) {
    const m = fm[1].match(/^description:\s*(.+)$/m);
    if (m) description = m[1].trim().replace(/^["']|["']$/g, '');
    bodyOnly = fm[2];
  }
  const yaml = [
    '---',
    `description: ${JSON.stringify(description)}`,
    `alwaysApply: ${alwaysApply ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');
  return yaml + bodyOnly;
}

function install({ pluginRoot, repoRoot, force = false }) {
  const target = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.cursor', 'rules')
    : path.join(repoRoot, '.cursor', 'rules');

  console.log(`Installing cp commands as Cursor rules into:`);
  console.log(`  ${target}`);

  let written = 0;
  let identical = 0;
  const userModified = [];

  for (const { name, src } of listCommandFiles(pluginRoot)) {
    const ruleName = `cp-${name}`;
    const ruleFile = path.join(target, `${ruleName}.mdc`);
    const rawBody = fs.readFileSync(src, 'utf8');
    const rule = buildRule({ name, body: rawBody, alwaysApply: false });
    const r = writeFileSafe(ruleFile, rule, { force });
    if (r.status === 'written')           { console.log(`  + ${ruleName}.mdc`); written++; }
    else if (r.status === 'identical')    { console.log(`  = ${ruleName}.mdc (unchanged)`); identical++; }
    else if (r.status === 'user-modified') { console.log(`  ! ${ruleName}.mdc (LOCALLY MODIFIED — kept)`); userModified.push(`${ruleName}.mdc`); }
  }

  // Ambient routing rule — alwaysApply so cp routing happens without the
  // user having to remember to @-attach anything.
  const ctxFile = path.join(target, 'context-planning.mdc');
  const ctxBody = `<!-- context-planning (cp) — managed by cp installer -->
# Instructions for context-planning (cp)

When the user invokes a \`/cp-*\` or \`cp-*\` workflow, route to the matching
\`cp-<name>\` Cursor rule (under \`.cursor/rules/\`). Attach it to context if
not already attached, and follow its body verbatim.

\`cp\` owns the **state layer** (\`.planning/PROJECT.md\`, \`ROADMAP.md\`,
\`STATE.md\`, phase dirs). It delegates **workflow** to whatever provider is
configured in \`.planning/config.json\` under the top-level \`cp:\` block
(default provider: superpowers).

For each role (brainstorm, plan, execute, review, finish, etc.) invoke the
provider's primitive (or do the work in-chat if no provider is configured),
then return to cp to record the state change. Always update
\`.planning/STATE.md\` after a phase / quick task is completed; tick the
matching checkbox in \`.planning/ROADMAP.md\`; write the \`SUMMARY.md\`.

Only invoke cp commands when the user explicitly asks. Don't apply cp
workflows unbidden.
<!-- /context-planning -->

${buildDriftDefenseBlock(pluginRoot)}`;
  const ctxRule = buildRule({ name: 'context-planning', body: ctxBody, alwaysApply: true });
  const ctxR = writeFileSafe(ctxFile, ctxRule, { force });
  if (ctxR.status === 'user-modified') userModified.push('context-planning.mdc');

  console.log(`\nInstalled: ${written} written, ${identical} unchanged${userModified.length ? `, ${userModified.length} kept (locally modified)` : ''}.`);
  console.log(`Ambient rule: ${ctxFile} (${ctxR.status})`);
  if (userModified.length > 0) {
    console.log(`\n⚠ The following rule files exist on disk with local modifications and were NOT overwritten:`);
    for (const f of userModified) console.log(`    - ${f}`);
    console.log(`  Re-run with \`cp install cursor --force\` to overwrite them, or delete the local copy first.`);
  }
  console.log(`\nNext steps:`);
  console.log(`  1. Reload Cursor (or run "Cursor: Reload Window") to pick up the new rules.`);
  console.log(`  2. cd into a repo and pick a path:`);
  console.log(`     • Project work:  @cp-new-project              (scaffolds .planning/ + first milestone)`);
  console.log(`     • One-shot task: cp run quick "<task>"        (no project setup needed)`);
  console.log(`     (or any other @cp-<name> rule)`);

  return { written, identical, userModified };
}

module.exports = { install, buildRule };
