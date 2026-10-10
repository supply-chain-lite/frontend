import api from '@/common/js/api';
import {
  assignmentMap,
  assignmentSnapshot,
  indexModelListing,
  serializeAssignments,
} from './model-assignments';

const accessDescriptions = {
  read: 'View the model and its results.',
  write: 'Write access to the model.',
  execute: 'Execute model tasks.',
  admin: 'Administer model access.',
};

export function initModelAccess() {
  let assignments = new Map();
  let initialSnapshot = assignmentSnapshot(assignments);
  let availableModels = new Map();
  let userModels = new Map();
  let userEmail = '';
  let requestVersion = 0;
  let catalogReady = false;
  const rows = document.getElementById('assignedModelRows');
  const rowTemplate = document.getElementById('assignedModelRowTemplate');
  const modal = document.getElementById('assignModelsModal');
  const catalog = document.getElementById('modelCatalogList');
  const assignButton = document.getElementById('confirmAssignModels');
  const feedback = document.getElementById('modelAccessFeedback');

  function announce(message) {
    document.getElementById('modelAccessStatus').textContent = message;
  }

  function modelDetails(id) {
    return (
      userModels.get(id) ||
      availableModels.get(id) || {
        name: `Model #${id}`,
        project: 'Project unavailable',
      }
    );
  }

  function setAccess(select, access, label) {
    // Preserve an unrecognized server value until the user explicitly changes it.
    if (![...select.options].some((option) => option.value === access)) {
      const option = document.createElement('option');
      option.value = access;
      option.textContent = `${access} (unrecognized)`;
      option.disabled = true;
      select.append(option);
    }
    select.value = access;
    select.setAttribute('aria-label', label);
    select.title = accessDescriptions[access] || 'Choose a supported access level.';
  }

  function renderAssignments() {
    rows.replaceChildren();
    for (const [id, access] of assignments) {
      const model = modelDetails(id);
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector('[data-model-name]').textContent = model.name;
      row.querySelector('[data-model-project]').textContent = model.project;
      const select = row.querySelector('[data-model-access]');
      setAccess(select, access, `Access level for ${model.name}`);
      select.addEventListener('change', () => {
        assignments.set(id, select.value);
        select.title = accessDescriptions[select.value];
        announce(`Access updated for ${model.name}. Save the user to submit changes.`);
      });
      const remove = row.querySelector('[data-remove-model]');
      remove.setAttribute('aria-label', `Remove access to ${model.name}`);
      remove.addEventListener('click', () => {
        assignments.delete(id);
        renderAssignments();
        const nextControl = rows.querySelector('[data-remove-model]');
        (nextControl || document.querySelector('[data-bs-target="#assignModelsModal"]')).focus();
        announce(`${model.name} removed. Save the user to submit changes.`);
      });
      rows.append(row);
    }
    document.getElementById('assignedModelCount').textContent = assignments.size;
    document.getElementById('modelAccessEmpty').hidden = assignments.size > 0;
    rows.closest('.table-responsive').hidden = assignments.size === 0;
  }

  function updatePickerCount() {
    const count = catalog.querySelectorAll('input:checked').length;
    document.getElementById('modelPickerCount').textContent =
      `${count} model${count === 1 ? '' : 's'} selected`;
    assignButton.disabled = !catalogReady;
  }

  function showCatalogMessage(message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'text-body-secondary py-3';
    cell.colSpan = 4;
    cell.textContent = message;
    row.append(cell);
    catalog.replaceChildren(row);
    updatePickerCount();
  }

  function renderCatalog() {
    catalog.replaceChildren();
    // Keep the existing picker convention: assign models owned by the operator.
    // Models owned by the selected user are excluded from assignment controls.
    const assignable = [...availableModels.values()].filter(
      (model) => model.access === 'owner' && userModels.get(model.id)?.access !== 'owner'
    );
    if (!assignable.length) {
      showCatalogMessage('No owned models are available to assign to this user.');
      return;
    }
    for (const model of assignable) {
      const row = document.createElement('tr');
      const selectionCell = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input mt-0';
      checkbox.value = String(model.id);
      checkbox.checked = assignments.has(model.id);
      checkbox.setAttribute('aria-label', `Select ${model.name} in ${model.project}`);
      selectionCell.append(checkbox);
      const projectCell = document.createElement('td');
      projectCell.textContent = model.project;
      const modelCell = document.createElement('td');
      modelCell.textContent = model.name;
      const accessCell = document.createElement('td');
      const select = rowTemplate.content.querySelector('[data-model-access]').cloneNode(true);
      setAccess(
        select,
        assignments.get(model.id) || 'read',
        `Access level for ${model.name} in ${model.project}`
      );
      select.addEventListener('change', () => {
        select.title = accessDescriptions[select.value];
      });
      accessCell.append(select);
      row.append(selectionCell, projectCell, modelCell, accessCell);
      catalog.append(row);
    }
    updatePickerCount();
  }

  async function loadModels() {
    const version = ++requestVersion;
    const targetEmail = userEmail;
    catalogReady = false;
    showCatalogMessage('Loading models…');
    const results = await Promise.allSettled([
      api.post('/models/list'),
      targetEmail
        ? api.post('/user-management/get-user-models', { UserEmail: targetEmail })
        : Promise.resolve({ project_models: {} }),
    ]);
    // A slow response for a previous user must never relabel the current user.
    if (version !== requestVersion) return;
    const [available, selected] = results;
    if (available.status === 'fulfilled') {
      availableModels = indexModelListing(available.value?.project_models);
    }
    if (selected.status === 'fulfilled') {
      userModels = indexModelListing(selected.value?.project_models);
    }
    renderAssignments();
    catalogReady = results.every((result) => result.status === 'fulfilled');
    feedback.textContent = catalogReady
      ? ''
      : 'Some model names or ownership details could not be loaded. Existing assignments are retained by ID. Reopen Assign models to retry.';
    feedback.hidden = catalogReady;
    if (catalogReady) renderCatalog();
    else showCatalogMessage('Unable to load models. Close and reopen this window to try again.');
  }

  function reset(user = null, copiedAssignments = null) {
    userEmail = user?.UserEmail || '';
    userModels = new Map();
    assignments = copiedAssignments || assignmentMap(user?.userModels);
    initialSnapshot = assignmentSnapshot(assignments);
    feedback.hidden = true;
    announce('');
    renderAssignments();
    void loadModels();
  }

  modal.addEventListener('show.bs.modal', () => {
    void loadModels();
  });
  catalog.addEventListener('change', updatePickerCount);
  assignButton.addEventListener('click', () => {
    if (!catalogReady) return;
    for (const checkbox of catalog.querySelectorAll('input')) {
      const id = Number(checkbox.value);
      if (!checkbox.checked) assignments.delete(id);
      else {
        const select = checkbox.closest('tr').querySelector('[data-model-access]');
        assignments.set(id, select.value);
      }
    }
    // Assignments unavailable in the picker are deliberately retained.
    renderAssignments();
    announce(`${assignments.size} models assigned. Save the user to submit changes.`);
    window.bootstrap.Modal.getInstance(modal)?.hide();
  });

  return {
    select: (user) => reset(user),
    add: () => reset(),
    saveAs: () => reset(null, new Map(assignments)),
    snapshot: () => assignmentSnapshot(assignments),
    requestModels: (isNewUser) =>
      isNewUser || assignmentSnapshot(assignments) !== initialSnapshot
        ? serializeAssignments(assignments)
        : undefined,
  };
}
