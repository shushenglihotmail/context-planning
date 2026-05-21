'use strict';

/**
 * ROADMAP.md helpers — minimal regex-based operations. Avoids a full markdown
 * parser; just enough to:
 *   - List phases ({ num, name, status, plans: [{ id, desc, done }] })
 *   - Toggle a plan checkbox
 *   - Recompute the Progress table row for a phase
 *   - Add a new milestone block
 *   - Add a new phase block
 */

const fs = require('fs');

function read(roadmapPath) {
  return fs.readFileSync(roadmapPath, 'utf8');
}

function write(roadmapPath, content) {
  fs.writeFileSync(roadmapPath, content);
}

/**
 * Find phase sections. Phase headings look like:
 *   ### Phase 1: Foundation
 *   ### Phase 2.1: Hotfix (INSERTED)
 */
function listPhases(content) {
  const phases = [];
  const headingRe = /^###\s+Phase\s+([\d.]+):\s+(.+?)\s*(?:\(INSERTED\))?\s*$/gm;
  let match;
  const matches = [];
  while ((match = headingRe.exec(content)) !== null) {
    matches.push({ num: match[1], name: match[2].trim(), index: match.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const block = content.slice(start, end);
    const plans = [];
    const planRe = /^\s*-\s+\[([ xX])\]\s+([\d.]+-\d+):\s*(.*)$/gm;
    let p;
    while ((p = planRe.exec(block)) !== null) {
      plans.push({
        id: p[2],
        desc: p[3].trim(),
        done: p[1].toLowerCase() === 'x',
      });
    }
    phases.push({
      num: matches[i].num,
      name: matches[i].name,
      plans,
      blockStart: start,
      blockEnd: end,
    });
  }
  return phases;
}

/**
 * Toggle a plan checkbox by ID (e.g., "01-02"). Returns updated content.
 */
function setPlanDone(content, planId, done = true) {
  const re = new RegExp(
    `(^\\s*-\\s+\\[)([ xX~])(\\]\\s+${escapeRegex(planId)}:)`,
    'm'
  );
  return content.replace(re, (_m, a, _b, c) => `${a}${done ? 'x' : ' '}${c}`);
}

/**
 * v0.8 P10: Mark a plan as superseded — replaces the checkbox with `[~]`.
 * Does not touch the trailing description. Idempotent.
 */
function setPlanSuperseded(content, planId) {
  const re = new RegExp(
    `(^\\s*-\\s+\\[)([ xX~])(\\]\\s+${escapeRegex(planId)}:)`,
    'm'
  );
  return content.replace(re, (_m, a, _b, c) => `${a}~${c}`);
}

/**
 * Append a new phase block. Caller supplies the full markdown for the section
 * (starting with `### Phase N: ...`).
 */
function appendPhaseBlock(content, phaseBlock) {
  // Insert before the "## Progress" section if present, else at end.
  const progressIdx = content.indexOf('\n## Progress');
  if (progressIdx === -1) {
    return content.trimEnd() + '\n\n' + phaseBlock.trim() + '\n';
  }
  const before = content.slice(0, progressIdx).trimEnd();
  const after = content.slice(progressIdx);
  return before + '\n\n' + phaseBlock.trim() + '\n' + after;
}

/**
 * Recompute the Progress table. Replaces every existing row with fresh ones
 * derived from `listPhases`. Idempotent.
 */
function rebuildProgressTable(content, milestoneByPhase = {}) {
  const phases = listPhases(content);
  const header =
    '| Phase | Milestone | Plans Complete | Status | Completed |\n' +
    '|-------|-----------|----------------|--------|-----------|\n';
  const rows = phases
    .map((p) => {
      const total = p.plans.length;
      const done = p.plans.filter((x) => x.done).length;
      const status =
        total === 0
          ? 'Planned'
          : done === 0
          ? 'Not started'
          : done < total
          ? 'In progress'
          : 'Complete';
      const completed = status === 'Complete' ? new Date().toISOString().slice(0, 10) : '-';
      const ms = milestoneByPhase[p.num] || '-';
      return `| ${p.num}. ${p.name} | ${ms} | ${done}/${total} | ${status} | ${completed} |`;
    })
    .join('\n');

  const table = header + rows + '\n';

  const sectionRe = /(## Progress[\s\S]*?)(\n(?=## )|$)/;
  if (sectionRe.test(content)) {
    return content.replace(sectionRe, `## Progress\n\n${table}$2`);
  }
  return content.trimEnd() + '\n\n## Progress\n\n' + table;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  read,
  write,
  listPhases,
  setPlanDone,
  setPlanSuperseded,
  appendPhaseBlock,
  rebuildProgressTable,
};
