'use strict';

const fs = require('fs');
const path = require('path');
const { pluginRoot } = require('../../lib/paths');

/**
 * Internal helpers shared across command modules.
 * These were inlined in bin/cp.js before v0.6.
 */

function available(name) {
  return fs.existsSync(path.join(pluginRoot(), 'install', `${name}.js`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function renderTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    text
  );
}

/**
 * Pre-process argv to normalize `--key=value` → `--key value`. Lets every
 * subcommand's hand-rolled parser keep using the simpler "next-slot" model
 * without each one having to handle `=` separately.
 *
 * v0.3.4 — closes CONCERNS Low "argv parser doesn't support --key=value".
 *
 * - Leaves bare flags (`--force`, `-v`) alone.
 * - Splits `--name=value` → ['--name', 'value']. The empty `--key=` form
 *   becomes ['--key', ''] which is preserved as a real empty-string value.
 * - Does NOT touch short combined flags like `-abc` (we don't use any).
 */
function normalizeArgv(argv) {
  const out = [];
  for (const tok of argv) {
    if (typeof tok === 'string' && tok.startsWith('--') && tok.includes('=')) {
      const eq = tok.indexOf('=');
      out.push(tok.slice(0, eq));
      out.push(tok.slice(eq + 1));
    } else {
      out.push(tok);
    }
  }
  return out;
}

module.exports = { available, today, renderTemplate, normalizeArgv };
