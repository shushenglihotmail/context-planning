'use strict';

const fs = require('node:fs');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSection(phaseId, summary, opts) {
  const options = opts || {};
  const title = typeof options.title === 'string' && options.title.length > 0
    ? `: ${options.title}`
    : '';
  const lines = [`## ${phaseId}${title}`, ''];

  if (typeof options.timestamp === 'string' && options.timestamp.length > 0) {
    lines.push(`_persisted: ${options.timestamp}_`, '');
  }

  lines.push(String(summary == null ? '' : summary).trimEnd());
  return `${lines.join('\n')}\n`;
}

function findSection(content, phaseId) {
  const escaped = escapeRegExp(phaseId);
  const startPattern = new RegExp(`^## ${escaped}(?=$|[ :])`, 'm');
  const match = startPattern.exec(content);
  if (!match) return null;

  const start = match.index;
  const nextLine = content.indexOf('\n', start);
  const searchFrom = nextLine === -1 ? content.length : nextLine + 1;
  const nextPattern = /^## /gm;
  nextPattern.lastIndex = searchFrom;
  const next = nextPattern.exec(content);

  return { start, end: next ? next.index : content.length };
}

function foldIntoDesign(designPath, phaseId, summary, opts) {
  if (!fs.existsSync(designPath)) {
    throw new Error(`foldIntoDesign: DESIGN.md not found at ${designPath} — run scaffoldTierFiles first`);
  }

  const original = fs.readFileSync(designPath, 'utf8').replace(/\r\n?/g, '\n');
  const section = buildSection(phaseId, summary, opts);
  const existing = findSection(original, phaseId);
  let next;

  if (existing) {
    const before = original.slice(0, existing.start).trimEnd();
    const after = original.slice(existing.end).trimStart();
    next = before ? `${before}\n\n${section}${after}` : `${section}${after}`;
  } else {
    const prefix = original.trimEnd();
    next = prefix ? `${prefix}\n\n${section}` : section;
  }

  next = `${next.trimEnd()}\n`;
  const tmpPath = `${designPath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, next, 'utf8');
    fs.renameSync(tmpPath, designPath);
  } catch (err) {
    try { fs.rmSync(tmpPath, { force: true }); } catch (_) { /* best effort cleanup */ }
    throw err;
  }
}

function hasSetField(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined;
}

function mergePersistAlias(phase) {
  const source = phase || {};
  const { persist_output: persistOutput, ...normalized } = source;

  if (!hasSetField(normalized, 'persist') && hasSetField(source, 'persist_output')) {
    normalized.persist = persistOutput;
  }

  return normalized;
}

module.exports = { foldIntoDesign, mergePersistAlias };
