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

export default function useProjectTree(records) {
  return useMemo(() => {
    const byParent = new Map();
    for (const p of records) {
      const key = p.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(p);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.sortOrder - b.sortOrder);
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
  }, [records]);
}
