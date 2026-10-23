# Frontend enterprise security audit

Date: 2026-10-23

Verdict: remediation and backend/deployment verification required before enterprise approval.

## Scope and method

Source review of authentication, redirects, DOM rendering, SQL execution/history/exports,
S3 browsing and credentials, workbook parsing, dependency lockfile, and CI/release/deployment
workflows. Queried the npm advisory database successfully and ran JavaScript lint (passed).
The preceding change upgraded SheetJS to 0.20.3; its two previously identified advisories
were not reintroduced. This audit made no application changes.

This is a static frontend review, not a penetration test. No production site, backend,
cookie configuration, response headers, or cross-user authorization behavior was tested.
Severity describes potential impact with the prerequisites stated below. No critical
issue was established within this scope; that is not a full-system clearance.

## Findings

### F1 — High: HTML attribute injection in SQL history

Remediation: fixed after this audit. SQL history now assigns database names, SQL,
status, and timestamps with DOM text/property APIs; its HTML template is static.
The original finding below is retained as the audit record.

Evidence: `src/page_assets/sql-client/js/app.js:429-431,612-615`.
`renderHistory` interpolates `esc(entry.sql)` and `esc(dbName)` into double-quoted
`title` attributes. `esc` uses a div's textContent/innerHTML, which escapes markup
delimiters but does not encode double quotes in text. A quote-containing value can
terminate the title and introduce an event attribute. An inert diagnostic input such
as `SELECT 1 -- " data-audit-marker="present` illustrates the boundary violation.
An event-handler variant could execute JavaScript when the row is interacted with,
unless a deployed CSP blocks inline handlers.

The source-to-sink defect is confirmed by inspection; browser execution was not tested.
Whether this is cross-user stored XSS depends on backend controls over SQL history and
project/model names. History is fetched from `/sql-client/history` and submitted to
`/sql-client/history/add`; cross-user reachability was not established.

Fix: construct cells with DOM APIs, assign `.title` and `.textContent`, or use correct
attribute encoding as already done by `escAttr` in results.js. Validate with quotes,
markup, and event-handler payloads in both SQL history and database names.

### F2 — High: persistent storage of S3 credentials across sessions

Evidence: `src/page_assets/s3-browser/js/tree.js:43-48,482-508`;
`src/page_assets/home-page/js/main.js:213-221`.
S3 access keys and secret keys are serialized into origin-wide localStorage under
`s3-browser-settings`. They survive page closure and application logout; logout only
removes the sessionStorage user record. Another account using the same browser profile
can load the prior credentials. Any script executing within the same origin can read
them. F1 would increase the impact if exploitable within this origin.

Fix: prefer server-managed connections and short-lived scoped credentials. For manually
entered credentials, retain secrets only in memory and clear them on logout/account
change; remove existing stored secrets during migration. sessionStorage alone does not
protect against same-origin XSS. Revoke/rotate exposed long-lived credentials as needed.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

### F3 — Medium: spreadsheet formula injection in exports and clipboard

Evidence: `src/page_assets/sql-client/js/results.js:157-177`;
`src/page_assets/sql-client/js/app.js:618-624`.
CSV escaping handles delimiters and quotes but returns formula-leading values unchanged.
For example, a string `=1+1` remains a formula when opened in a spreadsheet. TSV clipboard
output has the same issue and preserves embedded newlines, allowing extra spreadsheet
rows. This matters when lower-trust database content is exported by another user.
Impact depends on the spreadsheet application, configuration, and user interaction;
workstation code execution was not demonstrated.

Fix: define a spreadsheet-safe export mode for untrusted strings and headers, covering
formula prefixes and control characters; preserve actual numeric values intentionally.
Use typed text cells in XLSX where faithful text export is required. Test Excel and
LibreOffice behavior for CSV open/import and clipboard paste.

Reference: https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection

### F4 — Medium: unrestricted redirect destinations

Remediation: fixed after this audit. The shared redirect helper parses destinations,
requires same-origin HTTP(S) URLs without credentials, and returns canonical absolute
URLs. Invalid saved/API destinations are skipped; invalid fallbacks use the default
home page. Invalid access-control destinations do not trigger navigation. The original
finding below is retained as the audit record.

Evidence: `src/common/js/auth.js:30-36,50-58,68-77`;
`src/page_assets/login/js/main.js:51,101`.
Saved redirect URLs and API-provided redirect_url values reach window.location.href
without validating scheme or origin. External URLs permit open redirects; dangerous
schemes can create script-execution risk depending on browser/CSP behavior. An attacker
must control the stored value or backend redirect value; a URL-query-only attack path
was not established. The normal saved URL is generated from pathname and search.

Fix: resolve against the application origin, require HTTP(S) and the same origin,
reject credentials and protocol-relative external destinations, and fall back safely.
Backend redirect generation needs equivalent validation. This shared file is currently
read-only under repository instructions; remediation requires respecting that constraint.

