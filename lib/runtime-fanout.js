'use strict';

/**
 * Runtime helpers for parent-phase fan-out structured-list contracts.
 */

const SLUG_ID_RE = /^[a-z0-9-]+$/;

function childBounds(parentPhase) {
  return {
    min: parentPhase && parentPhase.min_children != null ? parentPhase.min_children : 1,
    max: parentPhase && parentPhase.max_children != null ? parentPhase.max_children : 20,
  };
}

/**
 * Augment a parent phase prompt with structured-list output instructions.
 *
 * @param {object} parentPhase Unified Phase object with fan-out bounds.
 * @param {string} basePrompt Prompt that would normally be sent.
 * @returns {string}
 */
function buildParentPrompt(parentPhase, basePrompt) {
  const { min, max } = childBounds(parentPhase);

  return `${basePrompt}

---

## Output format (structured list)

This phase fans out into child phases. Produce between ${min} and ${max} items.

Return ONLY a JSON code block at the end of your response, in this shape:

\`\`\`json
{
  "items": [
    { "id": "<slug>", "title": "...", "summary": "..." }
  ]
}
\`\`\`

Rules:
- 1 <= items.length, and items.length must be between ${min} and ${max}.
- Each item must have a unique \`id\` (slug-safe: [a-z0-9-]+).
- \`title\` is required; \`summary\` is optional.
- Additional fields are allowed and will be forwarded to the child phase as \`item\`.
`;
}

/**
 * Parse and validate a parent phase structured-list response.
 *
 * @param {string} agentResponseText Full agent response text.
 * @returns {Array<object>} Parsed items array.
 */
function parseParentOutput(agentResponseText) {
  const text = String(agentResponseText);
  const jsonBlocks = [];
  const fenceRe = /```json\s*([\s\S]*?)```/g;
  let match;

  while ((match = fenceRe.exec(text)) !== null) {
    jsonBlocks.push(match[1]);
  }

  if (jsonBlocks.length === 0) {
    throw new Error('runtime-fanout: no fenced JSON block found in agent response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonBlocks[jsonBlocks.length - 1]);
  } catch (err) {
    throw new Error(`runtime-fanout: failed to parse JSON block: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.items)) {
    throw new Error("runtime-fanout: parsed JSON missing 'items' array");
  }

  const seenIds = new Set();

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const id = item && typeof item === 'object' ? item.id : undefined;

    if (typeof id !== 'string' || !SLUG_ID_RE.test(id)) {
      throw new Error(`runtime-fanout: item at index ${i} has invalid id '${String(id)}'`);
    }
    if (typeof item.title !== 'string') {
      throw new Error(`runtime-fanout: item at index ${i} missing 'title'`);
    }
    if (seenIds.has(id)) {
      throw new Error(`runtime-fanout: duplicate item id '${id}'`);
    }
    seenIds.add(id);
  }

  return parsed.items;
}

/**
 * Enforce parent-phase min/max fan-out child count.
 *
 * @param {object} parentPhase Unified parent Phase object.
 * @param {Array<object>} items Parsed structured-list items.
 * @returns {Array<object>} The unchanged items array.
 */
function enforceChildCount(parentPhase, items) {
  const { min, max } = childBounds(parentPhase);
  const phaseId = parentPhase && parentPhase.id;

  if (items.length < min) {
    throw new Error(`runtime-fanout: phase '${phaseId}' produced ${items.length} items, below min_children (${min})`);
  }
  if (items.length > max) {
    throw new Error(`runtime-fanout: phase '${phaseId}' produced ${items.length} items, above max_children (${max})`);
  }

  return items;
}

module.exports = { buildParentPrompt, parseParentOutput, enforceChildCount };
