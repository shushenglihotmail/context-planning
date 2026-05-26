'use strict';

const { resolveItemOrder } = require('./runtime-fanout');

/**
 * Build the per-item expanded child id map for one parent's children.
 *
 * @param {Array<{id: string}>} childTemplates Child phase templates sharing a parent.
 * @param {number} itemIndex 0-based index in the parent's structured-list output.
 * @param {string|undefined} itemId Optional structured-list item id.
 * @returns {Map<string, string>} Map of child template id to expanded child id.
 */
function pairwiseChildDeps(childTemplates, itemIndex, itemId) {
  const itemKey = itemId || String(itemIndex);
  const deps = new Map();

  for (const child of childTemplates) {
    deps.set(child.id, `${child.id}::${itemKey}`);
  }

  return deps;
}

/**
 * Expand parent/child workflow phases over runtime structured-list output.
 *
 * Given unified phases from `phasesFromTemplate(...)` and a parent-id keyed map
 * of structured-list outputs, this returns the materialised execution order.
 * If a parent has not run yet (`parentOutputs[parentId] === undefined`), the
 * parent is emitted but its children are not expanded in this pass.
 *
 * Cross-item ordering follows the v1.2 all-or-nothing rule
 * (see `runtime-fanout.resolveItemOrder`):
 *   - array mode: item N's child subtree waits for item N-1's child subtree.
 *   - dag mode: item B's child subtree waits for every expanded child of every
 *     item it depends_on.
 *
 * Same-item template-level `child.after: [siblingId]` rewriting is preserved
 * in both modes.
 *
 * Note: if a top-level phase has `after: ['P']` where `P` is a parent phase,
 * the runtime executor must treat that as a subtree wait: the phase waits for
 * all of P's expanded children to finish, not just for parent P itself. This
 * function intentionally preserves the top-level `after: ['P']` reference
 * verbatim; executor scheduling owns subtree-wait enforcement.
 *
 * @param {Array<object>} phases Unified Phase[] from one workflow template.
 * @param {Record<string, Array<object>>} parentOutputs Parent structured-list output map.
 * @returns {Array<object>} Fully materialised top-level and expanded child order.
 */
function expandPhases(phases, parentOutputs) {
  const sourcePhases = Array.isArray(phases) ? phases : [];
  const outputs = parentOutputs && typeof parentOutputs === 'object' ? parentOutputs : {};
  const topLevel = [];
  const childrenByParent = new Map();

  for (const phase of sourcePhases) {
    if (phase && Object.prototype.hasOwnProperty.call(phase, 'parent')) {
      if (!childrenByParent.has(phase.parent)) childrenByParent.set(phase.parent, []);
      childrenByParent.get(phase.parent).push(phase);
    } else {
      topLevel.push(phase);
    }
  }

  const expanded = [];

  for (const phase of topLevel) {
    const parentId = phase.id;
    const childTemplates = childrenByParent.get(parentId) || [];
    expanded.push(topLevelOutput(phase));

    if (childTemplates.length === 0) continue;
    if (!Object.prototype.hasOwnProperty.call(outputs, parentId) || outputs[parentId] === undefined) continue;

    const items = outputs[parentId];
    if (!Array.isArray(items)) {
      throw new Error(`fanout: parent '${parentId}' output must be an array`);
    }
    if (items.length === 0 && phase.min_children !== 0) {
      throw new Error(`fanout: parent '${parentId}' output is empty but min_children is ${resolvedMinChildren(phase)}`);
    }

    const mode = resolveItemOrder(items);
    const expandedChildIdsByItem = new Map();
    const itemRows = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const itemId = item && typeof item.id === 'string' ? item.id : undefined;
      const itemKey = itemId || String(itemIndex);
      const siblingIds = pairwiseChildDeps(childTemplates, itemIndex, itemId);

      const childRows = childTemplates.map((child) => expandedChildOutput(child, parentId, item, itemIndex, siblingIds));
      expandedChildIdsByItem.set(itemKey, childRows.map((row) => row.id));
      itemRows.push({ itemKey, itemId, rows: childRows });
    }

    applyCrossItemDeps(items, itemRows, expandedChildIdsByItem, mode);

    for (const { rows } of itemRows) {
      for (const row of rows) expanded.push(row);
    }
  }

  return expanded;
}

function applyCrossItemDeps(items, itemRows, expandedChildIdsByItem, mode) {
  if (itemRows.length === 0) return;

  if (mode.mode === 'array') {
    for (let i = 1; i < itemRows.length; i++) {
      const prev = itemRows[i - 1];
      const prevChildIds = expandedChildIdsByItem.get(prev.itemKey) || [];
      for (const row of itemRows[i].rows) {
        appendUnique(row.after, prevChildIds);
      }
    }
    return;
  }

  const itemKeyById = new Map();
  for (const item of items) {
    if (item && typeof item.id === 'string') itemKeyById.set(item.id, item.id);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const deps = Array.isArray(item.depends_on) ? item.depends_on : [];
    if (deps.length === 0) continue;

    const consumerRows = itemRows[i].rows;
    for (const depId of deps) {
      const depKey = itemKeyById.get(depId);
      const depChildIds = (depKey !== undefined && expandedChildIdsByItem.get(depKey)) || [];
      for (const row of consumerRows) {
        appendUnique(row.after, depChildIds);
      }
    }
  }
}

function appendUnique(target, additions) {
  for (const value of additions) {
    if (!target.includes(value)) target.push(value);
  }
}

function topLevelOutput(phase) {
  return {
    id: phase.id,
    templateId: phase.id,
    after: depsForTopLevel(phase),
    persist: phase.persist === true,
    source: 'top-level',
  };
}

function expandedChildOutput(child, parentId, item, itemIndex, siblingIds) {
  return {
    id: siblingIds.get(child.id),
    templateId: child.id,
    parent: parentId,
    item,
    itemIndex,
    after: remapChildAfter(child, parentId, siblingIds),
    persist: child.persist === true,
    source: 'expanded',
  };
}

function depsForTopLevel(phase) {
  if (Array.isArray(phase.after)) return phase.after.slice();
  if (Array.isArray(phase.depends_on)) return phase.depends_on.slice();
  return [];
}

function remapChildAfter(child, parentId, siblingIds) {
  const after = Array.isArray(child.after) ? child.after : [];
  const remapped = [];

  for (const dep of after) {
    if (dep === child.id) {
      throw new Error(`fanout: child '${child.id}' depends on itself`);
    }
    if (!siblingIds.has(dep)) {
      throw new Error(`fanout: child '${child.id}' after-dep '${dep}' is not a sibling under parent '${parentId}'`);
    }
    remapped.push(siblingIds.get(dep));
  }

  return remapped;
}

function resolvedMinChildren(phase) {
  return Object.prototype.hasOwnProperty.call(phase, 'min_children') ? phase.min_children : 1;
}

module.exports = {
  expandPhases,
  pairwiseChildDeps,
};
