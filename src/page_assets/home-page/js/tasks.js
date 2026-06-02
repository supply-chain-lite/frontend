import { $, on } from '@/common/js/dom';
import api from '@/common/js/api';
import { bsToastSuccess, bsToastError } from '@/common/js/bsToast';
import { initNotifications } from './notifications';

const RUNNING_TASK_POLL_INTERVAL_MS = 30000;

let latestTaskListRequestId = 0;
let runningTaskPollingTimer = null;
// Map of task_id -> { task_name, model_name, project_name } for tracking running tasks
const trackedRunningTasks = new Map();

async function updateModelTasks(appState) {
  const requestId = ++latestTaskListRequestId;
  const selectedModelTasks = $('#selectedModelTasks');
  if (!selectedModelTasks) return;
  const runTasksList = $('#runTasksList');
  if (runTasksList) runTasksList.innerHTML = '';
  appState.task_list = [];

  if (!appState.currentProject || !appState.selected_model) {
    selectedModelTasks.style.display = 'none';
    return;
  }

  try {
    const data = await api.post('/tasks/list', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
    });
    if (requestId !== latestTaskListRequestId) return;

    const taskList = data.tasks || [];
    appState.task_list = taskList;
    if (taskList.length === 0) {
      selectedModelTasks.style.display = 'none';
      return;
    }
    displayModelTasks(appState);
  } catch {
    appState.task_list = [];
    selectedModelTasks.style.display = 'none';
  }
}

/* ── Display task names in the Run dropdown ─────────────────────────────── */

function displayModelTasks(appState) {
  const container = $('#selectedModelTasks');
  const taskListEl = $('#runTasksList');
  if (!container || !taskListEl) return;

  container.style.display = '';
  taskListEl.innerHTML = '';

  appState.task_list.forEach((task) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'dropdown-item';
    a.href = '#';
    a.textContent = task.task_name;
    on(a, 'click', (e) => {
      e.preventDefault();
      openTaskModal(appState, task);
    });
    li.appendChild(a);
    taskListEl.appendChild(li);
  });
}

/* ── Open the task parameter modal ──────────────────────────────────────── */

function openTaskModal(appState, task) {
  const modalEl = $('#runTaskModal');
  const modalBody = $('#runTaskModalBody');
  const modalLabel = $('#runTaskModalLabel');
  const submitBtn = $('#submitRunTaskBtn');
  if (!modalEl || !modalBody || !modalLabel || !submitBtn || !submitBtn.parentNode) return;

  modalLabel.textContent = task.task_name;
  modalBody.innerHTML = '';

  // Disabled info fields — not submitted
  modalBody.appendChild(buildDisabledField('Current Project', appState.currentProject));
  modalBody.appendChild(buildDisabledField('Model Name', appState.selected_model));

  if (!task.task_params || task.task_params.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-muted mb-0';
    p.textContent = 'No parameters required for this task.';
    modalBody.appendChild(p);
  } else {
    task.task_params.forEach((param) => {
      modalBody.appendChild(buildParameterField(param));
    });
  }

  // Replace button to remove any previous click listeners
  const newBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newBtn, submitBtn);
  on(newBtn, 'click', () => submitTask(appState, task, newBtn));

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();
}

/* ── Build a disabled display-only field (not collected by collectTaskParams) ─ */

function buildDisabledField(labelText, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mb-3 row align-items-center';

  const labelCol = document.createElement('div');
  labelCol.className = 'col-4';

  const inputCol = document.createElement('div');
  inputCol.className = 'col-8';

  const label = document.createElement('label');
  label.className = 'col-form-label';
  label.textContent = labelText;
  labelCol.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.value = value || '';
  input.disabled = true;
  // No data-param-name or data-param-type attributes → skipped by collectTaskParams

  inputCol.appendChild(input);
  wrapper.appendChild(labelCol);
  wrapper.appendChild(inputCol);
  return wrapper;
}

/* ── Build a form field for a single task parameter ─────────────────────── */