### F5 — Medium: workflow input interpolated into release shell script

Evidence: `.github/workflows/release.yml:82`.
`${{ inputs.target_ref }}` is substituted directly into a quoted shell command for
release notes. Shell metacharacters or command substitution in the input can become
code on the runner. Triggering workflow_dispatch requires appropriate repository access;
this is not an unauthenticated public-PR exploit. The job has contents:write and its
release step receives GH_TOKEN. The workflow also deliberately checks out arbitrary
refs, so operator trust and release permissions remain essential even after this fix.

Fix: pass the ref through an environment variable and quote that variable; restrict
release refs and use a protected approval environment for privileged releases. Avoid
giving unreviewed checked-out code deployment secrets or privileged tokens.

Reference: https://docs.github.com/en/actions/concepts/security/script-injections

### F6 — Medium for build environments: vulnerable development dependency

`npm audit --json` reports one high-severity affected package: brace-expansion 5.0.9,
through eslint 10.12.0 -> minimatch 10.2.6. This is development tooling, not a browser
runtime dependency. The audit lists recursion/CPU denial-of-service issues, including
GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p, and reports a fix is available.
Exploitability requires attacker-controlled input to reach the affected expansion code.

Fix: update to a compatible dependency resolution with brace-expansion >=5.0.12 and
rerun audit/lint/build. A clean npm audit would still not establish application security
or guarantee coverage of dependencies distributed outside the npm registry.

### F7 — Low: password-reset code remains in page URL

Evidence: `src/page_assets/reset-password/js/main.js:53-66`.
The reset code and email are accepted from the query string and the code is not removed
from the address bar/history after consumption. It can therefore persist in browser
history, copied links, and initial web-server logs. No Referrer-Policy is declared in
the HTML; a server may set one. Modern default cross-origin referrer behavior generally
omits query strings, so third-party font requests alone do not prove token leakage.

Fix: remove sensitive query parameters promptly with history.replaceState; use
Cache-Control: no-store and Referrer-Policy: no-referrer on recovery pages, scrub tokens
from logs, and verify one-time use, expiry, and rate limits on the backend.

### F8 — Low: unbounded workbook parsing on the browser main thread

Evidence: `src/page_assets/home-page/js/models.js:2092-2093` and
`src/page_assets/table/js/tableModals.js:670-671`.
Both paths buffer an uploaded file and synchronously parse it without a size limit or
worker boundary. Even a patched parser can freeze a tab or exhaust memory on large or
highly compressed input. A user must select the file; server-wide impact is not shown.

Fix: add an appropriate size limit and use a worker with a timeout/termination path
for parsing. Apply independent compressed/decompressed resource limits on the backend.

## Enterprise controls requiring backend or hosting verification

These are verification gaps, not confirmed server vulnerabilities:

- Every API must independently enforce user, role, tenant/project/model ownership,
  particularly SQL execution, user/role editing, schedules, file downloads, and S3 access.
  Frontend page checks and hidden/disabled buttons are not authorization boundaries.
- Cookie security (HttpOnly, Secure, SameSite), session rotation/revocation, idle and
  absolute timeouts, MFA/SSO, login/reset throttling, and server-side CSRF protection.
  The frontend API client does not implement an explicit CSRF-token flow; assess
  server Origin checks, cookie policy, accepted content types, and cross-origin rules.
- S3 APIs accept user-specified endpoints and credentials. Verify HTTPS enforcement,
  endpoint allowlists, private/link-local/metadata address blocking, DNS rebinding and
  redirect handling to prevent backend SSRF. Accepting arbitrary URLs in a frontend
  does not by itself establish SSRF. Validate presigned URL scheme/host/expiry and force
  attachment handling for untrusted active content downloaded from storage.
- SQL execution permits arbitrary submitted SQL by design. Enforce database-scoped
  permissions, least-privilege database credentials, execution timeouts, result limits,
  and audit trails. Client-side SQL parsing is not a security boundary.
- Confirm HTTPS/HSTS, restrictive CSP including frame-ancestors, nosniff, referrer policy,
  sensitive-response cache controls, and narrowly scoped CORS at the actual web server.
  No production response headers were available for inspection.
- Google font requests remain external dependencies and require enterprise egress/privacy
  review or self-hosting. No application secret was printed or .env content inspected;
  only .env.example is tracked among environment files. This is not a historical secret scan.
- CI currently lints/formats/builds and has a CodeQL workflow, but no npm-audit gate or
  dedicated security regression tests are configured. CodeQL results were not inspected.

## Recommended order

1. Fix F1 and F2 before onboarding enterprise users or credentials.
2. Fix F3-F6 and add focused regression coverage and an automated dependency scan.
3. Resolve F7-F8 and validate backend/hosting controls in a staging environment.
4. Perform authenticated tests with two users/tenants and distinct roles before sign-off.
