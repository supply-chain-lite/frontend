import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // task-details-v2-specific styles

import api from '@/common/js/api';
import { $, on, ready } from '@/common/js/dom';
import { bsToastSuccess, bsToastError } from '@/common/js/bsToast';

/* ── Constants ─────────────────────────────────────────────────────────────── */

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

/* ── State ─────────────────────────────────────────────────────────────────── */

let pollTimer = null;
let currentUser = null;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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

/* ── UI Rendering ──────────────────────────────────────────────────────────── */

function renderDetails(params, data) {
  $('#detailModelName').textContent = params.model_name || '-';
  $('#detailProjectName').textContent = params.project_name || '-';
  $('#detailTaskName').textContent = data.task_name || '-';
  $('#detailSubmittedBy').textContent = data.submitted_by || '-';
  $('#detailStartTime').textContent = formatDateTime(data.start_time);

  const status = (data.status || '').toUpperCase();
  const isActive = ACTIVE_STATUSES.has(status);

  // End time: show only when task is finished
  const endTimeBlock = $('#endTimeBlock');
  if (isActive || !data.end_time) {
    endTimeBlock.classList.add('d-none');
  } else {
    endTimeBlock.classList.remove('d-none');
    $('#detailEndTime').textContent = formatDateTime(data.end_time);
  }

  // Run time: show only for SUCCESS tasks with both timestamps
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

  // Status badge
  const badge = $('#taskStatusBadge');
  const cfg = STATUS_CONFIG[status] || { bg: 'bg-secondary', label: status || 'Unknown' };
  badge.className = `badge fs-6 ${cfg.bg}`;
  badge.textContent = cfg.label;

  // Action buttons & running progress bar
  const actions = $('#taskActions');
  const runProgress = $('#taskRunningProgress');
  const isOwner = currentUser && data.submitted_by && currentUser === data.submitted_by;

  // Show the action row when task is active (owner gets buttons + bar, others get bar only)
  if (isActive) {
    actions.classList.remove('d-none');
    runProgress.classList.remove('d-none');
    $('#refreshBtn').classList.toggle('d-none', !isOwner);
    $('#cancelBtn').classList.toggle('d-none', !isOwner);
  } else {
    actions.classList.add('d-none');
    runProgress.classList.add('d-none');
  }

  // Log
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

/* ── API Calls ─────────────────────────────────────────────────────────────── */

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

/* ── Polling ───────────────────────────────────────────────────────────────── */

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
    }
  } catch (err) {
    if (!isPolling) {
      $('#taskErrorMessage').textContent = err.data?.detail || 'Unable to load task details.';
      showView('taskError');
    }
    // On polling errors keep retrying
    if (isPolling) schedulePoll(params);
  }
}

/* ── Initialisation ────────────────────────────────────────────────────────── */

ready(async () => {
  const params = getQueryParams();

  if (!params.task_id) {
    $('#taskErrorMessage').textContent = 'Missing task_id in URL.';
    showView('taskError');
    return;
  }

  // Auth guard
  try {
    const user = await api.post('/auth/me', {}, { silent: true });
    if (user && user.email) {
      currentUser = user.email;
    } else {
      window.location.href = '/login.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Initial load
  try {
    const data = await fetchTaskDetails(params);
    showView('taskContent');
    const status = renderDetails(params, data);

    if (ACTIVE_STATUSES.has(status)) {
      schedulePoll(params);
    }
  } catch (err) {
    $('#taskErrorMessage').textContent = err.data?.detail || 'Unable to load task details.';
    showView('taskError');
    return;
  }

  // Refresh button
  const refreshBtn = $('#refreshBtn');
  on(refreshBtn, 'click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Refreshing…';
    stopPolling();
    try {
      await loadAndRender(params);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML =
        '<i class="fa-solid fa-arrows-rotate me-1" aria-hidden="true"></i>Refresh';
    }
  });

  // Cancel button
  const cancelBtn = $('#cancelBtn');
  on(cancelBtn, 'click', async () => {
    if (!window.confirm('Are you sure you want to cancel this task?')) return;

    cancelBtn.disabled = true;
    cancelBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Cancelling…';
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

  // Copy log button
  on($('#copyLogBtn'), 'click', async () => {
    const logText = $('#taskLog').textContent;
    if (!logText) return;
    try {
      await window.navigator.clipboard.writeText(logText);
      bsToastSuccess('Log copied to clipboard.');
    } catch {
      bsToastError('Failed to copy log.');
    }
  });

  // Download log button
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
});
