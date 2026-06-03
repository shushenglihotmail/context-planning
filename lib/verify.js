'use strict';

/**
 * lib/verify.js — non-LLM verify gate library.
 *
 * Resolves which test command to run for `cp run-verify <slug>` and
 * shells out to it, propagating stdio and exit code 1:1.
 *
 * Priority:
 *   1. opts.override                          (CLI --command)
 *   2. .planning/config.json:cp.behavior.test_command
 *   3. auto-detect: npm test → pytest → cargo test → go test ./...
 *   4. none → warn-only, exit 0
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function _readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function _hasPytest(projectDir) {
  if (fs.existsSync(path.join(projectDir, 'pytest.ini'))) return true;
  const pp = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pp)) {
    try {
      const body = fs.readFileSync(pp, 'utf8');
      if (/\[tool\.pytest/i.test(body) || /pytest/i.test(body)) return true;
    } catch (_e) { /* fallthrough */ }
  }
  const sc = path.join(projectDir, 'setup.cfg');
  if (fs.existsSync(sc)) {
    try {
      const body = fs.readFileSync(sc, 'utf8');
      if (/\[tool:pytest\]/i.test(body)) return true;
    } catch (_e) { /* fallthrough */ }
  }
  return false;
}

/**
 * Auto-detect a runnable test command for the given project directory.
 * Returns the command string (suitable for shell execution) or null.
 *
 * Priority chain:
 *   1. npm test    (package.json with scripts.test)
 *   2. pytest      (pytest.ini OR pyproject.toml mentioning pytest OR setup.cfg [tool:pytest])
 *   3. cargo test  (Cargo.toml)
 *   4. go test ./... (go.mod)
 */
function detectTestCommand(projectDir) {
  const root = projectDir || process.cwd();
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = _readJson(pkgPath);
    if (pkg && pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim() !== '') {
      return 'npm test';
    }
  }
  if (_hasPytest(root)) return 'pytest';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test ./...';
  return null;
}

/**
 * Read cp.behavior.test_command from .planning/config.json. Returns null
 * if config is missing, malformed, or field absent.
 */
function loadConfiguredCommand(projectDir) {
  const root = projectDir || process.cwd();
  const cfgPath = path.join(root, '.planning', 'config.json');
  if (!fs.existsSync(cfgPath)) return null;
  const cfg = _readJson(cfgPath);
  if (!cfg) return null;
  const behavior = (cfg.cp && cfg.cp.behavior) || {};
  const v = behavior.test_command;
  if (typeof v === 'string' && v.trim() !== '') return v;
  return null;
}

/**
 * Resolve the effective test command with provenance.
 *
 * @param {string} projectDir
 * @param {object} [opts] { override?: string }
 * @returns {{ command: string|null, source: 'override'|'config'|'auto-detect'|'none' }}
 */
function resolveCommand(projectDir, opts) {
  const o = opts || {};
  if (typeof o.override === 'string' && o.override.trim() !== '') {
    return { command: o.override, source: 'override' };
  }
  const cfg = loadConfiguredCommand(projectDir);
  if (cfg) return { command: cfg, source: 'config' };
  const det = detectTestCommand(projectDir);
  if (det) return { command: det, source: 'auto-detect' };
  return { command: null, source: 'none' };
}

/**
 * Execute the resolved test command and return result.
 *
 * @param {string} slug - run slug (recorded in result; not used for execution)
 * @param {object} [opts] {
 *   projectDir?: string,
 *   override?: string,
 *   skip?: boolean,
 *   captureOutput?: boolean,
 *   silent?: boolean,
 * }
 * @returns {{
 *   ok: boolean,
 *   exitCode: number,
 *   source: string,
 *   command: string|null,
 *   slug: string,
 *   stdout?: string,
 *   stderr?: string,
 *   warning?: string,
 * }}
 */
function runVerify(slug, opts) {
  const o = opts || {};
  const projectDir = o.projectDir || process.cwd();

  if (o.skip) {
    return { ok: true, exitCode: 0, source: 'skip', command: null, slug };
  }

  const { command, source } = resolveCommand(projectDir, { override: o.override });

  if (!command) {
    const warning =
      'cp: run-verify: no test command detected; set behavior.test_command ' +
      'in .planning/config.json or pass --command "<cmd>" to opt in. ' +
      'Verify is a no-op (exit 0) for backward compatibility.';
    if (!o.silent) console.error(warning);
    return {
      ok: true,
      exitCode: 0,
      source: 'none',
      command: null,
      slug,
      warning,
    };
  }

  const stdio = o.captureOutput ? 'pipe' : 'inherit';
  const result = child_process.spawnSync(command, {
    cwd: projectDir,
    shell: true,
    stdio,
    encoding: 'utf8',
  });

  const exitCode = (result.status == null) ? 1 : result.status;
  const out = {
    ok: exitCode === 0,
    exitCode,
    source,
    command,
    slug,
  };
  if (o.captureOutput) {
    out.stdout = result.stdout || '';
    out.stderr = result.stderr || '';
  }
  if (result.error) {
    out.spawnError = result.error.message;
    out.ok = false;
    out.exitCode = out.exitCode || 1;
  }
  return out;
}

module.exports = {
  detectTestCommand,
  loadConfiguredCommand,
  resolveCommand,
  runVerify,
};
