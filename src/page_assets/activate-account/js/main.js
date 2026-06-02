import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // activate-account-page-specific styles

import api from '@/common/js/api';
import { resolveRedirectUrl, currentPageUrl } from '@/common/js/auth';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import { $, on, ready } from '@/common/js/dom';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Basic email format check */
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

/* ── Activate Account ───────────────────────────────────────────────────────── */

ready(async () => {
  // ── Already authenticated? Redirect immediately ───────────────────────
  try {
    const user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
      sessionStorage.setItem('user', JSON.stringify(user));
      window.location.href = resolveRedirectUrl(user).url;
      return;
    }
  } catch {
    // Not authenticated — continue to show the activation form.
  }

  const form = $('#activationForm');
  const emailInput = $('#emailInput');
  const activationCodeInput = $('#activationCodeInput');
  const submitBtn = $('button[type="submit"]', form);
  const activationMessage = $('#activationMessage');

  if (!form) return;

  // ── Pre-fill from URL query params ───────────────────────────────────────
  const params = new URLSearchParams(window.location.search);

  const userEmail = params.get('useremail');
  if (userEmail) {
    emailInput.value = userEmail;
    emailInput.disabled = true;
  }

  const activationCode = params.get('activationcode');
  if (activationCode) {
    activationCodeInput.value = activationCode;
    window.setTimeout(() => form.requestSubmit(), 1000);
  }

  // ── Clear validation on input ────────────────────────────────────────────
  on(emailInput, 'input', () => clearInvalid(emailInput));
  on(activationCodeInput, 'input', () => clearInvalid(activationCodeInput));

  on(form, 'submit', async (e) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────
    const email = emailInput.value.trim();
    const activation_code = activationCodeInput.value.trim();
    let valid = true;

    if (!email) {
      setInvalid(emailInput, 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      setInvalid(emailInput, 'Please enter a valid email address.');
      valid = false;
    }

    if (!activation_code) {
      setInvalid(activationCodeInput, 'Activation code is required.');
      valid = false;
    }

    if (!valid) return;

    // ── Submit ───────────────────────────────────────────────────────────
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Activating…';

    try {
      await api.post('/auth/activate', { email, activation_code });

      activationMessage.classList.remove('d-none', 'alert-danger');
      activationMessage.classList.add('alert-success');
      activationMessage.textContent = 'Account activated successfully! Redirecting to sign in…';

      await toastSuccess('Account activated!');
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      window.location.href = '/login.html';
    } catch (err) {
      // api.js already shows an error toast for network / HTTP errors.
      // Only show a toast for unexpected issues not caught by api.js.
      if (!err.status) {
        toastError('An unexpected error occurred. Please try again.');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify & Activate';
    }
  });
});
