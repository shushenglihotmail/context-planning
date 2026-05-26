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
  "optimizable": false,
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

**The safe default is sequential execution in the order you list items.** Each
item's child phases form a subtree, and item N's subtree runs only after
item N-1's subtree has fully completed. If you are unsure about how items
depend on each other, leave \`optimizable\` set to \`false\` (or omit it) and
the runtime will run items strictly in array order.

**Only set \`"optimizable": true\` at the top level if you have analyzed the
dependency relationships across ALL items and are confident.** When
\`optimizable: true\`:

- Declare \`depends_on: [<other-item-ids>]\` on each item that has real
  dependencies. Items with no dependencies can omit \`depends_on\` or use
  \`[]\` — both mean "no deps; free to run in parallel with other unblocked
  items".
- The runtime treats the items as a DAG and runs subtrees in optimised
  parallel order.
- Cycles, self-references, and \`depends_on\` referencing unknown item ids
  will be rejected as hard errors (because you pledged the analysis is
  complete).

When \`optimizable\` is \`false\` or omitted, any \`depends_on\` fields on items
are ignored and the runtime runs items in array order. Do not guess —
sequential is always safe.
`;
}

/**
 * Parse and validate a parent phase structured-list response.
 *
 * Returns the full parent output contract:
 *   { optimizable: boolean, items: Array<object> }
 *
 * `optimizable` is the agent's top-level pledge that it has analyzed
 * dependency relationships across all items. When `false` (the default),
 * any per-item `depends_on` field is ignored by the runtime and items run
 * sequentially in array order. When `true`, items are treated as a DAG and
 * the runtime validates `depends_on` strictly.
 *
 * @param {string} agentResponseText Full agent response text.
 * @returns {{optimizable: boolean, items: Array<object>}} Parsed parent output.
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

  let optimizable = false;
  if (Object.prototype.hasOwnProperty.call(parsed, 'optimizable')) {
    if (typeof parsed.optimizable !== 'boolean') {
      throw new Error(`runtime-fanout: 'optimizable' must be a boolean (got ${typeof parsed.optimizable})`);
    }
    optimizable = parsed.optimizable;
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

  return { optimizable, items: parsed.items };
}

/**
 * Enforce parent-phase min/max fan-out child count.
 *
 * Accepts either the legacy bare `items` array or the new
 * `{ optimizable, items }` parent-output object.
 *
 * @param {object} parentPhase Unified parent Phase object.
 * @param {Array<object>|{items: Array<object>}} parentOutputOrItems Parsed items or full output.
 * @returns {Array<object>|object} The unchanged input (same type) for chaining.
 */
function enforceChildCount(parentPhase, parentOutputOrItems) {
  const { min, max } = childBounds(parentPhase);
  const phaseId = parentPhase && parentPhase.id;
  const items = Array.isArray(parentOutputOrItems)
    ? parentOutputOrItems
    : (parentOutputOrItems && Array.isArray(parentOutputOrItems.items) ? parentOutputOrItems.items : []);

  if (items.length < min) {
    throw new Error(`runtime-fanout: phase '${phaseId}' produced ${items.length} items, below min_children (${min})`);
  }
  if (items.length > max) {
    throw new Error(`runtime-fanout: phase '${phaseId}' produced ${items.length} items, above max_children (${max})`);
  }

  return parentOutputOrItems;
}

/**
 * Resolve the cross-item execution order from a parent's structured-list output.
 *
 * Accepts either the legacy bare `items` array (treated as
 * `{ optimizable: false, items }`) or the full
 * `{ optimizable, items }` parent-output object.
 *
 * Resolution rule (`optimizable` flag):
 *   - `optimizable === false` or missing → array mode. Items run in
 *     declaration order; any per-item `depends_on` is ignored entirely.
 *   - `optimizable === true` → DAG mode. Items without a `depends_on` field
 *     are treated as having `depends_on: []` (no deps, parallel root).
 *     Cycles, self-references, and unknown ids throw.
 *
 * In array mode, callers should chain subtrees in input order. In DAG mode,
 * callers honour the per-item `depends_on` directly; the topo `order`
 * returned here is informational (stable for deterministic emission).
 *
 * @param {Array<object>|{optimizable?: boolean, items: Array<object>}} input Parent output or items.
 * @returns {{mode: 'array'} | {mode: 'dag', order: string[]}}
 */
function resolveItemOrder(input) {
  let optimizable = false;
  let list;
  if (Array.isArray(input)) {
    list = input;
  } else if (input && typeof input === 'object' && Array.isArray(input.items)) {
    list = input.items;
    if (typeof input.optimizable === 'boolean') optimizable = input.optimizable;
  } else {
    list = [];
  }

  if (list.length === 0) return { mode: 'array' };
  if (!optimizable) return { mode: 'array' };

  const ids = new Set();
  for (const item of list) ids.add(item.id);

  for (const item of list) {
    const deps = Array.isArray(item.depends_on) ? item.depends_on : [];
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
    const deps = Array.isArray(item.depends_on) ? item.depends_on : [];
    for (const dep of deps) {
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
