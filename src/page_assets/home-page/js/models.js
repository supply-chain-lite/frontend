import * as XLSX from 'xlsx';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import api from '@/common/js/api';
import { $, on } from '@/common/js/dom';
import { updateModelTasks } from './tasks';
let latestTableAccordionRequestId = 0;

async function fetchModels(appState) {
  try {
    const data = await api.post('/models/list');
    appState.projectModels = data.project_models || {};
    appState.projects = Object.keys(appState.projectModels);
  } catch {
    // api.js already displayed the error toast
  }

  try {
    const template_data = await api.post('/models/templates');
    appState.modelTemplates = template_data.model_templates || [];
  } catch {
    // api.js already displayed the error toast
  }
}

/**
 * Render the list of models for the current project, ensure a valid selected model, and refresh related UI.
 *
 * Populates the DOM element #modelList with the models found in appState.projectModels for appState.currentProject,
 * wires click handlers to update appState.selected_model and active styling, and calls updateModelActionVisibility
 * and updateTableAccordion to reflect the current selection.
 *
 * @param {Object} appState - Global application state containing at least `currentProject`, `projectModels`, and `selected_model`.
 */
function renderCurrentProjectModels(appState) {
  const modelList = $('#modelList');
  if (!modelList) return;

  const currentProject = appState.currentProject;
  const projectModels = appState.projectModels?.[currentProject];

  let modelNames = [];
  if (Array.isArray(projectModels)) {
    modelNames = projectModels;
  } else if (projectModels && typeof projectModels === 'object') {
    modelNames = Object.keys(projectModels);
  }

  modelList.innerHTML = '';

  if (!modelNames.length) {
    appState.selected_model = null;
    updateModelActionVisibility(appState);
    const emptyItem = document.createElement('div');
    emptyItem.className = 'list-group-item text-muted';
    emptyItem.textContent = 'No models found for current project.';
    modelList.appendChild(emptyItem);
    updateTableAccordion(appState); // Clear tables since no model is selected
    updateModelTasks(appState);
    return;
  }

  modelNames.forEach((name, index) => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = `list-group-item list-group-item-action${index === 0 ? ' active' : ''}`;
    item.textContent = name;
    modelList.appendChild(item);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      document
        .querySelectorAll('#modelList .list-group-item')
        .forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      appState.selected_model = item.textContent;
      updateModelActionVisibility(appState);
      updateTableAccordion(appState); // Refresh tables for the newly selected model
      updateModelTasks(appState); // Refresh tasks for the newly selected model
    });
  });
  // update appState.selected_model to first model if not set
  if (!appState.selected_model || !modelNames.includes(appState.selected_model)) {
    appState.selected_model = modelNames[0];
  } else {
    // ensure the correct model is highlighted as active
    const activeItem = Array.from(document.querySelectorAll('#modelList .list-group-item')).find(
      (el) => el.textContent === appState.selected_model
    );
    if (activeItem) {
      document
        .querySelectorAll('#modelList .list-group-item')
        .forEach((el) => el.classList.remove('active'));
      activeItem.classList.add('active');
    }
  }
  updateModelActionVisibility(appState);
  updateTableAccordion(appState); // Refresh tables for the newly selected model
  updateModelTasks(appState); // Refresh tasks for the newly selected model
}

/**
 * Update visibility of model action menu items to require owner access.
 *
 * Shows the elements with IDs "backupModelMenu", "restoreModelMenu", "shareModelMenu",
 * "uploadModelMenu", and "uploadExcelMenu" only when the selected model's access level
 * within the current project is exactly `"owner"`; hides them otherwise.
 *
 * @param {Object} appState - Application state containing `projectModels`, `currentProject`, and `selected_model`.
 */
function updateModelActionVisibility(appState) {
  const access =
    appState.projectModels?.[appState.currentProject]?.[appState.selected_model] || 'none';
  const backup = document.getElementById('backupModelMenu');
  const restore = document.getElementById('restoreModelMenu');
  const share = document.getElementById('shareModelMenu');
  const upload = document.getElementById('uploadModelMenu');
  const excelUpload = document.getElementById('uploadExcelMenu');
  const vacuumDatabase = document.getElementById('vacuumDatabaseMenu');
  const manageAccess = document.getElementById('manageAccessMenu');
  const sqlClientMenu = document.getElementById('sqlClientMenu');

  const isOwner = access === 'owner';

  if (vacuumDatabase) vacuumDatabase.style.display = isOwner ? '' : 'none';
  if (backup) backup.style.display = isOwner ? '' : 'none';
  if (restore) restore.style.display = isOwner ? '' : 'none';
  if (share) share.style.display = isOwner ? '' : 'none';
  if (upload) upload.style.display = isOwner ? '' : 'none';
  if (excelUpload) excelUpload.style.display = isOwner ? '' : 'none';
  if (manageAccess) manageAccess.style.display = access === 'none' ? 'none' : '';
  if (sqlClientMenu) sqlClientMenu.style.display = isOwner ? '' : 'none';
}

/* ── Add New Model Modal ───────────────────────────────────────────────────── */

