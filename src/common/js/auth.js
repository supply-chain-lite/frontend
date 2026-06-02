/**
 * Redirect URL helpers for post-login and access-control flows.
 *
 * Usage:
 *   import { saveRedirectUrl, consumeRedirectUrl, currentPageUrl } from '@/common/js/auth';
 */

const STORAGE_KEY = 'redirect_url';

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
  return url || null;
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

  if (apiUser && typeof apiUser.redirect_url === 'string' && apiUser.redirect_url) {
    return { url: apiUser.redirect_url, source: 'api' };
  }

  return { url: fallback, source: 'fallback' };
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
  if (
    apiUser &&
    typeof apiUser.redirect_url === 'string' &&
    apiUser.redirect_url &&
    apiUser.redirect_url !== currentPageUrl()
  ) {
    window.location.href = apiUser.redirect_url;
    return true;
  }
  return false;
}
