import { useMemo } from 'react';

const MAX_DEPTH = 20;

// Whether reparenting `id` under `candidateParentId` would create a cycle -
// mirrors backend/projectTree.js's isDescendant so the parentId picker can
// filter invalid choices before the server ever sees them.
export function isDescendant(flatProjects, candidateParentId, id) {
  if (candidateParentId == null) return false;
  const byId = new Map(flatProjects.map((p) => [p.id, p]));
  let current = byId.get(candidateParentId);
  let depth = 0;
  while (current && depth < MAX_DEPTH) {
    if (current.id === id) return true;
    current = current.parentId != null ? byId.get(current.parentId) : null;
    depth++;
  }
  return false;
}

export const PROJECT_TYPES = [
  'Implémentation', 'Rollout', 'Support', 'TMA', 'Upgrade', 'Migration',
  'Conversion S/4HANA', 'AMS', 'POC', 'Audit',
];

// 'Clôturé'/'Annulé' are the only two statuses treated as no-longer-active -
// everything else (including no status set at all, common on older records)
// counts as active, matching the mockup's "Actifs" filter. Lives here
// (rather than in ProjectTree.jsx, which renders ProjectTreeNode, which in
// turn needs this) purely to avoid a circular import between the two.
const INACTIVE_STATUSES = ['Clôturé', 'Annulé'];
export function isActiveStatus(status) {
  return !INACTIVE_STATUSES.includes(status);
}

export function isIncomplete(node) {
  return !node.modules?.length && !node.startDate;
}

const SORT_ORDER_COMPARATOR = (a, b) => a.sortOrder - b.sortOrder;

// `compare` defaults to the manual drag-order column - pass a different
// comparator (échéance/nom/type) to sort siblings by that instead. Sibling
// grouping itself never changes, only the order within each group.
export default function useProjectTree(records, compare = SORT_ORDER_COMPARATOR) {
  return useMemo(() => {
    const byParent = new Map();
    for (const p of records) {
      const key = p.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(p);
    }
    for (const siblings of byParent.values()) {
      siblings.sort(compare);
    }

    const childrenOf = (parentId) => byParent.get(parentId ?? null) || [];

    const descendantsOf = (id) => {
      const result = [];
      const stack = [...childrenOf(id)];
      while (stack.length > 0) {
        const node = stack.pop();
        result.push(node);
        stack.push(...childrenOf(node.id));
      }
      return result;
    };

    return { roots: childrenOf(null), childrenOf, descendantsOf };
  }, [records, compare]);
}
