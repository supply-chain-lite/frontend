import api from '@/common/js/api';
import { $, on } from '@/common/js/dom';
import { bsToastSuccess, bsToastError } from '@/common/js/bsToast';
import cronstrue from 'cronstrue';
import { CronExpressionParser } from 'cron-parser';

const POLL_INTERVAL_MS = 15_000;

const STATUS_CONFIG = {
  PENDING: { bg: 'bg-secondary', label: 'Pending' },
  STARTED: { bg: 'bg-primary', label: 'Started' },
  SUCCESS: { bg: 'bg-success', label: 'Success' },
  FAILURE: { bg: 'bg-danger', label: 'Failure' },
  ERRORED: { bg: 'bg-danger', label: 'Errored' },
  CANCELLED: { bg: 'bg-warning text-dark', label: 'Cancelled' },
  REVOKED: { bg: 'bg-warning text-dark', label: 'Revoked' },
};

const ACTIVE_STATUSES = new Set(['PENDING', 'STARTED']);

let pollTimer = null;
let currentUser = null;
let currentTaskDetails = null;
let currentTaskStatus = '';
let currentTaskSchedule = null;
let canUpdateTaskSchedule = true;

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    model_name: params.get('model_name') || '',
    project_name: params.get('project_name') || '',
    task_id: params.get('task_id') || '',
  };
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function showView(id) {
  ['taskLoading', 'taskError', 'taskContent'].forEach((v) => {
    const el = $(`#${v}`);
    if (el) el.classList.toggle('d-none', v !== id);
  });
}

function isNonEmptyJson(value) {
  if (value === null || value === undefined || value === '') return false;
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (parsed === null || parsed === undefined) return false;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return false;
}

