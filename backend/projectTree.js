const MAX_DEPTH = 20;

// Walks the parent chain of `projectId` within `allProjects` (objects with
// `id`/`parentId`/`client`) and joins the names root-first. Depth is capped
// so a stray cyclic row (shouldn't happen - see isDescendant - but cheap to
// guard) can't hang the caller.
function buildBreadcrumb(allProjects, projectId, separator = ' — ') {
  const byId = new Map(allProjects.map((p) => [p.id, p]));
  const chain = [];
  let current = byId.get(projectId);
  let depth = 0;
  while (current && depth < MAX_DEPTH) {
    chain.unshift(current.client);
    current = current.parentId != null ? byId.get(current.parentId) : null;
    depth++;
  }
  return chain.join(separator);
}

// True if `id` appears anywhere in the ancestor chain starting at
// `candidateParentId` - i.e. whether reparenting `id` under
// `candidateParentId` would create a cycle.
function isDescendant(allProjects, candidateParentId, id) {
  if (candidateParentId == null) return false;
  const byId = new Map(allProjects.map((p) => [p.id, p]));
  let current = byId.get(candidateParentId);
  let depth = 0;
  while (current && depth < MAX_DEPTH) {
    if (current.id === id) return true;
    current = current.parentId != null ? byId.get(current.parentId) : null;
    depth++;
  }
  return false;
}

module.exports = { buildBreadcrumb, isDescendant, MAX_DEPTH };
