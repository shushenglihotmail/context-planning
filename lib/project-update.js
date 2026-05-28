'use strict';

/**
 * v1.4 declarative PROJECT.md mutations.
 *
 * Used by milestone.yaml's `apply-project-updates` phase. The brainstorm
 * + planner produce a project-update.json file; this lib applies it.
 *
 * JSON shape:
 *   {
 *     "version": 1,
 *     "milestone": "v1.4",       // optional — recorded as audit trail
 *     "ops": [
 *       { "op": "mark-validated",  "match": "regex or substring", "version": "v1.4" },
 *       { "op": "add-active",      "text": "...",                  "version": "v1.5" },
 *       { "op": "add-validated",   "text": "...",                  "version": "v1.4" },
 *       { "op": "remove-active",   "match": "..." }
 *     ]
 *   }
 *
 * Idempotency: ops that have no effect (match found in target section
 * already) are no-ops; the applied count reports actual changes.
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_OPS = ['mark-validated', 'add-active', 'add-validated', 'remove-active'];

function validateUpdate(obj) {
  const errors = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['update must be a plain object'] };
  }
  if (obj.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(obj.ops)) errors.push('ops must be an array');
  if (Array.isArray(obj.ops)) {
    obj.ops.forEach((op, i) => {
      if (!op || typeof op !== 'object') {
        errors.push(`ops[${i}]: must be an object`); return;
      }
      if (ALLOWED_OPS.indexOf(op.op) === -1) {
        errors.push(`ops[${i}]: op '${op.op}' not in ${ALLOWED_OPS.join('|')}`);
      }
      if (op.op === 'mark-validated' || op.op === 'remove-active') {
        if (typeof op.match !== 'string' || op.match.length === 0) {
          errors.push(`ops[${i}]: match must be a non-empty string`);
        }
      }
      if (op.op === 'add-active' || op.op === 'add-validated') {
        if (typeof op.text !== 'string' || op.text.length === 0) {
          errors.push(`ops[${i}]: text must be a non-empty string`);
        }
      }
    });
  }
  return { ok: errors.length === 0, errors: errors };
}

// Section headings recognised under "## Requirements"
const SECTIONS = ['### Validated', '### Active', '### Known minor issues', '### Out of Scope'];

function _splitSections(text) {
  // Return { preamble, sections: { name: {start, end, lines}}, trailer }
  const lines = text.split(/\r?\n/);
  const sections = {};
  let currentName = null;
  let currentStart = -1;
  let order = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (SECTIONS.indexOf(l) !== -1) {
      if (currentName !== null) {
        sections[currentName] = { start: currentStart, end: i - 1 };
      }
      currentName = l;
      currentStart = i;
      order.push(l);
    }
  }
  if (currentName !== null) {
    sections[currentName] = { start: currentStart, end: lines.length - 1 };
  }
  return { lines, sections, order };
}

function _sectionLines(parsed, name) {
  const s = parsed.sections[name];
  if (!s) return [];
  // Skip the heading itself, return body lines.
  return parsed.lines.slice(s.start + 1, s.end + 1);
}

function _findBulletIndex(parsed, name, match) {
  const s = parsed.sections[name];
  if (!s) return -1;
  for (let i = s.start + 1; i <= s.end; i++) {
    const l = parsed.lines[i];
    if (!l.trim().startsWith('-')) continue;
    if (l.indexOf(match) !== -1) return i;
  }
  return -1;
}

/**
 * Apply a validated update object to PROJECT.md.
 *
 * @param {string} projectDir
 * @param {object} update
 * @returns {{ applied: object[], skipped: object[] }}
 */
function applyUpdates(projectDir, update) {
  const v = validateUpdate(update);
  if (!v.ok) throw new Error('project update invalid: ' + v.errors.join('; '));

  const file = path.join(projectDir, '.planning', 'PROJECT.md');
  if (!fs.existsSync(file)) {
    throw new Error('project update: .planning/PROJECT.md not found');
  }
  let text = fs.readFileSync(file, 'utf8');

  const applied = [];
  const skipped = [];

  for (const op of update.ops) {
    const parsed = _splitSections(text);

    if (op.op === 'mark-validated') {
      const idx = _findBulletIndex(parsed, '### Active', op.match);
      if (idx === -1) { skipped.push({op: op, reason: 'no match in Active'}); continue; }
      const moved = parsed.lines[idx];
      // Remove from Active
      parsed.lines.splice(idx, 1);
      // Insert at end of Validated as "- ✓ ..."
      const re = _splitSections(parsed.lines.join('\n'));
      const vsec = re.sections['### Validated'];
      if (!vsec) { skipped.push({op: op, reason: 'no Validated section'}); continue; }
      const cleaned = moved.replace(/^\s*-\s*\*\*/, '- ✓ **').replace(/^\s*-\s*(?!✓)/, '- ✓ ');
      const versioned = op.version ? cleaned.replace(/\s*—\s*v[\w.-]+\s*$/, '') + ` — ${op.version}` : cleaned;
      // Append after last non-empty line of validated
      let insertAt = vsec.end;
      while (insertAt > vsec.start && parsed.lines[insertAt].trim() === '') insertAt--;
      parsed.lines.splice(insertAt + 1, 0, versioned);
      text = parsed.lines.join('\n');
      applied.push({op: op, action: 'moved to Validated'});

    } else if (op.op === 'add-active') {
      const asec = parsed.sections['### Active'];
      if (!asec) { skipped.push({op: op, reason: 'no Active section'}); continue; }
      // Idempotency: skip if a bullet already contains op.text
      if (_findBulletIndex(parsed, '### Active', op.text) !== -1) {
        skipped.push({op: op, reason: 'already present'}); continue;
      }
      const bullet = `- **${op.text}**${op.version ? ` — ${op.version}` : ''}`;
      let insertAt = asec.end;
      while (insertAt > asec.start && parsed.lines[insertAt].trim() === '') insertAt--;
      parsed.lines.splice(insertAt + 1, 0, bullet);
      text = parsed.lines.join('\n');
      applied.push({op: op, action: 'added to Active'});

    } else if (op.op === 'add-validated') {
      const vsec = parsed.sections['### Validated'];
      if (!vsec) { skipped.push({op: op, reason: 'no Validated section'}); continue; }
      if (_findBulletIndex(parsed, '### Validated', op.text) !== -1) {
        skipped.push({op: op, reason: 'already present'}); continue;
      }
      const bullet = `- ✓ ${op.text}${op.version ? ` — ${op.version}` : ''}`;
      let insertAt = vsec.end;
      while (insertAt > vsec.start && parsed.lines[insertAt].trim() === '') insertAt--;
      parsed.lines.splice(insertAt + 1, 0, bullet);
      text = parsed.lines.join('\n');
      applied.push({op: op, action: 'added to Validated'});

    } else if (op.op === 'remove-active') {
      const idx = _findBulletIndex(parsed, '### Active', op.match);
      if (idx === -1) { skipped.push({op: op, reason: 'no match in Active'}); continue; }
      parsed.lines.splice(idx, 1);
      text = parsed.lines.join('\n');
      applied.push({op: op, action: 'removed from Active'});
    }
  }

  fs.writeFileSync(file, text);
  return { applied: applied, skipped: skipped };
}

module.exports = {
  ALLOWED_OPS,
  validateUpdate,
  applyUpdates,
};
