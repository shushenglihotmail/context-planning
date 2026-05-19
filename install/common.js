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

function writeFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

function homeDir() {
  return require('os').homedir();
}

module.exports = { listCommandFiles, copyFile, writeFile, homeDir };