function setupAddNewModel(appState) {
  const modal = $('#addNewModelModal');
  const projectSelect = $('#projectName');
  const modelNameInput = $('#modelName');
  const templateSelect = $('#modelTemplate');
  const sampleDataCheckbox = $('#upload_model_with_sample_data');
  const submitBtn = $('#submitAddModelBtn');

  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    // Populate project select, pre-select current project
    projectSelect.innerHTML = '';
    appState.projects.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === appState.currentProject) opt.selected = true;
      projectSelect.appendChild(opt);
    });
    projectSelect.disabled = true;

    // Populate template select from app state
    templateSelect.innerHTML = '';

    const templates = appState.modelTemplates || [];
    templates.forEach((tpl) => {
      const opt = document.createElement('option');
      opt.value = tpl;
      opt.textContent = tpl;
      templateSelect.appendChild(opt);
    });

    if (!templates.length) {
      toastError('No model templates available.');
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    modelNameInput.value = '';
    sampleDataCheckbox.checked = false;
  });

  on(submitBtn, 'click', async () => {
    const projectName = projectSelect.value;
    const modelName = modelNameInput.value.trim();
    const template = templateSelect.value;

    if (!projectName) {
      toastError('Please select a project.');
      return;
    }
    if (!modelName) {
      toastError('Model name is required.');
      return;
    }
    if (!template) {
      toastError('Please select a template.');
      return;
    }

    const currentModels = Object.keys(appState.projectModels[projectName] || {});

    if (currentModels.includes(modelName)) {
      toastError('A model with this name already exists in the selected project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating…';

    try {
      await api.post('/models/create', {
        project_name: projectName,
        model_name: modelName,
        model_template: template,
        with_sample_data: sampleDataCheckbox.checked,
      });
      toastSuccess('Model created successfully!');
      if (!appState.projectModels[projectName]) {
        appState.projectModels[projectName] = {};
      }
      appState.projectModels[projectName][modelName] = 'owner'; // Add new model to app state with default role
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Model';
    }
  });
}

function setupSaveAsModel(appState) {
  const modal = $('#saveAsModelModal');
  const projectInput = $('#saveAsTargetProject');
  const existingModelInput = $('#saveAsExistingModelName');
  const newModelNameInput = $('#saveAsNewModelName');
  const submitBtn = $('#submitSaveAsModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    // Auto-populate and disable current project
    projectInput.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = appState.currentProject;
    opt.textContent = appState.currentProject;
    opt.selected = true;
    projectInput.appendChild(opt);
    projectInput.disabled = true;

    // Auto-populate and disable existing (active) model name
    existingModelInput.value = appState.selected_model || '';
    existingModelInput.disabled = true;

    // Clear new model name and enable submit
    newModelNameInput.value = '';
    submitBtn.disabled = false;
  });

  on(modal, 'hidden.bs.modal', () => {
    newModelNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const newModelName = newModelNameInput.value.trim();
    if (!newModelName) {
      toastError('New model name is required.');
      return;
    }

    // Check for duplicate model name in current project
    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    if (currentModels.includes(newModelName)) {
      toastError('A model with this name already exists in the current project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving…';

    try {
      await api.post('/models/save-as', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        new_model_name: newModelName,
      });
      toastSuccess('Model saved successfully!');
      // Add new model to app state
      if (!appState.projectModels[appState.currentProject]) {
        appState.projectModels[appState.currentProject] = {};
      }
      appState.projectModels[appState.currentProject][newModelName] = 'owner';
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save As';
    }
  });
}

/* ── Add Existing Model Modal (tree UI) ─────────────────────────────────── */

/** Build the project→model tree inside #existingModelTree. */
function buildModelTree(container, projectModels, currentProject) {
  container.innerHTML = '';

  const ul = document.createElement('ul');
  ul.className = 'model-tree';

  Object.entries(projectModels).forEach(([project, models]) => {
    if (project === currentProject) return; // skip current project

    const modelNames = Array.isArray(models) ? models : Object.keys(models || {});
    if (!modelNames.length) return;

    const projectLi = document.createElement('li');
    projectLi.className = 'tree-project';

    // Project checkbox + label
    const projectLabel = document.createElement('label');
    projectLabel.className = 'tree-label';
    const projectCb = document.createElement('input');
    projectCb.type = 'checkbox';
    projectCb.className = 'tree-cb tree-project-cb';
    projectCb.dataset.project = project;
    const projectIcon = document.createElement('span');
    projectIcon.className = 'tree-icon me-1';
    projectIcon.innerHTML = '<i class="fa-solid fa-bars text-secondary"></i>';
    projectLabel.append(projectCb, projectIcon, ` ${project}`);
    projectLi.appendChild(projectLabel);

    // Model children
    const modelsUl = document.createElement('ul');
    modelsUl.className = 'tree-models';
    modelNames.forEach((modelName) => {
      const modelLi = document.createElement('li');
      const modelLabel = document.createElement('label');
      modelLabel.className = 'tree-label';
      const modelCb = document.createElement('input');
      modelCb.type = 'checkbox';
      modelCb.className = 'tree-cb tree-model-cb';
      modelCb.dataset.project = project;
      modelCb.dataset.model = modelName;

      const access = typeof models === 'object' && !Array.isArray(models) ? models[modelName] : '';
      const iconClass = access === 'owner' ? 'fa-solid fa-database' : 'fa-solid fa-link';
      const modelIcon = document.createElement('span');
      modelIcon.className = 'tree-icon me-1';
      modelIcon.innerHTML = `<i class="${iconClass} text-secondary"></i>`;

      modelLabel.append(modelCb, modelIcon, ` ${modelName}`);
      modelLi.appendChild(modelLabel);
      modelsUl.appendChild(modelLi);

      // Update project checkbox state when a model is toggled
      modelCb.addEventListener('change', () => {
        const siblings = modelsUl.querySelectorAll('.tree-model-cb');
        const allChecked = [...siblings].every((cb) => cb.checked);
        const someChecked = [...siblings].some((cb) => cb.checked);
        projectCb.checked = allChecked;
        projectCb.indeterminate = !allChecked && someChecked;
      });
    });
    projectLi.appendChild(modelsUl);

    // Toggle all models when project checkbox is clicked
    projectCb.addEventListener('change', () => {
      modelsUl.querySelectorAll('.tree-model-cb').forEach((cb) => (cb.checked = projectCb.checked));
      projectCb.indeterminate = false;
    });

    ul.appendChild(projectLi);
  });

  if (!ul.children.length) {
    container.innerHTML = '<p class="text-muted">No other projects with models found.</p>';
    return;
  }
  container.appendChild(ul);
}

/**
 * Collect selected models from a tree container.
 * @param {Element} container - DOM element that contains model checkboxes (`.tree-model-cb`) with `data-model` and `data-project` attributes.
 * @returns {{model_name: string, project_name: string}[]} An array of objects for each checked model, each containing `model_name` and `project_name`.
 */
function getSelectedModels(container) {
  return [...container.querySelectorAll('.tree-model-cb:checked')].map((cb) => ({
    model_name: cb.dataset.model,
    project_name: cb.dataset.project,
  }));
}

/**
 * Initialize and wire the "Backup Model" modal: populate inputs, validate user comment, submit backup request, and manage button/modal state.
 *
 * @param {Object} appState - Application state object containing currentProject and selected_model used to prefill and validate the modal.
 */

function setupBackupModel(appState) {
  const modal = $('#backupModelModal');
  const currentProjectInput = $('#backupCurrentProject');
  const currentModelInput = $('#backupModelName');
  const commentInput = $('#backupUserComment');
  const submitBtn = $('#submitBackupModelBtn');
  if (!modal || !submitBtn || !commentInput) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    commentInput.value = '';

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for backup.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    commentInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Backup';
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for backup.');
      return;
    }

    const userComment = commentInput.value.trim();
    if (!userComment) {
      toastError('Backup comment is required.');
      commentInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Backing up…';

    try {
      await api.post('/models/backup', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        backup_comment: userComment,
      });
      toastSuccess('Model backup created successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Backup';
    }
  });
}

/**
 * Format a backup timestamp into a human-readable string using the runtime locale.
 * @param {(string|Date|null|undefined)} dateTime - The timestamp to format; may be a Date object, an ISO/string, or falsy.
 * @returns {string} `'Unknown date'` if `dateTime` is falsy, the original `dateTime` converted to a string if it cannot be parsed as a valid date, or the formatted date string using the runtime locale.
 */

function formatBackupDateTime(dateTime) {
  if (!dateTime) return 'Unknown date';

  const parsedDate = new Date(dateTime);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(dateTime);
  }

  return parsedDate.toLocaleString();
}

/**
 * Initialize and wire the Restore Model modal: populate inputs, load available backups, and handle restore actions.
 *
 * When the modal is shown, the current project and model are set from `appState` and the backup list is loaded from the server;
 * the backup select is populated and the submit button is enabled only when backups are available. Selecting a backup enables the submit button.
 * Submitting sends a restore request for the chosen backup, shows success feedback, and closes the modal on success.
 *
 * @param {Object} appState - Application state; this function reads `appState.currentProject` and `appState.selected_model`.
 */
