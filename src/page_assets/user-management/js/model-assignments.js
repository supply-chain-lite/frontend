/**
 * @typedef {'read'|'write'|'execute'|'admin'} ModelAccessLevel
 * @typedef {{ModelId: number, AccessLevel: ModelAccessLevel}} UserModelAssignment
 * @typedef {Object<string, Object<string, [string, number]>>} ProjectModels
 * @typedef {{project_models: ProjectModels}} ModelListingResponse
 * Both /models/list and /user-management/get-user-models return this shape.
 */

/** Index listing pairs by model ID, independent of project or display name. */
export function indexModelListing(projectModels = {}) {
  const indexed = new Map();
  for (const [project, models] of Object.entries(projectModels || {})) {
    if (!models || typeof models !== 'object' || Array.isArray(models)) continue;
    for (const [name, pair] of Object.entries(models)) {
      if (!Array.isArray(pair)) continue;
      const [access, id] = pair;
      if (!Number.isSafeInteger(id) || id < 1 || typeof access !== 'string') continue;
      if (!indexed.has(id)) indexed.set(id, { id, project, name, access });
    }
  }
  return indexed;
}

/** @param {UserModelAssignment[]} [userModels] */
export function assignmentMap(userModels = []) {
  const assignments = new Map();
  for (const { ModelId, AccessLevel } of userModels || []) {
    if (Number.isSafeInteger(ModelId) && ModelId > 0 && AccessLevel !== 'owner') {
      assignments.set(ModelId, AccessLevel);
    }
  }
  return assignments;
}

/** @returns {UserModelAssignment[]} Complete, unique non-owned assignments. */
export function serializeAssignments(assignments) {
  return [...assignments]
    .sort(([first], [second]) => first - second)
    .map(([ModelId, AccessLevel]) => ({ ModelId, AccessLevel }));
}

/** Order-independent comparison also recognizes edits that were reverted. */
export function assignmentSnapshot(assignments) {
  return JSON.stringify(serializeAssignments(assignments));
}
