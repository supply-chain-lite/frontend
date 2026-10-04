import api from '@/common/js/api';

const accessDescriptions = {
  copy: 'Create a personal copy; no editing or execution of the original.',
  read: 'View the model and its results.',
  'read-execute': 'View the model and run tasks; no editing.',
  'read-write-execute': 'View, edit the model and run tasks.',
};

export function initModelAccess() {
  const previews = new Map();
  let assignments = new Map();
  let ownerModels = new Map();
  let catalogReady = false;
  const rows = document.getElementById('assignedModelRows');
  const rowTemplate = document.getElementById('assignedModelRowTemplate');
  const modal = document.getElementById('assignModelsModal');
  const catalog = document.getElementById('modelCatalogList');
  const assignButton = document.getElementById('confirmAssignModels');

  function announce(message) {
    document.getElementById('modelAccessStatus').textContent = message;
  }

  function renderAssignments() {
    rows.replaceChildren();
    for (const [id, access] of assignments) {
      const model = ownerModels.get(id);
      if (!model) continue;
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector('[data-model-name]').textContent = model.name;
      row.querySelector('[data-model-project]').textContent = model.project;
      const select = row.querySelector('[data-model-access]');
      select.value = access;
      select.setAttribute('aria-label', `Access level for ${model.name}`);
      select.addEventListener('change', () => {
        assignments.set(id, select.value);
        announce(`Access updated for ${model.name} in the preview.`);
      });
      const remove = row.querySelector('[data-remove-model]');
      remove.setAttribute('aria-label', `Remove access to ${model.name}`);
      remove.addEventListener('click', () => {
        assignments.delete(id);
        renderAssignments();
        const nextControl = rows.querySelector('[data-remove-model]');
        (nextControl || document.querySelector('[data-bs-target="#assignModelsModal"]')).focus();
        announce(`${model.name} removed from the preview.`);
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

  async function loadOwnerModels() {
    catalogReady = false;
    showCatalogMessage('Loading models…');
    try {
      const response = await api.post('/models/list');
      ownerModels = new Map();
      const projectModels = response?.project_models || {};

      for (const [project, models] of Object.entries(projectModels)) {
        if (!models || typeof models !== 'object' || Array.isArray(models)) continue;
        for (const [name, access] of Object.entries(models)) {
          if (access !== 'owner') continue;
          const id = JSON.stringify([project, name]);
          ownerModels.set(id, { id, project, name });
        }
      }

      catalogReady = true;
      catalog.replaceChildren();
      if (!ownerModels.size) {
        showCatalogMessage('No owned models are available.');
        return;
      }

      for (const model of ownerModels.values()) {
        const row = document.createElement('tr');
        const selectionCell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input mt-0';
        checkbox.value = model.id;
        checkbox.checked = assignments.has(model.id);
        checkbox.setAttribute('aria-label', `Select ${model.name} in ${model.project}`);
        selectionCell.append(checkbox);

        const projectCell = document.createElement('td');
        projectCell.textContent = model.project;
        const modelCell = document.createElement('td');
        modelCell.textContent = model.name;
        const accessCell = document.createElement('td');
        const select = rowTemplate.content.querySelector('[data-model-access]').cloneNode(true);
        select.value = assignments.get(model.id) || 'read';
        select.setAttribute('aria-label', `Access level for ${model.name} in ${model.project}`);
        select.title = accessDescriptions[select.value];
        select.addEventListener('change', () => {
          select.title = accessDescriptions[select.value];
        });
        accessCell.append(select);
        row.append(selectionCell, projectCell, modelCell, accessCell);
        catalog.append(row);
      }
      updatePickerCount();
    } catch {
      catalogReady = false;
      showCatalogMessage('Unable to load models. Close and reopen this window to try again.');
    }
  }

  modal.addEventListener('show.bs.modal', async () => {
    await loadOwnerModels();
  });
  catalog.addEventListener('change', updatePickerCount);
  assignButton.addEventListener('click', () => {
    if (!catalogReady) return;
    for (const checkbox of catalog.querySelectorAll('input')) {
      if (!checkbox.checked) {
        assignments.delete(checkbox.value);
      } else {
        const select = checkbox.closest('tr').querySelector('[data-model-access]');
        assignments.set(checkbox.value, select.value);
      }
    }
    renderAssignments();
    announce(
      `${assignments.size} model${assignments.size === 1 ? '' : 's'} selected in the preview.`
    );
    window.bootstrap.Modal.getInstance(modal).hide();
  });

  return {
    select(userEmail) {
      if (!previews.has(userEmail)) {
        previews.set(userEmail, new Map());
      }
      assignments = previews.get(userEmail);
      renderAssignments();
    },
    add() {
      assignments = new Map();
      renderAssignments();
    },
    saveAs() {
      assignments = new Map(assignments);
      renderAssignments();
    },
    bind(userEmail) {
      previews.set(userEmail, assignments);
    },
  };
}