function buildParameterField(param) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mb-3 row align-items-center';

  const labelCol = document.createElement('div');
  labelCol.className = 'col-4';

  const inputCol = document.createElement('div');
  inputCol.className = 'col-8';

  const label = document.createElement('label');
  label.className = 'col-form-label';
  label.textContent = param.ParameterName;
  labelCol.appendChild(label);

  switch (param.ParameterType) {
    case 'SELECT': {
      const select = document.createElement('select');
      select.className = 'form-select';
      select.dataset.paramName = param.ParameterName;
      select.dataset.paramType = param.ParameterType;

      (param.ParameterValues || []).forEach((val) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        if (val === param.ParameterValue) opt.selected = true;
        select.appendChild(opt);
      });

      inputCol.appendChild(select);
      break;
    }

    case 'CHECKBOX': {
      const div = document.createElement('div');
      div.className = 'form-check mt-1';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'form-check-input';
      input.id = `param_${param.ParameterName.replace(/\s+/g, '_')}`;
      input.checked = !!param.ParameterValue;
      input.dataset.paramName = param.ParameterName;
      input.dataset.paramType = param.ParameterType;

      div.appendChild(input);
      inputCol.appendChild(div);
      label.htmlFor = input.id;
      break;
    }

    case 'TEXT': {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.value = param.ParameterValue || '';
      input.dataset.paramName = param.ParameterName;
      input.dataset.paramType = param.ParameterType;

      inputCol.appendChild(input);
      break;
    }

    case 'NUMBER': {
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-control';
      input.value = param.ParameterValue !== null ? param.ParameterValue : '';
      input.dataset.paramName = param.ParameterName;
      input.dataset.paramType = param.ParameterType;

      inputCol.appendChild(input);
      break;
    }

    case 'FIXED': {
      wrapper.style.display = 'none';
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.value = param.ParameterValue !== null ? String(param.ParameterValue) : '';
      hidden.dataset.paramName = param.ParameterName;
      hidden.dataset.paramType = 'FIXED';
      inputCol.appendChild(hidden);
      break;
    }

    case 'MULTI_SELECT': {
      // top-align label when there are multiple checkboxes
      wrapper.classList.remove('align-items-center');
      wrapper.classList.add('align-items-start');

      const selected = Array.isArray(param.ParameterValue) ? param.ParameterValue : [];

      (param.ParameterValues || []).forEach((val) => {
        const checkDiv = document.createElement('div');
        checkDiv.className = 'form-check';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input';
        input.value = val;
        input.checked = selected.includes(val);
        input.dataset.paramName = param.ParameterName;
        input.dataset.paramType = 'MULTI_SELECT';
        input.id = `param_${param.ParameterName.replace(/\s+/g, '_')}_${val.replace(/\s+/g, '_')}`;

        const checkLabel = document.createElement('label');
        checkLabel.className = 'form-check-label';
        checkLabel.htmlFor = input.id;
        checkLabel.textContent = val;

        checkDiv.appendChild(input);
        checkDiv.appendChild(checkLabel);
        inputCol.appendChild(checkDiv);
      });
      break;
    }

    default: {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.value = param.ParameterValue !== null ? String(param.ParameterValue) : '';
      input.dataset.paramName = param.ParameterName;
      input.dataset.paramType = param.ParameterType || 'TEXT';

      inputCol.appendChild(input);
      break;
    }
  }

  wrapper.appendChild(labelCol);
  wrapper.appendChild(inputCol);
  return wrapper;
}

/* ── Collect current parameter values from the modal form ───────────────── */

function collectTaskParams() {
  const params = [];
  const modalBody = $('#runTaskModalBody');
  if (!modalBody) return params;

  const fieldGroups = modalBody.querySelectorAll('.mb-3');

  fieldGroups.forEach((group) => {
    // MULTI_SELECT — multiple checkboxes sharing a param name
    const multiCheckboxes = group.querySelectorAll('input[data-param-type="MULTI_SELECT"]');
    if (multiCheckboxes.length > 0) {
      const name = multiCheckboxes[0].dataset.paramName;
      const values = [];
      multiCheckboxes.forEach((cb) => {
        if (cb.checked) values.push(cb.value);
      });
      params.push({ ParameterName: name, ParameterValue: values });
      return;
    }

    // CHECKBOX
    const checkbox = group.querySelector('input[data-param-type="CHECKBOX"]');
    if (checkbox) {
      params.push({ ParameterName: checkbox.dataset.paramName, ParameterValue: checkbox.checked });
      return;
    }

    // SELECT
    const select = group.querySelector('select[data-param-name]');
    if (select) {
      params.push({ ParameterName: select.dataset.paramName, ParameterValue: select.value });
      return;
    }

    // FIXED — hidden input with preset value
    const fixedInput = group.querySelector('input[data-param-type="FIXED"]');
    if (fixedInput) {
      params.push({
        ParameterName: fixedInput.dataset.paramName,
        ParameterValue: fixedInput.value,
      });
      return;
    }

    // NUMBER
    const numberInput = group.querySelector('input[data-param-type="NUMBER"]');
    if (numberInput) {
      params.push({
        ParameterName: numberInput.dataset.paramName,
        ParameterValue: numberInput.value !== '' ? Number(numberInput.value) : null,
      });
      return;
    }

    // TEXT (or unknown fallback)
    const textInput = group.querySelector('input[data-param-name]');
    if (textInput) {
      params.push({ ParameterName: textInput.dataset.paramName, ParameterValue: textInput.value });
    }
  });

  return params;
}

