import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // home-page-specific styles

import api from '@/common/js/api';
import { initModels } from './models';
import { updateRunningTaskUI } from './tasks';
import { initProjects } from './projects';
import { initNotifications } from './notifications';
import { initFiles } from './files';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import { $, on, ready } from '@/common/js/dom';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Return up to 2 uppercase initials from a display name. */
function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Mark a field as invalid with Bootstrap validation classes */
function setInvalid(input, message) {
  input.classList.add('is-invalid');
  let feedback = input.nextElementSibling;
  if (!feedback || !feedback.classList.contains('invalid-feedback')) {
    feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    input.parentNode.insertBefore(feedback, input.nextSibling);
  }
  feedback.textContent = message;
}

/** Clear validation state from a field */
function clearInvalid(input) {
  input.classList.remove('is-invalid');
  const feedback = input.nextElementSibling;
  if (feedback && feedback.classList.contains('invalid-feedback')) {
    feedback.textContent = '';
  }
}

/**
 * Fit the model list panel to viewport height and enable scrolling when needed.
 * Keeps a small bottom safety gap so footer/content do not overlap visually.
 */
function autosizeModelListBody() {
  const modelListContainer = document.getElementById('modelListContainer');
  if (!modelListContainer) return;

  const rect = modelListContainer.getBoundingClientRect();
  const bottomGap = 110;
  const available = window.innerHeight - rect.top - bottomGap;

  modelListContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;

  const tablesContainer = document.getElementById('tablesContainer');
  if (tablesContainer) {
    tablesContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
  }
}

/* ── App State ─────────────────────────────────────────────────────────────── */

const appState = {
  user: null,
  /** { [projectName]: string[] }  — project → model names */
  projectModels: {},
  /** Current active project name */
  currentProject: '',
  /** List of all project names */
  projects: [],
  /** List of available model templates */
  modelTemplates: [],

  selected_model: null,
};

/* ── Home Page ─────────────────────────────────────────────────────────────── */

ready(async () => {
  autosizeModelListBody();
  window.addEventListener('resize', autosizeModelListBody);

  // ── Auth guard: redirect to login if not authenticated ────────────────
  let user;
  try {
    user = await api.post('/auth/me', {}, { silent: true });
    if (user && user.role_name) {
      appState.user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
    } else {
      window.location.href = '/login.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }

  void updateRunningTaskUI(appState);

  // ── Init projects (fetch current + list, wire up modals) ───────────────
  await initProjects(appState);

  // ── Init models (fetch models, render list, wire up modals) ─────────────
  await initModels(appState);
  autosizeModelListBody();

  // ── Load notifications ─────────────────────────────────────────────────────
  void initNotifications();

  // ── Init input files modal ──────────────────────────────────────────────────
  initFiles(appState);

  // ── Display active project ───────────────────────────────────────────────
  const activeProjectDisplay = document.getElementById('activeProjectDisplay');
  if (activeProjectDisplay) {
    activeProjectDisplay.textContent = appState.currentProject || '—';
  }
  // ── Display avatar initials & user info ───────────────────────────────
  const avatar = $('#displayAvatar');
  if (avatar) {
    avatar.textContent = getInitials(user.display_name);
  }

  const userInfoActions = $('#userInfoActions');
  if (userInfoActions) {
    const infoItem = document.createElement('li');
    infoItem.className = 'px-3 py-2';

    const nameEl = document.createElement('div');
    nameEl.className = 'fw-semibold';
    nameEl.textContent = user.display_name || '';

    const emailEl = document.createElement('div');
    emailEl.className = 'text-muted small';
    emailEl.textContent = user.email || '';

    infoItem.append(nameEl, emailEl);

    const dividerItem = document.createElement('li');
    const divider = document.createElement('hr');
    divider.className = 'dropdown-divider';
    dividerItem.appendChild(divider);

    userInfoActions.prepend(dividerItem);
    userInfoActions.prepend(infoItem);
  }

  // ── SQL Client ─────────────────────────────────────────────────────────
  const sqlClientMenu = $('#sqlClientMenu');
  if (sqlClientMenu) {
    on(sqlClientMenu, 'click', (e) => {
      e.preventDefault();
      const params = new URLSearchParams({
        project: appState.currentProject || '',
        model: appState.selected_model || '',
      });
      window.open(`/sql-client.html?${params.toString()}`, '_blank');
    });
  }

  // ── Logout ───────────────────────────────────────────────────────────
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) {
    on(logoutBtn, 'click', async (e) => {
      e.preventDefault();
      try {
        await api.post('/auth/logout', {});
      } catch {
        // Even if the server call fails, clear local session.
      }
      sessionStorage.removeItem('user');
      window.location.href = '/login.html';
    });
  }

  // ── Reset Password ──────────────────────────────────────────────────────
  const resetForm = $('#resetPasswordForm');
  const currentPasswordInput = $('#currentPassword');
  const newPasswordInput = $('#newPassword');
  const confirmPasswordInput = $('#confirmPassword');
  const submitResetBtn = $('#submitResetBtn');
  const resetModal = $('#resetPasswordModal');

  if (resetForm) {
    on(currentPasswordInput, 'input', () => clearInvalid(currentPasswordInput));
    on(newPasswordInput, 'input', () => clearInvalid(newPasswordInput));
    on(confirmPasswordInput, 'input', () => clearInvalid(confirmPasswordInput));

    // Clear form when modal is closed
    on(resetModal, 'hidden.bs.modal', () => {
      resetForm.reset();
      clearInvalid(currentPasswordInput);
      clearInvalid(newPasswordInput);
      clearInvalid(confirmPasswordInput);
    });

    on(submitResetBtn, 'click', async () => {
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      let valid = true;

      if (!currentPassword) {
        setInvalid(currentPasswordInput, 'Current password is required.');
        valid = false;
      }

      if (!newPassword) {
        setInvalid(newPasswordInput, 'New password is required.');
        valid = false;
      } else if (newPassword.length < 8) {
        setInvalid(newPasswordInput, 'Password must be at least 8 characters.');
        valid = false;
      }

      if (!confirmPassword) {
        setInvalid(confirmPasswordInput, 'Please confirm your new password.');
        valid = false;
      } else if (newPassword !== confirmPassword) {
        setInvalid(confirmPasswordInput, 'Passwords do not match.');
        valid = false;
      }

      if (!valid) return;

      submitResetBtn.disabled = true;
      submitResetBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting…';

      try {
        await api.post('/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        });

        await toastSuccess('Password reset successfully!');
        bootstrap.Modal.getInstance(resetModal)?.hide();
      } catch (err) {
        if (!err.status) {
          toastError('An unexpected error occurred. Please try again.');
        }
      } finally {
        submitResetBtn.disabled = false;
        submitResetBtn.textContent = 'Reset Password';
      }
    });
  }
});