function setupRestoreModel(appState) {
  const modal = $('#restoreModelModal');
  const currentProjectInput = $('#restoreCurrentProject');
  const currentModelInput = $('#restoreModelName');
  const backupSelect = $('#restoreBackupSelect');
  const submitBtn = $('#submitRestoreModelBtn');
  if (!modal || !submitBtn || !backupSelect) return;

  on(modal, 'show.bs.modal', async () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    backupSelect.innerHTML = '<option disabled selected value="">Loading backups...</option>';
    submitBtn.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for restore.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    try {
      const data = await api.post('/models/get-backups', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });

      const backups = data.model_backups || [];

      backupSelect.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = backups.length ? 'Select backup' : 'No backups available';
      backupSelect.appendChild(placeholder);

      backups.forEach((backup) => {
        const option = document.createElement('option');
        option.value = backup[0];
        const comment = backup[1] || 'No comment';
        const dateTime = formatBackupDateTime(backup[2] || backup[3] || backup[4]);
        option.textContent = `${comment} (${dateTime})`;
        backupSelect.appendChild(option);
      });

      submitBtn.disabled = !backups.length;
    } catch {
      backupSelect.innerHTML = '<option disabled selected value="">Unable to load backups</option>';
      submitBtn.disabled = true;
    }
  });

  on(backupSelect, 'change', () => {
    submitBtn.disabled = !backupSelect.value;
  });

  on(modal, 'hidden.bs.modal', () => {
    backupSelect.innerHTML = '<option disabled selected value="">Select backup</option>';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Restore';
  });

  on(submitBtn, 'click', async () => {
    const backupId = backupSelect.value;
    if (!backupId) {
      toastError('Please select a backup to restore.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Restoring…';

    try {
      await api.post('/models/restore', {
        backup_id: backupId,
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model restored successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Restore';
    }
  });
}

/**
 * Wire the "Add Existing Model" modal: populate the model-selection tree on show and handle adding selected models into the current project.
 *
 * When the modal is submitted this function validates selection and name collisions, POSTs to `/models/add-existing`,
 * updates `appState.projectModels` by adding the selected models (preserving their access level or defaulting to `"read"`)
 * into the current project and removing them from their source project, re-renders the current project's model list,
 * and hides the modal. Validation failures show an error toast and abort the operation.
 *
 * @param {Object} appState - Application state object containing `projects`, `currentProject`, `projectModels`, and UI selection state.
 */
function setupAddExistingModel(appState) {
  const modal = $('#addExistingModelModal');
  const modelTree = $('#existingModelTree');
  const submitBtn = $('#submitAddExistingModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    buildModelTree(modelTree, appState.projectModels, appState.currentProject);
  });

  on(modal, 'hidden.bs.modal', () => {
    modelTree.innerHTML = '';
  });

  on(submitBtn, 'click', async () => {
    const selected = getSelectedModels(modelTree);
    if (!selected.length) {
      toastError('Please select at least one model.');
      return;
    }

    // Validate no name collisions with current project models
    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    const conflicts = selected
      .filter((s) => currentModels.includes(s.model_name))
      .map((s) => s.model_name);
    if (conflicts.length) {
      toastError(`Model name(s) already exist in current project: ${conflicts.join(', ')}`);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Adding…';

    try {
      await api.post('/models/add-existing', {
        project_name: appState.currentProject,
        model_project_pairs: selected.map((s) => [s.model_name, s.project_name]),
      });
      toastSuccess('Model(s) added successfully!');

      // Update local app state
      selected.forEach(({ model_name, project_name }) => {
        const access = appState.projectModels[project_name]?.[model_name] || 'read';
        if (!appState.projectModels[appState.currentProject]) {
          appState.projectModels[appState.currentProject] = {};
        }
        appState.projectModels[appState.currentProject][model_name] = access;
        delete appState.projectModels[project_name][model_name];
      });

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add';
    }
  });
}

/**
 * Wire the Rename Model modal: validate input, call the rename API, and update UI state.
 *
 * Validates a non-empty new model name and checks for name collisions within the current project;
 * on success it updates appState.projectModels for the current project (preserving the model's access),
 * sets appState.selected_model to the new name, re-renders the model list, and closes the modal.
 *
 * @param {Object} appState - Application state object (expects properties like `currentProject`, `selected_model`, and `projectModels`).
 */

function setupRenameModel(appState) {
  const modal = $('#renameModelModal');
  const projectInput = $('#RenameProjectName');
  const currentModelInput = $('#currentModelName');
  const newModelNameInput = $('#newModelName');
  const submitBtn = $('#submitRenameModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    projectInput.value = appState.currentProject || '';
    projectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    newModelNameInput.value = '';
    if (!appState.selected_model || !appState.currentProject) {
      toastError('No model selected for renaming.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    newModelNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const newModelName = newModelNameInput.value.trim();
    if (!newModelName) {
      toastError('New model name is required.');
      return;
    }

    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    if (currentModels.includes(newModelName)) {
      toastError('A model with this name already exists in the current project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Renaming…';

    try {
      await api.post('/models/rename', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        new_model_name: newModelName,
      });
      toastSuccess('Model renamed successfully!');

      // Update app state: replace old key with new key, preserve access
      const access =
        appState.projectModels[appState.currentProject]?.[appState.selected_model] || 'owner';
      delete appState.projectModels[appState.currentProject][appState.selected_model];
      appState.projectModels[appState.currentProject][newModelName] = access;
      appState.selected_model = newModelName;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Rename';
    }
  });
}

/**
 * Wire up the Delete Model modal: populate and validate inputs, perform deletion, and update appState on success.
 *
 * On modal show this populates and disables the project and model inputs and requires a confirmation checkbox
 * and exact model-name typing before enabling deletion. On submit it disables the button, shows a spinner,
 * posts to /models/delete, removes the model entry from appState.projectModels[currentProject], clears
 * appState.selected_model, re-renders the model list, and hides the modal on success.
 *
 * @param {Object} appState - Application state; used to read `currentProject` and `selected_model` and to update
 *                            `projectModels` and `selected_model` after a successful deletion.
 */

function setupDeleteModel(appState) {
  const modal = $('#deleteModelModal');
  const projectInput = $('#DeleteProjectName');
  const modelActualName = $('#deleteModelActualName');
  const confirmInput = $('#deleteModelConfirmInput');
  const confirmCheckbox = $('#confirmDeleteModel');
  const modelNameLabel = $('#deleteModelName');
  const submitBtn = $('#submitDeleteModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    projectInput.value = appState.currentProject || '';
    projectInput.disabled = true;
    modelActualName.value = appState.selected_model || '';
    modelActualName.disabled = true;
    modelNameLabel.textContent = appState.selected_model || '';
    if (!appState.selected_model || !appState.currentProject) {
      toastError('No model selected for deletion.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
    confirmInput.value = '';
    confirmCheckbox.checked = false;
  });

  on(modal, 'hidden.bs.modal', () => {
    confirmInput.value = '';
    confirmCheckbox.checked = false;
  });

  on(submitBtn, 'click', async () => {
    if (!confirmCheckbox.checked) {
      toastError('Please confirm you understand this action is permanent.');
      return;
    }
    if (confirmInput.value.trim() !== appState.selected_model) {
      toastError('Model name does not match. Please type the exact model name.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Deleting…';

    try {
      await api.post('/models/delete', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model deleted successfully!');

      delete appState.projectModels[appState.currentProject]?.[appState.selected_model];
      appState.selected_model = null;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Delete';
    }
  });
}

/**
 * Initialize the download-model modal: populate inputs from app state, validate selection, and trigger model artifact download.
 *
 * When shown, the modal fills and disables project/model inputs and hides itself with an error toast if no model is selected.
 * On submit, it requests the selected model artifact from the server, starts the file download, displays a success toast, and hides the modal.
 * The submit button is disabled while the download is in progress and its label/state is restored afterwards.
 *
 * @param {Object} appState - Application state containing at least `currentProject` and `selected_model`.
 */

function setupDownloadModel(appState) {
  const modal = $('#downloadModelModal');
  const currentProjectInput = $('#downloadProjectName');
  const currentModelInput = $('#downloadModelName');
  const submitBtn = $('#submitDownloadModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for download.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for download.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Downloading…';

    try {
      const { blob: artifactBlob, fileName } = await api.postDownload('/models/download', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      const downloadUrl = window.URL.createObjectURL(artifactBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName || `${appState.selected_model}.db`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toastSuccess('Model artifact download started.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Download';
    }
  });
}

/**
 * Wire the upload-model modal to the UI and handle validating and uploading a model artifact file.
 *
 * Validates the selected file has a `.db` or `.sqlite3` extension, sends it as FormData to `/models/upload`,
 * shows a success toast and closes the modal on success.
 * @param {Object} appState - Application state containing `currentProject` and `selected_model` used to populate the modal.
 */

function setupUploadModel(appState) {
  const modal = $('#uploadModelModal');
  const currentProjectInput = $('#uploadProjectName');
  const currentModelInput = $('#uploadModelName');
  const fileInput = $('#uploadModelFile');
  const submitBtn = $('#submitUploadModelBtn');
  if (!modal || !submitBtn || !fileInput) return;

  const allowedExtensions = ['.db', '.sqlite3'];

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    fileInput.value = '';
    fileInput.accept = allowedExtensions.join(',');

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    fileInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      return;
    }

    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) {
      toastError('Please choose a model artifact file.');
      return;
    }

    const lowerName = selectedFile.name.toLowerCase();
    const isAllowedFile = allowedExtensions.some((extension) => lowerName.endsWith(extension));
    if (!isAllowedFile) {
      toastError('Only .db and .sqlite3 files are supported.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Uploading…';

    try {
      const formData = new FormData();
      formData.append('project_name', appState.currentProject);
      formData.append('model_name', appState.selected_model);
      formData.append('upload_file', selectedFile);
      await api.postFormData('/models/upload', formData);
      toastSuccess('Model artifact uploaded successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload';
    }
  });
}

/**
 * Wire and manage the "Share Model" modal: populate fields from app state, validate input, enable/disable the submit button, and perform the share request.
 *
 * Sets up modal show/hidden handlers, input change handlers, and the submit flow which validates the target email and access level, prevents sharing with the current user, calls the API to share the model, shows a success toast, and hides the modal on success.
 *
 * @param {object} appState - Application state containing at least `currentProject`, `selected_model`, and optionally `user.email`; used to populate inputs and determine the share target.
 */
function setupShareModel(appState) {
  const modal = $('#shareModelModal');
  const currentProjectInput = $('#shareCurrentProject');
  const currentModelInput = $('#shareModelName');
  const shareWithUserInput = $('#shareWithUser');
  const accessLevelSelect = $('#shareAccessLevel');
  const submitBtn = $('#submitShareModelBtn');
  if (!modal || !submitBtn || !shareWithUserInput || !accessLevelSelect) return;

  function updateSubmitState() {
    const hasValidEmail =
      shareWithUserInput.value.trim().length > 0 && shareWithUserInput.checkValidity();
    submitBtn.disabled = !hasValidEmail || !accessLevelSelect.value;
  }

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    shareWithUserInput.value = '';
    accessLevelSelect.value = 'read';

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for sharing.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    updateSubmitState();
  });

  on(modal, 'hidden.bs.modal', () => {
    shareWithUserInput.value = '';
    accessLevelSelect.value = 'read';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Share';
  });

  on(shareWithUserInput, 'input', updateSubmitState);
  on(accessLevelSelect, 'change', updateSubmitState);

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for sharing.');
      return;
    }

    const targetUserEmail = shareWithUserInput.value.trim();
    if (!targetUserEmail) {
      toastError('Please enter the user email to share with.');
      shareWithUserInput.focus();
      return;
    }

    const normalizedTargetEmail = targetUserEmail.toLowerCase();
    const normalizedCurrentUserEmail = String(appState.user?.email || '')
      .trim()
      .toLowerCase();
    if (normalizedCurrentUserEmail && normalizedTargetEmail === normalizedCurrentUserEmail) {
      toastError('You cannot share a model with yourself.');
      shareWithUserInput.focus();
      return;
    }

    if (!shareWithUserInput.checkValidity()) {
      toastError('Please enter a valid email address.');
      shareWithUserInput.focus();
      return;
    }

    const accessLevel = accessLevelSelect.value;
    if (!accessLevel) {
      toastError('Please select an access level.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sharing…';

    try {
      await api.post('/models/share', {
        target_user_email: normalizedTargetEmail,
        access_level: accessLevel,
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model shared successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.textContent = 'Share';
      updateSubmitState();
    }
  });
}

function setupManageAccessModel(appState) {
  const modal = $('#manageAccessModal');
  const currentProjectInput = $('#manageAccessCurrentProject');
  const currentModelInput = $('#manageAccessModelName');
  const currentTemplateInput = $('#manageAccessTemplateName');
  const ownerView = $('#manageAccessOwnerView');
  const infoView = $('#manageAccessInfoView');
  const userList = $('#manageAccessUserList');
  const emptyMessage = $('#manageAccessEmptyMessage');
  const thisUserAccessInput = $('#thisUserAccessLevel');
  const ownerEmailInput = $('#manageAccessOwnerEmail');
  const ownerProjectNameInput = $('#manageAccessOwnerProject');
  const ownerModelNameInput = $('#manageAccessOwnerModel');
  const submitBtn = $('#submitManageAccessBtn');

  if (!modal || !submitBtn || !ownerView || !infoView || !userList) return;

  const accessOptions = [
    ['read', 'Read Only'],
    ['execute', 'Read & Execute'],
    ['write', 'Write & Execute'],
    ['admin', 'Full Access'],
    ['delete', 'Revoke Access'],
  ];

  let submitMode = 'save';

  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading…'
      : submitMode === 'close'
        ? 'OK'
        : 'Save';
  }

  function renderOwnerAccessList(accessUsers) {
    userList.innerHTML = '';

    accessUsers.forEach(
      ({ user_email: userEmail, access_level: accessLevel, accepted: accepted }) => {
        const row = document.createElement('tr');
        row.dataset.userEmail = userEmail;

        const userCell = document.createElement('td');
        userCell.textContent = userEmail;

        const accessCell = document.createElement('td');
        const accessSelect = document.createElement('select');
        accessSelect.className = 'form-select form-select-sm manage-access-level';
        accessOptions.forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          if (value === String(accessLevel || '').toLowerCase()) {
            option.selected = true;
            if (accepted === 'No') option.textContent += ' (Pending)';
          }
          accessSelect.appendChild(option);
        });
        const this_access =
          accessOptions.find(([value]) => value === String(accessLevel || '').toLowerCase())?.[1] ||
          'Unknown';
        if (this_access === 'Unknown') {
          const unknownOption = document.createElement('option');
          unknownOption.value = String(accessLevel || '').toLowerCase();
          unknownOption.textContent = this_access;
          unknownOption.selected = true;
          unknownOption.disabled = true;
          accessSelect.appendChild(unknownOption);
        }

        accessCell.appendChild(accessSelect);

        row.append(userCell, accessCell);
        userList.appendChild(row);
      }
    );

    emptyMessage.classList.toggle('d-none', accessUsers.length > 0);
    ownerView.classList.toggle('d-none', accessUsers.length === 0);
    submitBtn.disabled = accessUsers.length === 0;
  }

  async function loadModelInfo() {
    return api.post('/models/info', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
    });
  }

  let latestManageAccessRequestId = 0;
  on(modal, 'show.bs.modal', async () => {
    const requestId = ++latestManageAccessRequestId;
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    ownerView.classList.add('d-none');
    infoView.classList.add('d-none');
    userList.innerHTML = '';
    emptyMessage.classList.add('d-none');
    thisUserAccessInput.textContent = '';
    ownerEmailInput.textContent = '';
    ownerProjectNameInput.textContent = '';
    ownerModelNameInput.textContent = '';

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for managing access.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    setLoadingState(true);

    try {
      const modelInfo = await loadModelInfo();
      if (requestId !== latestManageAccessRequestId) return;
      currentTemplateInput.textContent = modelInfo.template_name || '';
      const currentAccess = String(modelInfo.access_level || '').toLowerCase();
      const isOwner = currentAccess === 'owner';

      if (isOwner) {
        ownerView.classList.remove('d-none');
        infoView.classList.add('d-none');
        const accessUsers = modelInfo.access_user_list || [];
        renderOwnerAccessList(accessUsers);
        submitMode = accessUsers.length === 0 ? 'close' : 'save';
        submitBtn.disabled = false;
      } else {
        ownerView.classList.add('d-none');
        infoView.classList.remove('d-none');
        const this_access =
          accessOptions.find(([value]) => value === currentAccess)?.[1] || 'Unknown';

        thisUserAccessInput.textContent = this_access;
        ownerEmailInput.textContent = modelInfo.owner_email || '';
        ownerProjectNameInput.textContent =
          modelInfo.owner_project_name || modelInfo.project_name || '';
        ownerModelNameInput.textContent = modelInfo.owner_model_name || modelInfo.model_name || '';
        submitMode = 'close';
        submitBtn.disabled = false;
      }
    } catch {
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } finally {
      if (requestId === latestManageAccessRequestId) setLoadingState(false);
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    latestManageAccessRequestId++;
    ownerView.classList.add('d-none');
    infoView.classList.add('d-none');
    userList.innerHTML = '';
    emptyMessage.classList.add('d-none');
    submitBtn.classList.remove('d-none');
    submitBtn.disabled = false;
    submitBtn.textContent = submitMode === 'close' ? 'OK' : 'Save';
  });

  on(submitBtn, 'click', async () => {
    if (submitMode === 'close') {
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
    const accessList = Array.from(userList.querySelectorAll('tr')).map((row) => {
      const userEmail = row.dataset.userEmail;
      const accessLevel = row.querySelector('.manage-access-level')?.value || 'read';
      return [userEmail, accessLevel];
    });

    if (!accessList.length) {
      toastError('No shared users found to update.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving…';

    try {
      await api.post('/models/update-access', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        access_list: accessList,
      });
      toastSuccess('Model access updated successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = submitMode === 'close' ? 'OK' : 'Save';
    }
  });
}
/**
 * Wire the "Move Model" modal: populate fields, validate user input, call the move API, and update local state on success.
 *
 * Populates the modal from `appState`, enforces selection and name-collision checks, posts to `/models/move`, and on success
 * moves the model entry in `appState.projectModels` to the target project, clears `appState.selected_model`, re-renders the
 * current project's model list, shows a success toast, and hides the modal.
 *
 * @param {Object} appState - Application state; expected keys: `currentProject`, `selected_model`, `projects`, and `projectModels` (mapping project -> { modelName: access }).
 */

function setupMoveModel(appState) {
  const modal = $('#moveModelModal');
  const currentProjectInput = $('#moveModelModalProjectName');
  const currentModelInput = $('#moveModelName');
  const targetProjectSelect = $('#targetProjectSelect');
  const submitBtn = $('#submitMoveModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for moving.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    targetProjectSelect.innerHTML = '';
    const targetProjects = (appState.projects || []).filter(
      (project) => project !== appState.currentProject
    );

    targetProjects.forEach((project) => {
      const opt = document.createElement('option');
      opt.value = project;
      opt.textContent = project;
      targetProjectSelect.appendChild(opt);
    });

    submitBtn.disabled = !targetProjects.length;
  });

  on(modal, 'hidden.bs.modal', () => {
    targetProjectSelect.innerHTML = '<option disabled selected value="">Select project</option>';
    submitBtn.disabled = false;
  });

  on(submitBtn, 'click', async () => {
    const targetProject = targetProjectSelect.value;
    if (!targetProject) {
      toastError('Please select a target project.');
      return;
    }

    if (targetProject === appState.currentProject) {
      toastError('Target project must be different from current project.');
      return;
    }

    const targetProjectModels = Object.keys(appState.projectModels[targetProject] || {});
    if (targetProjectModels.includes(appState.selected_model)) {
      toastError('The target project already has a model with the same name.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Moving…';

    try {
      await api.post('/models/move', {
        project_name: appState.currentProject,
        new_project_name: targetProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model moved successfully!');

      const modelAccess =
        appState.projectModels[appState.currentProject]?.[appState.selected_model] || 'owner';

      if (!appState.projectModels[targetProject]) {
        appState.projectModels[targetProject] = {};
      }

      appState.projectModels[targetProject][appState.selected_model] = modelAccess;
      delete appState.projectModels[appState.currentProject]?.[appState.selected_model];
      appState.selected_model = null;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Move';
    }
  });
}

/**
 * Initialize the Accept Model modal behavior, handling accept and reject flows for incoming model notifications.
 *
 * On accept: validates the provided new model name and notification id, sends an accept request to the server,
 * adds the accepted model to appState.projectModels[currentProject] with `'owner'` access if saving a copy or `'read'` otherwise,
 * refreshes the rendered model list, and closes the modal.
 * On reject: sends a reject request to the server and closes the modal.
 *
 * @param {Object} appState - Application state containing `currentProject` and `projectModels`; this function will read and update those fields.
 */
function setupAcceptModel(appState) {
  const modal = $('#acceptModelModal');
  const fromUserInput = $('#acceptFromUser');
  const modelNameInput = $('#acceptModelName');
  const projectNameHidden = $('#acceptProjectName');
  const notificationIdHidden = $('#acceptNotificationId');
  const currentProjectInput = $('#acceptCurrentProject');
  const newModelNameInput = $('#acceptNewModelName');
  const saveCopyCheckbox = $('#acceptSaveCopy');
  const submitBtn = $('#submitAcceptModelBtn');
  const rejectBtn = $('#submitRejectModelBtn');
  if (!modal || !submitBtn || !rejectBtn) return;

  on(modal, 'show.bs.modal', () => {
    // Current project from appState
    currentProjectInput.value = appState.currentProject || '';
    if (!appState.currentProject) {
      toastError('No current project selected for accepting the model.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
    // Default new model name to the incoming model name (editable)
    newModelNameInput.value = modelNameInput.value || '';
    submitBtn.disabled = false;
    rejectBtn.disabled = false;
  });

  on(modal, 'hidden.bs.modal', () => {
    fromUserInput.value = '';
    modelNameInput.value = '';
    projectNameHidden.value = '';
    notificationIdHidden.value = '';
    currentProjectInput.value = '';
    newModelNameInput.value = '';
    saveCopyCheckbox.checked = false;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Accept';
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Reject';
  });

  // ── Accept ──────────────────────────────────────────────────────────────
  on(submitBtn, 'click', async () => {
    const newModelName = newModelNameInput.value.trim();
    if (!newModelName) {
      toastError('New model name is required.');
      return;
    }

    // Duplicate check in current project
    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    if (currentModels.includes(newModelName)) {
      toastError('A model with this name already exists in the current project.');
      return;
    }

    const notificationId = notificationIdHidden.value;
    if (!notificationId) {
      toastError('Notification ID is missing.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Accepting…';
    rejectBtn.disabled = true;

    try {
      await api.post('/models/accept', {
        notification_id: notificationId,
        accept: true,
        model_name: newModelName,
        project_name: appState.currentProject,
        create_new_copy: saveCopyCheckbox.checked,
      });
      toastSuccess('Model accepted successfully!');

      if (!appState.projectModels[appState.currentProject]) {
        appState.projectModels[appState.currentProject] = {};
      }
      if (saveCopyCheckbox.checked) {
        appState.projectModels[appState.currentProject][newModelName] = 'owner';
      } else {
        appState.projectModels[appState.currentProject][newModelName] = 'read';
      }
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Accept';
      rejectBtn.disabled = false;
      rejectBtn.textContent = 'Reject';
    }
  });

  // ── Reject ─────────────────────────────────────────────────────────────
  if (rejectBtn) {
    on(rejectBtn, 'click', async () => {
      const notificationId = notificationIdHidden.value;
      if (!notificationId) return;
      rejectBtn.disabled = true;
      submitBtn.disabled = true;
      rejectBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Rejecting…';
      try {
        await api.post('/models/accept', {
          notification_id: notificationId,
          accept: false,
        });
        toastSuccess('Model rejected.');
        window.bootstrap.Modal.getInstance(modal)?.hide();
      } catch {
        // api.js already displayed the error toast
      } finally {
        rejectBtn.disabled = false;
        rejectBtn.textContent = 'Reject';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Accept';
      }
    });
  }
}

function setupVacuumDatabaseModal(appState) {
  const modal = $('#vacuumDatabaseModal');
  const currentProjectInput = $('#vacuumDatabaseProjectName');
  const currentModelInput = $('#vacuumDatabaseModelName');
  const submitBtn = $('#submitVacuumDatabaseBtn');

  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for vacuuming.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Vacuum';
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for vacuuming.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Vacuuming…';

    try {
      await api.post('/models/vacuum', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Database vacuumed successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Vacuum';
    }
  });
}

/**
 * Initialize and wire the "Download Excel" modal UI for downloading selected table groups as an Excel file.
 *
 * Sets up modal show/hide behavior, renders selectable table-group rows from `appState.tableGroups`,
 * manages select-all and submit button state, and performs the download request which triggers a file save.
 *
 * @param {Object} appState - Application state object; this function reads `appState.tableGroups`, `appState.currentProject`, and `appState.selected_model`.
 */
function setupDownloadExcelModel(appState) {
  const modal = $('#downloadExcelModal');
  const currentProjectInput = $('#downloadExcelModalProjectName');
  const currentModelInput = $('#downloadExcelModalModelName');
  const tableListBody = $('#tableListForExcel');
  const selectAllCheckbox = $('#selectAllTables');
  const submitBtn = $('#submitDownloadExcelBtn');
  if (!modal || !submitBtn) return;

  function updateSubmitState() {
    if (!tableListBody) return;
    const checkedCount = tableListBody.querySelectorAll('.table-group-cb:checked').length;
    submitBtn.disabled = checkedCount === 0;
  }

  function renderTableGroupList() {
    if (!tableListBody) return;
    tableListBody.innerHTML = '';

    const groupNames = Object.keys(appState.tableGroups || {});

    if (!groupNames.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 2;
      emptyCell.className = 'text-center text-muted fst-italic';
      emptyCell.textContent = 'No table groups available.';
      emptyRow.appendChild(emptyCell);
      tableListBody.appendChild(emptyRow);
      updateSubmitState();
      return;
    }

    groupNames.forEach((groupName) => {
      const tr = document.createElement('tr');

      const checkboxTd = document.createElement('td');
      checkboxTd.className = 'text-center';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input table-group-cb';
      checkbox.value = groupName;
      checkbox.dataset.groupName = groupName;
      checkboxTd.appendChild(checkbox);

      const nameTd = document.createElement('td');
      nameTd.className = 'text-left';
      nameTd.textContent = groupName;

      tr.appendChild(checkboxTd);
      tr.appendChild(nameTd);
      tableListBody.appendChild(tr);
    });

    updateSubmitState();
  }

  if (selectAllCheckbox && tableListBody) {
    on(selectAllCheckbox, 'change', () => {
      tableListBody
        .querySelectorAll('.table-group-cb')
        .forEach((cb) => (cb.checked = selectAllCheckbox.checked));
      updateSubmitState();
    });
  }

  if (tableListBody) {
    on(tableListBody, 'change', (event) => {
      if (!event.target.classList.contains('table-group-cb')) return;

      if (selectAllCheckbox) {
        const checkboxes = Array.from(tableListBody.querySelectorAll('.table-group-cb'));
        selectAllCheckbox.checked = checkboxes.length > 0 && checkboxes.every((cb) => cb.checked);
      }

      updateSubmitState();
    });
  }

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for Excel download.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    renderTableGroupList();
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for Excel download.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Downloading…';

    try {
      const group_names = Array.from(tableListBody.querySelectorAll('.table-group-cb:checked')).map(
        (cb) => cb.dataset.groupName
      );
      if (!group_names.length) {
        toastError('Select at least one table group to download.');
        return;
      }
      const table_names = [];
      (group_names || []).forEach((group) => {
        const tables = appState.tableGroups?.[group] || [];
        tables.forEach(([tableKey]) => table_names.push(tableKey));
      });
      const { blob: excelBlob, fileName } = await api.postDownload('/tables/download-excel', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        table_names,
      });
      const downloadUrl = window.URL.createObjectURL(excelBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName || `${appState.selected_model}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toastSuccess('Excel download started.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Download';
    }
  });
}

/**
 * Wire the two-step Upload Excel flow.
 *
 * Step 1 (#uploadExcelModal): The user selects an .xlsx/.xls file. On submit the file is read
 *   with SheetJS to extract sheet names, which are POSTed to `/models/check-excel-sheets` to
 *   classify each sheet as one of: `not_existing`, `input_table`, `view`, or `output_table`.
 * Step 2 (#uploadExcelActionsModal): The user is shown a table of sheet names together with
 *   their detected type and a per-sheet action select populated based on the type. On submit
 *   the file is uploaded to `/models/upload-excel` together with the chosen per-sheet actions.
 *
 * @param {Object} appState - Application state providing `currentProject` and `selected_model`.
 */
function setupUploadExcel(appState) {
  const modal = $('#uploadExcelModal');
  const currentProjectInput = $('#uploadExcelProjectName');
  const currentModelInput = $('#uploadExcelModelName');
  const fileInput = $('#uploadExcelFile');
  const submitBtn = $('#submitUploadExcelBtn');

  const actionsModal = $('#uploadExcelActionsModal');
  const actionsTableBody = $('#uploadExcelActionsTableBody');
  const actionsSubmitBtn = $('#submitUploadExcelActionsBtn');

  const actionsView = $('#uploadExcelActionsView');
  const resultsView = $('#uploadExcelResultsView');
  const resultsTableBody = $('#uploadExcelResultsTableBody');
  const actionsFooter = $('#uploadExcelActionsFooter');
  const resultsFooter = $('#uploadExcelResultsFooter');
  const actionsModalTitle = $('#uploadExcelActionsModalTitle');

  if (!modal || !submitBtn || !fileInput) return;
  if (!actionsModal || !actionsTableBody || !actionsSubmitBtn) return;
  if (!actionsView || !resultsView || !resultsTableBody) return;
  if (!actionsFooter || !resultsFooter) return;

  const ACTIONS_TITLE = 'Upload Excel - Select Actions';
  const RESULTS_TITLE = 'Upload Excel - Results';

  const allowedExtensions = ['.xlsx', '.xls'];

  // Available actions keyed by their backend value.
  const ACTION_LABELS = {
    upload: 'Delete data and upload',
    delete: 'Delete data',
    create: 'Create table and Upload',
    ignore: 'Ignore',
  };

  // Per-type configuration of which actions are shown, the default selection,
  // and whether the select should be disabled.
  const TYPE_CONFIG = {
    not_existing: { options: ['create', 'ignore'], default: 'ignore', disabled: false },
    input_table: { options: ['ignore', 'upload', 'delete'], default: 'upload', disabled: false },
    view: { options: ['ignore'], default: 'ignore', disabled: true },
    output_table: { options: ['ignore', 'upload', 'delete'], default: 'ignore', disabled: false },
    unknown: { options: ['ignore'], default: 'ignore', disabled: true },
  };

  // Normalize a raw type string (from the server or user) into one of the
  // canonical keys in TYPE_CONFIG. Accepts variations in case, spacing,
  /**
   * Normalize a raw sheet type value into a canonical sheet type key used by the upload/download flows.
   *
   * Uses an exact match against TYPE_CONFIG keys first, then applies heuristic matching (checks for substrings
   * like "view", "output", "input", or variants indicating non-existence). Empty, null, or missing-like values
   * map to `not_existing`; unrecognized values map to `unknown`.
   *
   * @param {*} rawType - The raw type value (string, null, undefined, or other) obtained from the client/server.
   * @returns {'input_table'|'output_table'|'view'|'not_existing'|'unknown'} A canonical sheet type key.
   **/
  function normalizeSheetType(rawType) {
    if (rawType === null || rawType === undefined) return 'not_existing';
    const normalized = String(rawType)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (!normalized) return 'not_existing';

    // Exact canonical match first.
    if (Object.prototype.hasOwnProperty.call(TYPE_CONFIG, normalized)) {
      return normalized;
    }

    if (normalized.includes('view')) return 'view';
    if (normalized.includes('output')) return 'output_table';
    if (normalized.includes('input')) return 'input_table';
    // Bare 'table' is treated as an input table.
    if (normalized === 'table') return 'input_table';
    if (
      normalized.includes('not_exist') ||
      normalized.includes('non_exist') ||
      normalized.includes('missing') ||
      normalized.includes('none')
    ) {
      return 'not_existing';
    }
    return 'unknown'; // Default to unknown for unknown types, as it's safer to require explicit input tables and views.
  }

  // Session state shared between the two modals.
  let pendingFile = null;
  let pendingSheetNames = [];

  /**
   * Restore the submit button to its default enabled state and label it "Next".
   */
  function resetSubmitBtn() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Next';
  }

  /**
   * Restore the actions submit button to its default enabled state and label.
   *
   * Re-enables the button and sets its text to "Upload".
   */
  function resetActionsSubmitBtn() {
    actionsSubmitBtn.disabled = false;
    actionsSubmitBtn.textContent = 'Upload';
  }

  /**
   * Show the actions view in the upload-excel modal and hide the results view.
   *
   * Updates visibility and layout classes for the actions/results panes and their footers,
   * and sets the modal title to ACTIONS_TITLE when present.
   */
  function showActionsView() {
    actionsView.classList.remove('d-none');
    resultsView.classList.add('d-none');
    actionsFooter.classList.remove('d-none');
    actionsFooter.classList.add('d-flex');
    resultsFooter.classList.add('d-none');
    if (actionsModalTitle) actionsModalTitle.textContent = ACTIONS_TITLE;
  }

  /**
   * Switches the upload-excel modal from the actions view to the results view.
   *
   * Hides the actions view and its footer, shows the results view and its footer,
   * and updates the modal title to `RESULTS_TITLE` when a title element exists.
   */
  function showResultsView() {
    actionsView.classList.add('d-none');
    resultsView.classList.remove('d-none');
    actionsFooter.classList.add('d-none');
    actionsFooter.classList.remove('d-flex');
    resultsFooter.classList.remove('d-none');
    if (actionsModalTitle) actionsModalTitle.textContent = RESULTS_TITLE;
  }

  // Build the post-upload results table.
  //
  // `result` is the response object returned by `/tables/upload-excel`, keyed
  // by table/sheet name. Each entry has either:
  //   - { status: 'failed', reason: <string> }
  //   - { status: 'success', rows_imported: <number> }   (create/upload)
  //   - { status: 'success', rows_deleted: <number> }    (delete)
  // Sheets that are not present in `result` are only considered ignored when
  // their selected action was `ignore`; otherwise they are surfaced as failed.
  //
  /**
   * Render per-sheet upload results into the results table, grouping rows as failed, success, then ignored.
   *
   * Parses the server `result` for each name in `sheetNames` and appends rows to the global `resultsTableBody`.
   * - A sheet is treated as "Ignored" when `sheetActions[sheetName] === 'ignore'` and there is no server entry.
   * - A missing or unknown-status entry is surfaced as "Failed" (with the server-provided `reason` if present).
   * - A "Success" entry may display `rows_imported` or `rows_deleted` when provided.
   *
   * This function mutates the DOM by clearing and populating `resultsTableBody`.
   *
   * @param {string[]} sheetNames - Ordered list of sheet names to display in the results table.
   * @param {Object<string, Object>} result - Mapping of sheet name → server response object. Each response may include `status` (`"success"`/`"failed"`), `reason`, `rows_imported`, and `rows_deleted`.
   * @param {Object<string, string>} [sheetActions={}] - Mapping of sheet name → selected action (e.g., `'ignore'`); used to classify sheets with no server response as ignored.
   */
  function buildResultsTable(sheetNames, result, sheetActions = {}) {
    resultsTableBody.innerHTML = '';

    const safeResult = result && typeof result === 'object' ? result : {};
    const safeSheetActions = sheetActions && typeof sheetActions === 'object' ? sheetActions : {};

    const failedRows = [];
    const successRows = [];
    const ignoredRows = [];

    sheetNames.forEach((sheetName) => {
      const entry = safeResult[sheetName];
      if (!entry || typeof entry !== 'object') {
        if (safeSheetActions[sheetName] === 'ignore') {
          ignoredRows.push({ sheetName });
        } else {
          failedRows.push({
            sheetName,
            reason: 'No response received from the server for this sheet.',
          });
        }
        return;
      }
      const status = String(entry.status || '').toLowerCase();
      if (status === 'failed') {
        failedRows.push({ sheetName, reason: entry.reason });
      } else if (status === 'success') {
        successRows.push({
          sheetName,
          rowsImported: entry.rows_imported,
          rowsDeleted: entry.rows_deleted,
        });
      } else {
        // Unknown status — surface it as failed so the user can see it.
        failedRows.push({
          sheetName,
          reason: entry.reason || `Unknown status: ${entry.status ?? '(none)'}`,
        });
      }
    });

    const appendRow = (sheetName, statusText, statusClass, details) => {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = sheetName;
      tr.appendChild(tdName);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${statusClass}`;
      badge.textContent = statusText;
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      const tdDetails = document.createElement('td');
      tdDetails.textContent = details || '';
      tr.appendChild(tdDetails);

      resultsTableBody.appendChild(tr);
    };

    failedRows.forEach((row) => {
      appendRow(row.sheetName, 'Failed', 'bg-danger', row.reason || 'Unknown error');
    });

    successRows.forEach((row) => {
      let details = '';
      if (typeof row.rowsImported === 'number') {
        details = `${row.rowsImported} row(s) imported`;
      } else if (typeof row.rowsDeleted === 'number') {
        details = `${row.rowsDeleted} row(s) deleted`;
      }
      appendRow(row.sheetName, 'Success', 'bg-success', details);
    });

    ignoredRows.forEach((row) => {
      appendRow(row.sheetName, 'Ignored', 'bg-secondary', '');
    });
  }

  /**
   * Populate the actions table with one row per sheet, each containing the sheet name and a select control to choose the upload action.
   *
   * Rows are ordered so sheets whose configured default action is "Delete data and upload" ("upload") appear before other sheets.
   *
   * @param {string[]} sheetNames - Array of sheet names to render (preserves order within each sorted group).
   * @param {Object.<string,string>} sheetTypes - Mapping from sheet name to detected sheet type used to determine available actions.
   */
  function buildActionsTable(sheetNames, sheetTypes) {
    actionsTableBody.innerHTML = '';

    // Sort rows so sheets whose default action is "Delete data and upload"
    // appear first, preserving original order within each group.
    const sortedSheetNames = [...sheetNames].sort((a, b) => {
      const aDefault = (TYPE_CONFIG[normalizeSheetType(sheetTypes[a])] || TYPE_CONFIG.not_existing)
        .default;
      const bDefault = (TYPE_CONFIG[normalizeSheetType(sheetTypes[b])] || TYPE_CONFIG.not_existing)
        .default;
      const aPurge = aDefault === 'upload' ? 0 : 1;
      const bPurge = bDefault === 'upload' ? 0 : 1;
      return aPurge - bPurge;
    });

    sortedSheetNames.forEach((sheetName) => {
      const type = normalizeSheetType(sheetTypes[sheetName]);
      const config = TYPE_CONFIG[type] || TYPE_CONFIG.not_existing;

      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = sheetName;
      tr.appendChild(tdName);

      const tdAction = document.createElement('td');
      const select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      select.dataset.sheet = sheetName;
      select.dataset.type = type;

      config.options.forEach((optKey) => {
        const opt = document.createElement('option');
        opt.value = optKey;
        opt.textContent = ACTION_LABELS[optKey];
        if (optKey === config.default) opt.selected = true;
        select.appendChild(opt);
      });

      if (config.disabled) select.disabled = true;
      tdAction.appendChild(select);
      tr.appendChild(tdAction);

      actionsTableBody.appendChild(tr);
    });
  }

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    fileInput.value = '';
    fileInput.accept = allowedExtensions.join(',');

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    fileInput.value = '';
    resetSubmitBtn();
  });

  on(actionsModal, 'hidden.bs.modal', () => {
    actionsTableBody.innerHTML = '';
    resultsTableBody.innerHTML = '';
    resetActionsSubmitBtn();
    showActionsView();
    pendingFile = null;
    pendingSheetNames = [];
  });

  // Step 1: validate file, read sheet names with SheetJS, ask the server for
  // their types, then switch to the actions modal.
  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      return;
    }

    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) {
      toastError('Please choose a model excel file.');
      return;
    }

    const lowerName = selectedFile.name.toLowerCase();
    const isAllowedFile = allowedExtensions.some((extension) => lowerName.endsWith(extension));
    if (!isAllowedFile) {
      toastError('Only .xlsx and .xls files are supported.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Checking…';

    let sheetNames;
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', bookSheets: true });
      sheetNames = workbook.SheetNames ?? [];
    } catch {
      toastError('Unable to read the selected Excel file. Please verify the file and try again.');
      resetSubmitBtn();
      return;
    }

    if (!sheetNames.length) {
      toastError('The selected Excel file does not contain any sheets.');
      resetSubmitBtn();
      return;
    }

    let sheetTypes;
    try {
      const response = await api.post('/tables/check-excel-sheets', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        sheet_names: sheetNames,
      });
      sheetTypes = response?.sheet_types || {};
    } catch {
      // api.js already displayed the error toast
      resetSubmitBtn();
      return;
    }

    pendingFile = selectedFile;
    pendingSheetNames = [...sheetNames];
    showActionsView();
    buildActionsTable(sheetNames, sheetTypes);

    window.bootstrap.Modal.getInstance(modal)?.hide();
    window.bootstrap.Modal.getOrCreateInstance(actionsModal).show();
  });

  // Step 2: collect chosen actions and perform the actual upload.
  on(actionsSubmitBtn, 'click', async () => {
    if (!pendingFile) {
      toastError('No file selected. Please choose a file to upload.');
      return;
    }
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      return;
    }

    const selects = actionsTableBody.querySelectorAll('select[data-sheet]');
    const sheetActions = {};
    selects.forEach((select) => {
      sheetActions[select.dataset.sheet] = select.value;
    });

    const selectedActions = Object.entries(sheetActions).filter(
      ([, action]) => action !== 'ignore'
    );
    if (!selectedActions.length) {
      toastError('No sheets selected for upload. Please choose at least one sheet to upload.');
      return;
    }
    const shouldRefreshTables = selectedActions.some(([, action]) => action === 'create');

    actionsSubmitBtn.disabled = true;
    actionsSubmitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Uploading…';

    try {
      const formData = new FormData();
      formData.append('project_name', appState.currentProject);
      formData.append('model_name', appState.selected_model);
      formData.append('upload_file', pendingFile);
      formData.append('sheet_actions', JSON.stringify(Object.fromEntries(selectedActions)));
      const result = await api.postFormData('/tables/upload-excel', formData);
      const response = result?.response || {};
      // Swap the modal contents to a results view so the user can see
      // the per-sheet status before dismissing.
      buildResultsTable(pendingSheetNames, response, sheetActions);
      if (shouldRefreshTables) {
        await updateTableAccordion(appState);
        updateModelTasks(appState); // Refresh tasks for the newly uploaded sheets
      }
      showResultsView();
    } catch {
      // api.js already displayed the error toast
    } finally {
      resetActionsSubmitBtn();
    }
  });
}

/**
 * Populate the #tablesAccordion element with the table groups for the currently selected project/model.
 *
 * Clears any existing accordion content, requests table groups from the backend for
 * the current project and selected model, and builds a Bootstrap accordion where each
 * group is a collapsible section listing links to individual tables.
 *
 * If the accordion element is missing the function returns without action. On API error
 * the accordion is left empty and the function suppresses the error (error reporting is
 * handled by the API helper).
 *
 * @param {Object} appState - Application state object.
 * @param {string} appState.currentProject - Name of the current project to request table groups for.
 * @param {string} appState.selected_model - Name of the currently selected model to request table groups for.
 */
async function updateTableAccordion(appState) {
  const requestId = ++latestTableAccordionRequestId;
  const accordion = $('#tablesAccordion');
  if (!accordion) return;

  accordion.innerHTML = '';
  appState.tableGroups = {};

  if (!appState.currentProject || !appState.selected_model) {
    const placeholder = document.createElement('div');
    placeholder.className = 'text-muted fst-italic';
    placeholder.textContent = 'Select a model to view its tables.';
    accordion.appendChild(placeholder);
    return;
  }

  try {
    const data = await api.post('/models/table-groups', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
    });
    if (requestId !== latestTableAccordionRequestId) return;

    const tableGroups = data.table_groups || {};
    appState.tableGroups = tableGroups;

    Object.entries(tableGroups).forEach(([groupName, tables], index) => {
      const itemId = `tablesAccordionItem-${index}`;
      const collapseId = `tablesCollapse-${index}`;

      const item = document.createElement('div');
      item.className = 'accordion-item';

      const header = document.createElement('h2');
      header.className = 'accordion-header';
      header.id = itemId;

      const button = document.createElement('button');
      button.className = 'accordion-button collapsed';
      button.type = 'button';
      button.dataset.bsToggle = 'collapse';
      button.dataset.bsTarget = `#${collapseId}`;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', collapseId);
      button.textContent = groupName;
      header.appendChild(button);

      const collapse = document.createElement('div');
      collapse.id = collapseId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', itemId);
      collapse.dataset.bsParent = '#tablesAccordion';

      const body = document.createElement('div');
      body.className = 'accordion-body';

      const table = document.createElement('table');
      table.className = 'table table-sm table-hover table-bordered align-middle mb-0';
      const tbody = document.createElement('tbody');

      (tables || []).forEach(([tableKey, displayName]) => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        const td = document.createElement('td');
        const link = document.createElement('a');
        link.href =
          '/table.html?' +
          new URLSearchParams({
            table: tableKey,
            project: appState.currentProject,
            model: appState.selected_model,
            displayName: displayName,
          });
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = displayName;

        tr.addEventListener('click', (event) => {
          if (event.target.closest('a')) return;
          link.click();
        });

        td.appendChild(link);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      body.appendChild(table);
      collapse.appendChild(body);
      item.appendChild(header);
      item.appendChild(collapse);
      accordion.appendChild(item);
    });
  } catch {
    appState.tableGroups = {};
    // api.js already displayed the error toast
  }
}

async function initModels(appState) {
  await fetchModels(appState);
  renderCurrentProjectModels(appState);
  setupAddNewModel(appState);
  setupSaveAsModel(appState);
  setupAddExistingModel(appState);
  setupRenameModel(appState);
  setupDeleteModel(appState);
  setupBackupModel(appState);
  setupRestoreModel(appState);
  setupDownloadModel(appState);
  setupUploadModel(appState);
  setupShareModel(appState);
  setupManageAccessModel(appState);
  setupMoveModel(appState);
  setupAcceptModel(appState);
  setupDownloadExcelModel(appState);
  setupUploadExcel(appState);
  setupVacuumDatabaseModal(appState);
}

export { initModels, renderCurrentProjectModels };
