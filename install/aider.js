'use strict';

/**
 * Installer for Aider.
 *
 * Aider is the weakest "integration" target of the lot: there is NO
 * extension mechanism for slash commands or rules. What Aider DOES support
 * is read-only context files via `read:` in `.aider.conf.yml` or the
 * `--read` flag. cp leverages that.
 *
 * Layout:
 *   .aider/CP-CONTEXT.md      — read-only briefing on cp's slash commands
 *                               (lists each cp-<name> with a one-line
 *                               description so Aider can invoke `cp <name>`
 *                               via shell when the user asks).
 *   .aider/cp-commands/<name>.md — full body of each cp slash command, in
 *                                  case the user wants to attach one
 *                                  individually via `/read .aider/cp-commands/<name>.md`.
 *   .aider.conf.yml           — appends `read:` entry for CP-CONTEXT.md
 *                               (creates the file if missing; idempotent).
 *
 * v0.4.2.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { listCommandFiles, writeFileSafe, homeDir, buildDriftDefenseBlock } = require('./common');

const CP_CONFIG_MARK_START = '# >>> context-planning (cp) — managed by cp installer';
const CP_CONFIG_MARK_END   = '# <<< context-planning (cp)';
const CP_READ_ENTRY        = '.aider/CP-CONTEXT.md';

function buildContextBriefing(commandFiles, pluginRoot) {
  const lines = [
    '# context-planning (cp) — Aider briefing',
    '',
    '> This file is loaded into Aider chat context. It tells you what `cp`',
    '> can do; invoke `cp` via shell (`!cp <subcommand>`) when the user asks.',
    '',
    '## What cp is',
    '',
    '`cp` (context-planning) owns the **state layer** in `.planning/` —',
    '`PROJECT.md`, `ROADMAP.md`, `STATE.md`, `MILESTONES.md`, plus per-phase',
    'directories with `PLAN.md` + `SUMMARY.md`. It does NOT do the actual',
    'workflow work itself; that\'s your job (or a configured workflow provider\'s).',
    '',
    'Whenever the user says "make a new milestone", "plan a phase", "tick',
    'plan 02-03", etc, run the matching `cp` subcommand and then proceed',
    'with the underlying work in chat.',
    '',
    '## Available cp slash-command flows',
    '',
    'Each row below maps a user request to the corresponding `cp` shell',
    'invocation. Full per-command instructions are in',
    '`.aider/cp-commands/<name>.md` — load one with `/read` when you want',
    'the full body.',
    '',
    '| Command            | Shell                              | What cp does (state) |',
    '|--------------------|------------------------------------|-----------------------|',
  ];
  for (const { name } of commandFiles) {
    lines.push(`| \`/cp-${name}\`${' '.repeat(Math.max(0, 14 - name.length))} | \`cp ${name}\`${' '.repeat(Math.max(0, 30 - name.length))} | see \`.aider/cp-commands/${name}.md\` |`);
  }
  lines.push('');
  lines.push('## CLI cheat-sheet (no slash-command needed)');
  lines.push('');
  lines.push('```bash');
  lines.push('cp init                  # scaffold .planning/');
  lines.push('cp status                # "you are here"');
  lines.push('cp statusline            # one-liner for shell prompts');
  lines.push('cp tick <plan-id>        # mark a plan done in ROADMAP + PLAN.md');
  lines.push('cp write-summary <id> --from <json>');
  lines.push('cp scaffold-milestone <name>');
  lines.push('cp scaffold-phase <N> --name <name> [--plans <count>]');
  lines.push('cp capture "<text>"      # append to .planning/INBOX.md');
  lines.push('cp inbox [--tick <N> --note <dest>]');
  lines.push('cp complete-milestone    # close out: aggregate, collapse, reset');
  lines.push('```');
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push('- Only invoke cp when the user explicitly asks. Don\'t apply cp workflows unbidden.');
  lines.push('- After completing a plan, ALWAYS run `cp tick <plan-id>` and `cp write-summary <plan-id>`.');
  lines.push('- `cp` auto-commits its state edits scoped to `.planning/` only — won\'t sweep your dirty source files into a "cp:" commit.');
  lines.push('');
  if (pluginRoot) {
    lines.push(buildDriftDefenseBlock(pluginRoot));
  }
  return lines.join('\n') + '\n';
}

/**
 * Patch (or create) `.aider.conf.yml` so its top-level `read:` list contains
 * `.aider/CP-CONTEXT.md`. Parses with the `yaml` module to preserve any
 * existing user keys and `read:` entries (v0.4.4 — was regex-based fenced
 * block in v0.4.2 and silently overrode user `read:` values).
 *
 * Migrates legacy fenced blocks written by v0.4.2/v0.4.3: strips the
 * `# >>> context-planning (cp) ...` block, parses what remains as YAML,
 * then re-adds the entry to the proper `read:` list.
 *
 * Returns one of:
 *   { status: 'created',   path } — file did not exist
 *   { status: 'updated',   path } — added our entry to the read: list
 *   { status: 'migrated',  path } — converted a legacy fenced block
 *   { status: 'identical', path } — our entry already present, no change
 */
