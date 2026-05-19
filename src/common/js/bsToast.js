/**
 * Bootstrap 5 native toast helpers.
 *
 * Toasts are created dynamically and appended to a fixed container.
 * No extra HTML needed — the container is auto-created on first use.
 *
 * Usage:
 *   import { bsToastSuccess, bsToastError } from '@/common/js/bsToast';
 *   bsToastSuccess('Saved!');
 *   bsToastError('Something went wrong');
 */

const VARIANT_MAP = {
  success: {
    bg: 'bg-success',
    icon: '<i class="fa-solid fa-check" aria-hidden="true"></i>',
    label: 'Success',
  },
  danger: {
    bg: 'bg-danger',
    icon: '<i class="fa-solid fa-xmark" aria-hidden="true"></i>',
    label: 'Error',
  },
  warning: {
    bg: 'bg-warning',
    icon: '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>',
    label: 'Warning',
  },
  info: {
    bg: 'bg-info',
    icon: '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>',
    label: 'Info',
  },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch];
  });
}

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '1090';
    document.body.appendChild(container);
  }
  return container;
}

function show(message, variant = 'success', { delay = 1500, errorCode } = {}) {
  const { bg, icon, label } = VARIANT_MAP[variant] || VARIANT_MAP.info;
  const textColor = variant === 'warning' ? 'text-dark' : 'text-white';
  let autohide = variant !== 'danger' && variant !== 'warning';
  if (delay === 0) autohide = false;
  const safeMessage = escapeHtml(message);
  const safeErrorCode = errorCode === null ? '' : escapeHtml(errorCode);
  const codeHtml =
    variant === 'danger' && errorCode
      ? `<div class="text-muted small mt-1">Error code: <strong>${safeErrorCode}</strong></div>`
      : '';

  const toastEl = document.createElement('div');
  toastEl.className = 'toast align-items-center border-0';
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="toast-header ${bg} ${textColor}">
      <span class="me-2">${icon}</span>
      <strong class="me-auto">${label}</strong>
      <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">
      ${safeMessage}
      ${codeHtml}
    </div>
  `;

  getContainer().appendChild(toastEl);

  const bsToast = new window.bootstrap.Toast(toastEl, { autohide, delay });
  bsToast.show();

  // Clean up DOM after toast hides
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

export function bsToastSuccess(message, delay) {
  show(message, 'success', { delay });
}

export function bsToastError(message, { delay, errorCode } = {}) {
  show(message, 'danger', { delay, errorCode });
}

export function bsToastWarning(message, delay) {
  show(message, 'warning', { delay });
}

export function bsToastInfo(message, delay) {
  show(message, 'info', { delay });
}
