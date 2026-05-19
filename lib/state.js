'use strict';

/**
 * STATE.md helpers. STATE.md is intentionally tiny (<100 lines). We only need:
 *   - read / write
 *   - update "Current Position" block
 *   - update "Session Continuity" block
 *   - update progress bar
 *   - append to "Recent Decisions"
 */

const fs = require('fs');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function write(p, content) {
  fs.writeFileSync(p, content);
}

function progressBar(percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round(pct / 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + pct + '%';
}

/**
 * Replace a labeled line inside a section. Lines have the shape:
 *   `Label: value`
 */
function replaceLineInSection(content, sectionHeading, label, newValue) {
  const sectionRe = new RegExp(
    `(^${escapeRegex(sectionHeading)}\\s*\\n[\\s\\S]*?)(^${escapeRegex(
      label
    )}:[^\\n]*$)`,
    'm'
  );
  const replaced = content.replace(
    sectionRe,
    (_m, pre) => `${pre}${label}: ${newValue}`
  );
  return replaced;
}

function updatePosition(content, { phase, plan, status, lastActivity, date }) {
  let next = content;
  if (phase !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Phase', phase);
  if (plan !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Plan', plan);
  if (status !== undefined)
    next = replaceLineInSection(next, '## Current Position', 'Status', status);
  if (lastActivity !== undefined)
    next = replaceLineInSection(
      next,
      '## Current Position',
      'Last activity',
      `${date || new Date().toISOString().slice(0, 10)} — ${lastActivity}`
    );
  return next;
}

function updateProgressBar(content, percent) {
  const bar = progressBar(percent);
  return content.replace(/^Progress:\s+.*$/m, `Progress: ${bar}`);
}

function updateSessionContinuity(content, { date, stoppedAt, resumeFile }) {
  let next = content;
  if (date !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Last session', date);
  if (stoppedAt !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Stopped at', stoppedAt);
  if (resumeFile !== undefined)
    next = replaceLineInSection(next, '## Session Continuity', 'Resume file', resumeFile);
  return next;
}

function appendRecentDecision(content, decision) {
  // Insert as the FIRST bullet under "### Recent Decisions"
  const re = /(### Recent Decisions\s*\n+(?:<!--[^>]*?-->\s*\n*)?)/;
  if (!re.test(content)) return content;
  return content.replace(re, (m) => `${m}- ${decision}\n`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  read,
  write,
  progressBar,
  updatePosition,
  updateProgressBar,
  updateSessionContinuity,
  appendRecentDecision,
};