function patchAiderConfig(repoRoot /* , force unused */) {
  const conf = path.join(repoRoot, '.aider.conf.yml');
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reLegacy = new RegExp(
    `${escapeRe(CP_CONFIG_MARK_START)}[\\s\\S]*?${escapeRe(CP_CONFIG_MARK_END)}\\n?`,
    'g'
  );

  const fileExisted = fs.existsSync(conf);
  const original = fileExisted ? fs.readFileSync(conf, 'utf8') : '';
  let body = original;
  const hadLegacyFence = reLegacy.test(body);
  if (hadLegacyFence) body = body.replace(reLegacy, '');

  let doc;
  try { doc = body.trim() ? YAML.parse(body) : {}; }
  catch (e) { throw new Error(`could not parse .aider.conf.yml: ${e.message}`); }
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) doc = {};

  let reads = doc.read;
  if (typeof reads === 'string') reads = [reads];
  if (!Array.isArray(reads)) reads = [];
  const wasPresent = reads.includes(CP_READ_ENTRY);
  if (!wasPresent) reads.push(CP_READ_ENTRY);
  doc.read = reads;

  const next = YAML.stringify(doc);
  if (fileExisted && next === original) return { status: 'identical', path: conf };
  fs.writeFileSync(conf, next);
  if (!fileExisted) return { status: 'created', path: conf };
  if (hadLegacyFence) return { status: 'migrated', path: conf };
  if (wasPresent) return { status: 'identical', path: conf };
  return { status: 'updated', path: conf };
}

function install({ pluginRoot, repoRoot, force = false }) {
  const target = process.env.CP_INSTALL_SCOPE === 'user'
    ? path.join(homeDir(), '.aider')
    : path.join(repoRoot, '.aider');

  console.log(`Installing cp briefing for Aider into:`);
  console.log(`  ${target}`);

  const commandFiles = listCommandFiles(pluginRoot);

  // 1. Briefing file
  const briefingPath = path.join(target, 'CP-CONTEXT.md');
  const briefing = buildContextBriefing(commandFiles, pluginRoot);
  const userModified = [];
  let written = 0;
  let identical = 0;
  const r0 = writeFileSafe(briefingPath, briefing, { force });
  if (r0.status === 'written') { console.log(`  + CP-CONTEXT.md`); written++; }
  else if (r0.status === 'identical') { console.log(`  = CP-CONTEXT.md (unchanged)`); identical++; }
  else if (r0.status === 'user-modified') { console.log(`  ! CP-CONTEXT.md (LOCALLY MODIFIED — kept)`); userModified.push('CP-CONTEXT.md'); }

  // 2. Per-command files
  for (const { name, src } of commandFiles) {
    const dest = path.join(target, 'cp-commands', `${name}.md`);
    const body = fs.readFileSync(src, 'utf8');
    const r = writeFileSafe(dest, body, { force });
    if (r.status === 'written') { console.log(`  + cp-commands/${name}.md`); written++; }
    else if (r.status === 'identical') { console.log(`  = cp-commands/${name}.md (unchanged)`); identical++; }
    else if (r.status === 'user-modified') { console.log(`  ! cp-commands/${name}.md (LOCALLY MODIFIED — kept)`); userModified.push(`cp-commands/${name}.md`); }
  }

  // 3. Patch .aider.conf.yml
  let confResult;
  try { confResult = patchAiderConfig(repoRoot, force); }
  catch (e) { confResult = { status: 'error', error: e.message }; }
  if (confResult.status === 'error') {
    console.log(`\n⚠ Could not patch .aider.conf.yml: ${confResult.error}`);
    console.log(`  Add this line manually to your aider config:`);
    console.log(`    read:`);
    console.log(`      - .aider/CP-CONTEXT.md`);
  } else {
    const rel = path.relative(repoRoot, confResult.path);
    console.log(`\nAider config: ${rel} (${confResult.status})`);
  }

  console.log(`\nInstalled: ${written} written, ${identical} unchanged${userModified.length ? `, ${userModified.length} kept (locally modified)` : ''}.`);
  if (userModified.length > 0) {
    console.log(`\n⚠ The following files exist on disk with local modifications and were NOT overwritten:`);
    for (const f of userModified) console.log(`    - ${f}`);
    console.log(`  Re-run with \`cp install aider --force\` to overwrite them.`);
  }
  console.log(`\nNext steps:`);
  console.log(`  1. Restart aider so it picks up the new \`read:\` entry.`);
  console.log(`  2. In a project directory:  cp init`);
  console.log(`  3. Ask Aider: "use cp to make a new milestone called 'my first'"`);
  console.log(`     Aider will run \`cp scaffold-milestone\` (or similar) via shell.`);
  console.log(`  Note: Aider has no per-project slash command mechanism. cp's slash`);
  console.log(`        commands are installed as read-only context files; invocations`);
  console.log(`        happen via \`cp <subcommand>\` shell calls from the chat.`);

  return { written, identical, userModified, configResult: confResult };
}

module.exports = { install, buildContextBriefing, patchAiderConfig };
