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

module.exports = { listCommandFiles, copyFile, writeFile, writeFileSafe, homeDir };
