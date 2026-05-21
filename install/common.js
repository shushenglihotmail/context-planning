'use strict';

/**
 * Shared helpers for harness installers.
 */

const fs = require('fs');
const path = require('path');

function listCommandFiles(pluginRoot) {
  const dir = path.join(pluginRoot, 'commands', 'cp');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f.replace(/\.md$/, ''), src: path.join(dir, f) }));
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Plain write (mkdir + writeFileSync). Use when you DO want to clobber —
 * e.g. an internal cp-only state file we own end-to-end.
 */
function writeFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

/**
 * Collision-aware write for installer outputs. Returns one of:
 *   { status: 'written' }     — file did not exist or matches the incoming bytes
 *                                exactly; either way wrote it (no user edit lost).
 *   { status: 'identical' }   — file already on disk has identical content. Skipped.
 *   { status: 'user-modified' } — file exists with DIFFERENT content and `force`
 *                                is false. NOT written; existing file untouched.
 *
 * The "identical" check is what makes safe re-installs cheap: idempotent
 * re-runs after `cp update` or version bumps will report `identical` for
 * unchanged files and `written` only for the ones the new release actually
 * changed.
 *
 * v0.3.4 — closes CONCERNS Medium "Installers overwrite existing cp-scoped
 * command/skill files without a collision prompt or merge path."
 */
function writeFileSafe(dest, content, { force = false } = {}) {
  if (fs.existsSync(dest)) {
    let current;
    try { current = fs.readFileSync(dest, 'utf8'); }
    catch { current = null; }
    if (current === content) return { status: 'identical' };
    if (!force) return { status: 'user-modified' };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  return { status: 'written' };
}

function homeDir() {
  return require('os').homedir();
}

const DRIFT_BLOCK_BEGIN = '<!-- cp:drift-defense v1 -->';
const DRIFT_BLOCK_END = '<!-- /cp:drift-defense -->';

/**
 * Build the drift-defense literacy block injected into every harness's
 * ambient instruction file. Reads `templates/agent-instructions.md` from
 * the plugin root and wraps it in idempotent sentinels.
 *
 * Returns a trailing-newline-terminated string ready to append to a
 * harness's instruction body. Callers that re-install should strip any
 * previous DRIFT_BLOCK_BEGIN..DRIFT_BLOCK_END region first using
 * `stripDriftBlock(text)` to keep the file idempotent.
 */
function buildDriftDefenseBlock(pluginRoot) {
  const src = path.join(pluginRoot, 'templates', 'agent-instructions.md');
  if (!fs.existsSync(src)) {
    throw new Error(`buildDriftDefenseBlock: missing ${src}`);
  }
  const body = fs.readFileSync(src, 'utf8').replace(/\s+$/, '');
  return `${DRIFT_BLOCK_BEGIN}\n${body}\n${DRIFT_BLOCK_END}\n`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove any previously-installed drift-defense block from `text`. Returns
 * the text with the block (and any trailing blank line) removed. Safe to
 * call when no block exists.
 */
function stripDriftBlock(text) {
  if (!text) return text;
  const re = new RegExp(
    escapeRegex(DRIFT_BLOCK_BEGIN) + '[\\s\\S]*?' + escapeRegex(DRIFT_BLOCK_END) + '\\n?',
    'g'
  );
  return text.replace(re, '');
}

module.exports = {
  listCommandFiles,
  copyFile,
  writeFile,
  writeFileSafe,
  homeDir,
  buildDriftDefenseBlock,
  stripDriftBlock,
  DRIFT_BLOCK_BEGIN,
  DRIFT_BLOCK_END,
};