function toFormattedJson(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  return JSON.stringify(parsed, null, 2);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeIoCard(title, value) {
  return `<div class="card h-100">
    <div class="card-body d-flex flex-column">
      <h5 class="card-title">${title}</h5>
      <pre class="io-json-area mb-0">${escapeHtml(toFormattedJson(value))}</pre>
    </div>
  </div>`;
}

function updatePageScrollable() {
  const ioSection = $('#taskIOSection');
  const diffSection = $('#dbDiffSection');
  const ioVisible = ioSection && !ioSection.classList.contains('d-none');
  const diffVisible = diffSection && !diffSection.classList.contains('d-none');
  document.body.classList.toggle('page-scrollable', ioVisible || diffVisible);
}

function parseAndFilterDiff(message) {
  return (message || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^sqlite_sequence/i.test(line))
    .map((line) => {
      const match = line.match(
        /^(.+?):\s*(\d+)\s*changes?,\s*(\d+)\s*inserts?,\s*(\d+)\s*deletes?,\s*(\d+)\s*unchanged/i
      );
      if (!match) return null;
      return {
        table: match[1].trim(),
        changes: parseInt(match[2], 10),
        inserts: parseInt(match[3], 10),
        deletes: parseInt(match[4], 10),
      };
    })
    .filter((item) => item !== null)
    .filter(({ changes, inserts, deletes }) => changes > 0 || inserts > 0 || deletes > 0);
}

function renderDbDiffSection(lines) {
  const section = $('#dbDiffSection');
  if (!section) return;

  let bodyHtml;
  if (lines.length === 0) {
    bodyHtml = '<p class="text-muted fst-italic mb-0">No changes detected.</p>';
  } else {
    const items = lines
      .map(({ table, changes, inserts, deletes }) => {
        const badges = [];
        if (changes > 0) {
          badges.push(`<span class="badge bg-warning text-dark">${changes} changes</span>`);
        }
        if (inserts > 0) badges.push(`<span class="badge bg-success">${inserts} inserts</span>`);
        if (deletes > 0) badges.push(`<span class="badge bg-danger">${deletes} deletes</span>`);
        return `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span class="fw-semibold">${escapeHtml(table)}</span>
          <span class="d-flex gap-2">${badges.join('')}</span>
        </li>`;
      })
      .join('');
    bodyHtml = `<ul class="list-group list-group-flush">${items}</ul>`;
  }

  section.innerHTML = `<div class="card mb-3">
    <div class="card-body">
      <h5 class="card-title mb-3">
        <i class="fa-solid fa-code-compare me-2" aria-hidden="true"></i>Database Diff
      </h5>
      ${bodyHtml}
    </div>
  </div>`;

  section.classList.remove('d-none');
  updatePageScrollable();
}

function renderIOSection(data) {
  const section = $('#taskIOSection');
  if (!section) return;

  const hasInput = isNonEmptyJson(data.input);
  const hasOutput = isNonEmptyJson(data.output);

  if (!hasInput && !hasOutput) {
    section.classList.add('d-none');
    section.innerHTML = '';
    updatePageScrollable();
    return;
  }

  section.classList.remove('d-none');
  updatePageScrollable();

  if (hasInput && hasOutput) {
    section.innerHTML = `<div class="row g-3 mb-3">
      <div class="col-md-6">${makeIoCard('Input', data.input)}</div>
      <div class="col-md-6">${makeIoCard('Output', data.output)}</div>
    </div>`;
  } else {
    const title = hasInput ? 'Input' : 'Output';
    const value = hasInput ? data.input : data.output;
    section.innerHTML = `<div class="mb-3">${makeIoCard(title, value)}</div>`;
  }
}

function renderDetails(params, data) {
  currentTaskDetails = data;
  $('#detailModelName').textContent = params.model_name || '-';
  $('#detailProjectName').textContent = params.project_name || '-';
  $('#detailTaskName').textContent = data.task_display_name || '-';
  $('#detailSubmittedBy').textContent = data.submitted_by || '-';
  $('#detailStartTime').textContent = formatDateTime(data.start_time);

  const status = (data.status || '').toUpperCase();
  currentTaskStatus = status;
  const isActive = ACTIVE_STATUSES.has(status);

  const endTimeBlock = $('#endTimeBlock');
  if (isActive || !data.end_time) {
    endTimeBlock.classList.add('d-none');
  } else {
    endTimeBlock.classList.remove('d-none');
    $('#detailEndTime').textContent = formatDateTime(data.end_time);
  }

  const runTimeBlock = $('#runTimeBlock');
  if (status === 'SUCCESS' && data.start_time && data.end_time) {
    const startMs = new Date(data.start_time).getTime();
    const endMs = new Date(data.end_time).getTime();
    const minutes = (endMs - startMs) / 60_000;
    $('#detailRunTime').textContent = minutes < 0.1 ? '< 0.1 min' : `${minutes.toFixed(1)} min`;
    runTimeBlock.classList.remove('d-none');
  } else {
    runTimeBlock.classList.add('d-none');
  }

  const badge = $('#taskStatusBadge');
  const cfg = STATUS_CONFIG[status] || { bg: 'bg-secondary', label: status || 'Unknown' };
  badge.className = `badge fs-6 ${cfg.bg}`;
  badge.textContent = cfg.label;

  const actions = $('#taskActions');
  const runProgress = $('#taskRunningProgress');
  const isOwner = currentUser && data.submitted_by && currentUser === data.submitted_by;

  if (isActive) {
    actions.classList.remove('d-none');
    runProgress.classList.remove('d-none');
    $('#refreshBtn').classList.toggle('d-none', !isOwner);
    $('#cancelBtn').classList.toggle('d-none', !isOwner);
  } else {
    actions.classList.add('d-none');
    runProgress.classList.add('d-none');
  }

  $('#taskSuccessActions').classList.toggle('d-none', status !== 'SUCCESS');
  $('#scheduleTaskBtn')?.classList.add('d-none');

  renderIOSection(data);

  const logArea = $('#taskLog');
  const logEmpty = $('#taskLogEmpty');
  const logToolbar = $('#logToolbarBtns');
  if (data.log) {
    logArea.textContent = data.log;
    logArea.classList.remove('d-none');
    logArea.scrollTop = logArea.scrollHeight;
    logEmpty.classList.add('d-none');
    logToolbar.classList.remove('d-none');
  } else {
    logArea.classList.add('d-none');
    logEmpty.classList.remove('d-none');
    logToolbar.classList.add('d-none');
  }

  return status;
}

function getScheduleTaskCode() {
  return currentTaskDetails.task_code || '';
}

async function fetchTaskDetails(params) {
  return api.post('/tasks/details', {
    task_id: params.task_id,
    model_name: params.model_name,
    project_name: params.project_name,
  });
}

async function cancelTask(params) {
  return api.post('/tasks/cancel', {
    task_id: params.task_id,
    model_name: params.model_name,
    project_name: params.project_name,
  });
}

function stopPolling() {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePoll(params) {
  stopPolling();
  pollTimer = window.setTimeout(() => loadAndRender(params, true), POLL_INTERVAL_MS);
}

async function loadAndRender(params, isPolling = false) {
  try {
    const data = await fetchTaskDetails(params);
    const status = renderDetails(params, data);

    if (ACTIVE_STATUSES.has(status)) {
      schedulePoll(params);
    } else {
      stopPolling();
      if (status === 'SUCCESS') {
        await loadTaskSchedule(params);
      }
    }
  } catch (err) {
    if (!isPolling) {
      $('#taskErrorMessage').textContent = err.data?.detail || 'Unable to load task details.';
      showView('taskError');
    }
    if (isPolling) schedulePoll(params);
  }
}

function bindRefreshButton(params) {
  const refreshBtn = $('#refreshBtn');
  on(refreshBtn, 'click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Refreshing...';
    stopPolling();
    try {
      await loadAndRender(params);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML =
        '<i class="fa-solid fa-arrows-rotate me-1" aria-hidden="true"></i>Refresh';
    }
  });
}

function bindCancelButton(params) {
  const cancelBtn = $('#cancelBtn');
  on(cancelBtn, 'click', async () => {
    if (!window.confirm('Are you sure you want to cancel this task?')) return;

    cancelBtn.disabled = true;
    cancelBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Cancelling...';
    try {
      await cancelTask(params);
      bsToastSuccess('Task cancellation requested.');
      stopPolling();
      await loadAndRender(params);
    } catch {
      // api already shows error toast
    } finally {
      cancelBtn.disabled = false;
      cancelBtn.innerHTML = '<i class="fa-solid fa-ban me-1" aria-hidden="true"></i>Cancel Task';
    }
  });
}

function bindCompareDbButton(params) {
  const compareDbBtn = $('#compareDbBtn');
  on(compareDbBtn, 'click', async () => {
    compareDbBtn.disabled = true;
    compareDbBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Comparing...';
    try {
      const data = await api.post('/tasks/get-diff', {
        task_id: params.task_id,
        model_name: params.model_name,
        project_name: params.project_name,
      });
      renderDbDiffSection(parseAndFilterDiff(data.message));
    } catch {
      // api already shows error toast
    } finally {
      compareDbBtn.disabled = false;
      compareDbBtn.innerHTML =
        '<i class="fa-solid fa-code-compare me-1" aria-hidden="true"></i>Compare Database';
    }
  });
}

function bindRestoreDbButtons(params) {
  on($('#restoreDbBtn'), 'click', () => {
    $('#restoreDbModelName').textContent = params.model_name || '-';
    $('#restoreDbProjectName').textContent = params.project_name || '-';
    const modal = new window.bootstrap.Modal($('#restoreDbModal'));
    modal.show();
  });

  const restoreDbConfirmBtn = $('#restoreDbConfirmBtn');
  on(restoreDbConfirmBtn, 'click', async () => {
    restoreDbConfirmBtn.disabled = true;
    restoreDbConfirmBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Restoring...';
    try {
      await api.post('/tasks/restore-db', {
        task_id: params.task_id,
        model_name: params.model_name,
        project_name: params.project_name,
      });
      window.bootstrap.Modal.getInstance($('#restoreDbModal'))?.hide();
      bsToastSuccess('Database restored successfully.');
    } catch {
      // api already shows error toast
    } finally {
      restoreDbConfirmBtn.disabled = false;
      restoreDbConfirmBtn.innerHTML =
        '<i class="fa-solid fa-clock-rotate-left me-1" aria-hidden="true"></i>Restore';
    }
  });
}

function bindLogButtons() {
  on($('#copyLogBtn'), 'click', async () => {
    const logText = $('#taskLog').textContent;
    if (!logText) return;
    try {
      await window.navigator.clipboard.writeText(logText);
      bsToastSuccess('Log copied to clipboard.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = logText;
      textarea.className = 'position-fixed opacity-0';
      textarea.setAttribute('aria-label', 'Task log to copy');
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (!document.execCommand('copy')) throw new Error('Copy command failed');
        bsToastSuccess('Log copied to clipboard.');
      } catch {
        bsToastError('Failed to copy log.');
      } finally {
        textarea.remove();
        $('#copyLogBtn').focus();
      }
    }
  });

  on($('#downloadLogBtn'), 'click', () => {
    const logText = $('#taskLog').textContent;
    if (!logText) return;
    const taskName = $('#detailTaskName').textContent || 'task';
    const blob = new window.Blob([logText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${taskName.replace(/\s+/g, '_')}_log.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  });
}

function getCronDescription(expression) {
  try {
    return cronstrue.toString(expression, { locale: 'en' });
  } catch {
    return 'Invalid cron expression';
  }
}

function getNextCronRun(expression) {
  try {
    const interval = CronExpressionParser.parse(expression, { currentDate: new Date(), tz: 'UTC' });
    return formatDateTime(interval.next().toDate());
  } catch {
    return '';
  }
}

function setCronValidationState(isValid) {
  const cronInput = $('#cronExpression');
  const saveButton = $('#saveScheduleBtn');

  if (!cronInput || !saveButton) return;

  cronInput.classList.toggle('is-invalid', !isValid);
  saveButton.disabled = !isValid || !canUpdateTaskSchedule;
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function validateCronExpression() {
  const cronInput = $('#cronExpression');
  const descriptionInput = $('#scheduleDescription');
  const nextRunInput = $('#scheduleNextRun');
  if (!cronInput || !descriptionInput || !nextRunInput) return;

  const expression = cronInput.value.trim();
  if (!expression) {
    descriptionInput.value = '';
    nextRunInput.value = '';
    setCronValidationState(false);
    return;
  }

  const description = getCronDescription(expression);
  const isValid = description !== 'Invalid cron expression';
  descriptionInput.value = description;
  nextRunInput.value = isValid ? getNextCronRun(expression) : '';
  setCronValidationState(isValid);
}

function fillScheduleTaskForm(schedule = {}) {
  const scheduleIdInput = $('#scheduleId');
  const cronInput = $('#cronExpression');
  const descriptionInput = $('#scheduleDescription');
  const nextRunInput = $('#scheduleNextRun');
  const enabledInput = $('#scheduleEnabled');

  if (!scheduleIdInput || !cronInput || !descriptionInput || !nextRunInput || !enabledInput) return;

  scheduleIdInput.value = schedule.schedule_id || '';
  cronInput.value = (schedule.cron_expression || '').trim();
  descriptionInput.value = '';
  nextRunInput.value = '';
  enabledInput.checked = schedule.is_enabled === undefined ? true : schedule.is_enabled === 1;
  canUpdateTaskSchedule =
    !schedule.created_by || normalizeEmail(schedule.created_by) === normalizeEmail(currentUser);
  validateCronExpression();
}

async function loadTaskSchedule(params) {
  const taskCode = getScheduleTaskCode();
  if (!taskCode || taskCode === '-') {
    currentTaskSchedule = null;
    fillScheduleTaskForm();
    $('#scheduleTaskBtn')?.classList.add('d-none');
    return;
  }

  try {
    const schedule = await api.post(
      '/scheduler/get-task-schedule',
      {
        task_code: taskCode,
        model_name: params.model_name,
        project_name: params.project_name,
      },
      { silent: true }
    );
    currentTaskSchedule = schedule;
    fillScheduleTaskForm(schedule);
    $('#scheduleTaskBtn')?.classList.remove('d-none');
  } catch (err) {
    currentTaskSchedule = null;
    if (err.status === 403) {
      $('#scheduleTaskBtn')?.classList.add('d-none');
      return;
    }
    fillScheduleTaskForm();
    if (err.status === 404) {
      $('#scheduleTaskBtn')?.classList.toggle('d-none', currentTaskStatus !== 'SUCCESS');
      return;
    }
    $('#scheduleTaskBtn')?.classList.add('d-none');
    bsToastError('Unable to load this task schedule.');
  }
}

async function saveTaskSchedule(params) {
  const scheduleIdInput = $('#scheduleId');
  const cronInput = $('#cronExpression');
  const descriptionInput = $('#scheduleDescription');
  const enabledInput = $('#scheduleEnabled');
  const saveButton = $('#saveScheduleBtn');

  if (!scheduleIdInput || !cronInput || !descriptionInput || !enabledInput || !saveButton) return;

  const scheduleId = Number(scheduleIdInput.value) || null;

  const payload = {
    schedule_id: scheduleId,
    task_id: params.task_id,
    model_name: params.model_name,
    project_name: params.project_name,
    cron_expression: cronInput.value.trim(),
    is_enabled: enabledInput.checked ? 1 : 0,
  };

  saveButton.disabled = true;
  saveButton.innerHTML =
    '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Saving...';
  try {
    const response = await api.post('/scheduler/set-task-schedule', payload);
    const updatedScheduleId = response.schedule_id || scheduleId;
    currentTaskSchedule = {
      ...(currentTaskSchedule || {}),
      schedule_id: updatedScheduleId,
      cron_expression: payload.cron_expression,
      is_enabled: payload.is_enabled,
      next_run_at: response.next_run_at || currentTaskSchedule?.next_run_at || null,
      created_by: currentTaskSchedule?.created_by || currentUser,
    };
    scheduleIdInput.value = updatedScheduleId || '';

    const nextRunText = formatDateTime(response.next_run_at);
    const successMessage =
      response.next_run_at && nextRunText !== '-'
        ? `${response.message || 'Schedule updated successfully.'} Next run: ${nextRunText}.`
        : response.message || 'Schedule updated successfully.';
    bsToastSuccess(successMessage, 0);
    window.bootstrap.Modal.getInstance($('#scheduleTaskModal'))?.hide();
  } catch {
    bsToastError('Unable to save this task schedule.');
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = 'Save Schedule';
    validateCronExpression();
  }
}

function bindScheduleTaskModal(params) {
  const modalElement = $('#scheduleTaskModal');
  const scheduleForm = $('#scheduleTaskForm');
  const cronInput = $('#cronExpression');

  if (modalElement) {
    modalElement.addEventListener('show.bs.modal', () => {
      fillScheduleTaskForm(currentTaskSchedule || {});
    });
  }

  scheduleForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if ($('#saveScheduleBtn')?.disabled) return;
    saveTaskSchedule(params);
  });
  cronInput?.addEventListener('input', validateCronExpression);
  on($('#saveScheduleBtn'), 'click', () => saveTaskSchedule(params));
}

function bindTaskActions(params) {
  bindRefreshButton(params);
  bindCancelButton(params);
  bindCompareDbButton(params);
  bindRestoreDbButtons(params);
  bindLogButtons();
  bindScheduleTaskModal(params);
}

export async function initTaskDetailsPage(user) {
  currentUser = user?.email || null;
  const params = getQueryParams();

  if (!params.task_id) {
    $('#taskErrorMessage').textContent = 'Missing task_id in URL.';
    showView('taskError');
    return;
  }

  try {
    const data = await fetchTaskDetails(params);
    showView('taskContent');
    const status = renderDetails(params, data);
    await loadTaskSchedule(params);

    if (ACTIVE_STATUSES.has(status)) {
      schedulePoll(params);
    }
  } catch (err) {
    $('#taskErrorMessage').textContent = err.data?.detail || 'Unable to load task details.';
    showView('taskError');
    return;
  }

  bindTaskActions(params);
}
