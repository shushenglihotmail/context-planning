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
    { "id": "<slug>", "title": "...", "summary": "...", "depends_on": [] }
  ]
}
\`\`\`

Rules:
- 1 <= items.length, and items.length must be between ${min} and ${max}.
- Each item must have a unique \`id\` (slug-safe: [a-z0-9-]+).
- \`title\` is required; \`summary\` is optional.
- Additional fields are allowed and will be forwarded to the child phase as \`item\`.

### Item ordering (important — read carefully)

**Default execution order is the order you list items in the \`items\` array
(item[0] runs first, then item[1], etc.).** Each item's child phases form a
subtree, and by default item N's subtree runs only after item N-1's subtree
has fully completed.

If you can identify the real dependency relationships between items, declare
them with the optional \`depends_on\` field (an array of other items' ids):

\`\`\`json
{ "id": "api-routes", "title": "...", "depends_on": ["auth-core"] }
\`\`\`

Resolution rule (**all-or-nothing**):

1. If **every** item declares \`depends_on\` (use \`[]\` for items with no
   deps), the runtime treats the items as a DAG and runs subtrees in
   optimised parallel order based on those declared deps.
2. If **no** item declares \`depends_on\`, the runtime runs subtrees
   sequentially in the order you listed them.
3. If **some** items declare \`depends_on\` and others omit it, the runtime
   falls back to sequential array order and ignores all \`depends_on\`
   declarations (because partial declarations are ambiguous).

To unlock parallel execution, populate \`depends_on\` on **every** item
(even if the value is \`[]\`). Cycles, self-references, and references to
unknown item ids will be rejected as errors.
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

    if (Object.prototype.hasOwnProperty.call(item, 'depends_on')) {
      const deps = item.depends_on;
      if (!Array.isArray(deps)) {
        throw new Error(`runtime-fanout: item at index ${i} ('${id}') depends_on must be an array`);
      }
      for (let j = 0; j < deps.length; j++) {
        if (typeof deps[j] !== 'string') {
          throw new Error(`runtime-fanout: item at index ${i} ('${id}') depends_on[${j}] must be a string`);
        }
      }
    }
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

/**
 * Resolve the cross-item execution order from parent's structured-list output.
 *
 * Applies the all-or-nothing rule:
 *   - every item has `depends_on` (incl. []) → DAG mode (topo-sort + validate)
 *   - none have `depends_on`                → array mode (input order)
 *   - some have, some don't                 → array mode (silent fallback)
 *
 * In array mode, callers should chain subtrees in input order. In DAG mode,
 * callers honour the per-item `depends_on` directly; the topo `order` returned
 * here is informational (stable for deterministic emission).
 *
 * @param {Array<object>} items Parsed structured-list items.
 * @returns {{mode: 'array'} | {mode: 'dag', order: string[]}}
 */
function resolveItemOrder(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { mode: 'array' };

  let withDeps = 0;
  for (const item of list) {
    if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'depends_on')) {
      withDeps++;
    }
  }

  if (withDeps !== list.length) return { mode: 'array' };

  const ids = new Set();
  for (const item of list) ids.add(item.id);

  for (const item of list) {
    const deps = item.depends_on;
    for (const dep of deps) {
      if (dep === item.id) {
        throw new Error(`runtime-fanout: item '${item.id}' depends on itself`);
      }
      if (!ids.has(dep)) {
        throw new Error(`runtime-fanout: item '${item.id}' depends_on references unknown id '${dep}'`);
      }
    }
  }

  const order = topoOrderItems(list);
  if (order.length !== list.length) {
    const remaining = list.map((item) => item.id).filter((id) => !order.includes(id));
    throw new Error(`runtime-fanout: cycle detected among items: ${remaining.join(', ')}`);
  }

  return { mode: 'dag', order };
}

function topoOrderItems(items) {
  const indegree = new Map();
  const dependents = new Map();
  const inputOrder = items.map((item) => item.id);

  for (const item of items) {
    indegree.set(item.id, 0);
    dependents.set(item.id, []);
  }
  for (const item of items) {
    for (const dep of item.depends_on) {
      indegree.set(item.id, indegree.get(item.id) + 1);
      dependents.get(dep).push(item.id);
    }
  }

  const order = [];
  const ready = inputOrder.filter((id) => indegree.get(id) === 0);

  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        const insertAt = inputOrder.indexOf(next);
        let placed = false;
        for (let i = 0; i < ready.length; i++) {
          if (inputOrder.indexOf(ready[i]) > insertAt) {
            ready.splice(i, 0, next);
            placed = true;
            break;
          }
        }
        if (!placed) ready.push(next);
      }
    }
  }

  return order;
}

module.exports = { buildParentPrompt, parseParentOutput, enforceChildCount, resolveItemOrder };
