/**
 * Redirect URL helpers for post-login and access-control flows.
 *
 * Usage:
 *   import { saveRedirectUrl, consumeRedirectUrl, currentPageUrl } from '@/common/js/auth';
 */

const STORAGE_KEY = 'redirect_url';
const DEFAULT_REDIRECT = '/home-page.html';

/** Resolve untrusted destinations without allowing scripts, credentials, or other origins. */
function safeRedirectUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new window.URL(value, window.location.href);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== window.location.origin ||
      url.username ||
      url.password
    ) {
      return null;
    }
    // Keep the absolute, parsed URL so a path beginning with // cannot be
    // reinterpreted as a protocol-relative external destination on assignment.
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Returns the current page URL (pathname + query string) to be sent
 * as the `page_url` parameter to `/auth/me` for access-control checks.
 * @returns {string}
 */
export function currentPageUrl() {
  const url = window.location.pathname + window.location.search;
  return url;
}

/**
 * Saves the current page path and query string to sessionStorage
 * so the login page can redirect back after successful authentication.
 */
export function saveRedirectUrl() {
  sessionStorage.setItem(STORAGE_KEY, currentPageUrl());
}

/**
 * Reads and removes the saved redirect URL from sessionStorage.
 * @returns {string|null} The saved URL or null if nothing was saved.
 */
export function consumeRedirectUrl() {
  const url = sessionStorage.getItem(STORAGE_KEY);
  if (url) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  return safeRedirectUrl(url);
}

/**
 * Resolves the target redirect URL based on priority order:
 * 1. locally saved URL (from sessionStorage)
 * 2. API-returned `redirect_url` from `/auth/me`
 * 3. fallback value (default: '/home-page.html')
 *
 * @param {object} [apiUser] - The user object returned by `/auth/me` (may contain `redirect_url`).
 * @param {string} [fallback='/home-page.html'] - Default page when no other source provides a URL.
 * @returns {{ url: string, source: 'saved'|'api'|'fallback' }}
 */
export function resolveRedirectUrl(apiUser, fallback = '/home-page.html') {
  const savedUrl = consumeRedirectUrl();
  if (savedUrl) return { url: savedUrl, source: 'saved' };

  const apiUrl = safeRedirectUrl(apiUser?.redirect_url);
  if (apiUrl) return { url: apiUrl, source: 'api' };

  return {
    url: safeRedirectUrl(fallback) || safeRedirectUrl(DEFAULT_REDIRECT),
    source: 'fallback',
  };
}

/**
 * Checks whether the `/auth/me` response mandates an access-control redirect.
 * If `redirect_url` is present and points to a different page, redirect to it.
 * Returns `true` if a redirect was triggered, `false` if the user can stay.
 *
 * @param {object} apiUser - The user object returned by `/auth/me`.
 * @returns {boolean} Whether a redirect was performed.
 */
export function handleAccessControlRedirect(apiUser) {
  const url = safeRedirectUrl(apiUser?.redirect_url);
  const currentUrl = safeRedirectUrl(currentPageUrl());
  if (url && url !== currentUrl) {
    window.location.href = url;
    return true;
  }
  return false;
}