/* ── Submit the task ────────────────────────────────────────────────────── */

async function submitTask(appState, task, submitBtn) {
  const taskParams = collectTaskParams();

  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting…';

  try {
    await api.post('/tasks/run', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
      task_id: task.task_id,
      task_params: taskParams,
    });

    updateRunningTaskUI(appState);

    const modalEl = $('#runTaskModal');
    window.bootstrap.Modal.getInstance(modalEl)?.hide();
    bsToastSuccess(`Task "${task.task_name}" submitted successfully.`);
  } catch {
    // api.post already shows error toast
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

async function updateRunningTaskUI(appState) {
  const container = $('#inProgressContainer');
  if (!container) return;

  // Clear any existing polling timer
  if (runningTaskPollingTimer) {
    window.clearTimeout(runningTaskPollingTimer);
    runningTaskPollingTimer = null;
  }

  try {
    const data = await api.post('/tasks/running');
    const runningTasks = data.running_tasks || [];

    // Build set of currently running task IDs
    const currentRunningIds = new Set(runningTasks.map((t) => t.task_id));

    // Check for tasks that were running but are no longer in the list
    for (const [taskId, taskInfo] of trackedRunningTasks) {
      if (!currentRunningIds.has(taskId)) {
        // Task is no longer running - fetch its status
        checkCompletedTaskStatus(taskId, taskInfo);
        trackedRunningTasks.delete(taskId);
      }
    }

    // Update tracked tasks with current running tasks
    runningTasks.forEach((task) => {
      if (!trackedRunningTasks.has(task.task_id)) {
        trackedRunningTasks.set(task.task_id, {
          task_name: task.task_name,
          model_name: task.model_name,
          project_name: task.project_name,
        });
      }
    });

    // Clear existing task cards
    container.innerHTML = '';

    if (runningTasks.length === 0) {
      // No running tasks - container stays empty (hidden)
      return;
    }

    // Create task cards for each running task
    runningTasks.forEach((task) => {
      const card = createRunningTaskCard(task);
      container.appendChild(card);
    });

    // Schedule next poll since there are running tasks
    runningTaskPollingTimer = window.setTimeout(() => {
      updateRunningTaskUI(appState);
    }, RUNNING_TASK_POLL_INTERVAL_MS);
  } catch {
    // On error, clear the container
    container.innerHTML = '';
  }
}

async function checkCompletedTaskStatus(taskId, taskInfo) {
  try {
    initNotifications(); // Refresh notifications to get any updates related to the completed task
    const data = await api.post('/tasks/status', {
      task_id: taskId,
    });

    const status = (data.message || '').toUpperCase();
    const taskName = taskInfo.task_name;

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      bsToastSuccess(
        `Task "${taskName}" for model "${taskInfo.model_name}" completed successfully.`,
        0
      );
    } else if (
      status === 'ERROR' ||
      status === 'ERRORED' ||
      status === 'FAILURE' ||
      status === 'FAILED'
    ) {
      bsToastError(`Task "${taskName}" for model "${taskInfo.model_name}" failed.`);
    } else if (status === 'CANCELLED' || status === 'REVOKED') {
      bsToastError(
        `Task "${taskName}" for model "${taskInfo.model_name}" was ${status.toLowerCase()}.`
      );
    }
  } catch {
    // Silently fail - task status check is best effort
  }
}

function createRunningTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card p-3 mb-3';

  const message = document.createElement('p');
  message.className = 'task-card-message mb-2';
  message.innerHTML = `Please wait while task: <span class="fw-bold">${escapeHtml(task.task_name)}</span> completes for model: <strong>${escapeHtml(task.model_name)}</strong>`;

  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'progress mb-2';

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated';
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-valuenow', '100');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');
  progressBar.textContent = 'Running';

  progressWrapper.appendChild(progressBar);

  const btnWrapper = document.createElement('div');
  btnWrapper.className = 'd-flex justify-content-end';

  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn btn-sm btn-outline-dark';
  detailsBtn.textContent = 'View Details';
  on(detailsBtn, 'click', () => {
    const params = new URLSearchParams({
      task_id: task.task_id,
      model_name: task.model_name,
      project_name: task.project_name,
    });
    window.open(`task-details.html?${params.toString()}`, '_blank');
  });

  btnWrapper.appendChild(detailsBtn);

  card.appendChild(message);
  card.appendChild(progressWrapper);
  card.appendChild(btnWrapper);

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export { updateModelTasks, updateRunningTaskUI };
