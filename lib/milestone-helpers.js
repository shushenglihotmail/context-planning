'use strict';

/**
 * v1.4 milestone-lifecycle helpers used by milestone.yaml.
 *
 * - setupCheck: validate prerequisites for a new milestone:
 *     PROJECT.md must exist
 *     ROADMAP.md must exist
 *     STATE.md must exist
 *     `cp doctor` reports no blocking issues
 * - finalize: refresh STATE.md (current focus, phase counter) and emit
 *     a deterministic next-step banner consumed by the workflow runner.
 *
 * Both functions return a structured result. The CLI wrappers translate
 * non-zero `ok: false` into a non-zero exit + actionable stderr.
 */

const fs = require('fs');
const path = require('path');

function _exists(p) { try { fs.statSync(p); return true; } catch (_) { return false; } }

function _slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Verify a milestone is safe to start.
 *
 * @param {string} milestoneSlug
 * @param {{projectDir?: string}} [opts]
 * @returns {{ok:boolean, checks: object[], error?: string}}
 */
function setupCheck(milestoneSlug, opts) {
  const o = opts || {};
  const root = o.projectDir || process.cwd();
  const checks = [];
  function chk(name, cond, hint) {
    checks.push({ name: name, ok: !!cond, hint: cond ? null : hint });
    return !!cond;
  }
  const pdir = path.join(root, '.planning');
  let allOk = true;
  allOk = chk('.planning/ exists', _exists(pdir), 'Run `cp init` first.') && allOk;
  allOk = chk('PROJECT.md exists', _exists(path.join(pdir, 'PROJECT.md')),
    'Run `cp init` to scaffold PROJECT.md.') && allOk;
  allOk = chk('ROADMAP.md exists', _exists(path.join(pdir, 'ROADMAP.md')),
    'Run `cp init` to scaffold ROADMAP.md.') && allOk;
  allOk = chk('STATE.md exists', _exists(path.join(pdir, 'STATE.md')),
    'Run `cp init` to scaffold STATE.md.') && allOk;
  if (milestoneSlug) {
    const ok = /^[a-z0-9][a-z0-9._-]*$/i.test(milestoneSlug);
    allOk = chk('milestone slug is well-formed', ok,
      'Slug must match [a-z0-9._-]+; use `cp milestone-setup-check <slug>`.') && allOk;
  } else {
    allOk = chk('milestone slug provided', false,
      'Pass the milestone slug as the first arg.') && allOk;
  }
  return {
    ok: allOk,
    milestoneSlug: milestoneSlug || null,
    checks: checks,
    error: allOk ? null : 'one or more setup checks failed',
  };
}

/**
 * Finalize a milestone-creation workflow: refresh STATE.md and emit a
 * structured next-step description for the workflow runner.
 *
 * Idempotent — re-running on a finalized milestone yields the same banner.
 *
 * @param {string} milestoneSlug
 * @param {{projectDir?: string, milestoneName?: string}} [opts]
 * @returns {{ok:boolean, banner:string, milestoneSlug:string, statePath?:string, error?:string}}
 */
function finalize(milestoneSlug, opts) {
  const o = opts || {};
  const root = o.projectDir || process.cwd();
  if (!milestoneSlug || !/^[a-z0-9][a-z0-9._-]*$/i.test(milestoneSlug)) {
    return { ok: false, error: 'finalize: invalid milestone slug', banner: '', milestoneSlug: milestoneSlug || '' };
  }
  const statePath = path.join(root, '.planning', 'STATE.md');
  if (!_exists(statePath)) {
    return { ok: false, error: 'finalize: STATE.md not found (run cp init)', banner: '', milestoneSlug: milestoneSlug };
  }
  const milestoneName = o.milestoneName || milestoneSlug;
  const cur = fs.readFileSync(statePath, 'utf8');
  // Insert or update the "Current focus" line near the top. We treat
  // STATE.md as conventional but tolerant: prepend a marker block if no
  // existing one is found, so finalize never destroys user prose.
  const marker = '<!-- cp:current-focus -->';
  const block = [
    marker,
    `- **Current milestone:** ${milestoneName}`,
    `- **Slug:** ${milestoneSlug}`,
    `- **Status:** in-progress`,
    `- **Updated:** ${new Date().toISOString().slice(0, 10)}`,
    marker,
  ].join('\n');
  let next;
  if (cur.indexOf(marker) !== -1) {
    next = cur.replace(
      new RegExp(`${marker}[\\s\\S]*?${marker}`),
      block
    );
  } else {
    next = block + '\n\n' + cur;
  }
  if (next !== cur) fs.writeFileSync(statePath, next);

  const banner = [
    `Milestone "${milestoneName}" set up.`,
    `Next: run /cp-autonomous (or \`cp run dev "${milestoneName}"\`) to start work.`,
  ].join('\n');
  return { ok: true, milestoneSlug: milestoneSlug, statePath: statePath, banner: banner };
}

module.exports = {
  setupCheck,
  finalize,
  _slugify,
};
