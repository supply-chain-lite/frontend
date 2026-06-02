/**
 * SQL client core application logic.
 *
 * Handles server-based query execution, object (table/view) listing, DDL inspection,
 * in-memory query history, text-to-SQL generation, and Settings modal.
 *
 * All server calls are POST requests with project_name and model_name included.
 * No localStorage is used — everything is fetched from the server.
 *
 * API endpoints used:
 *   POST /sql-client/execute        { project_name, model_name, sql }
 *                                   → { type: 'rows', columns, rows } | { type: 'changes', changes }
 *   POST /sql-client/objects        { project_name, model_name }
 *                                   → { tables: [...], views: [...] }
 *   POST /sql-client/ddl            { project_name, model_name, object_name }
 *                                   → { ddl: '...' }
 *   POST /sql-client/history        { project_name, model_name }
 *                                   → [{ sql, status, is_error, timestamp }, ...]
 *   POST /sql-client/history/add    { project_name, model_name, sql, status, is_error }
 *                                   → (no body required)
 */

import api from '../../../common/js/api.js';
import { bsToastError, bsToastSuccess } from '../../../common/js/bsToast.js';
import { $, on } from '../../../common/js/dom.js';
import { initEditor, addTab, setEditorValue } from './editor.js';
import {
  initResults,
  renderResultsTable,
  showMessage,
  showResultsLoader,
  copyToClipboard,
} from './results.js';

// ===== State =====
let appState = null; // { projectName, modelName }
let currentDdlObject = null;
let isExecuting = false;

// In-memory settings (no localStorage)
const settings = {
  textToSqlProvider: 'chatgpt',
  textToSqlModel: '',
  textToSqlApiKey: '',
  textToSqlCustomEndpoint: '',
  textToSqlCustomAuthType: 'Bearer',
};

// ===== DOM refs =====
const statusText = $('#status-text');
const dbList = $('#db-list');
const dbEmpty = $('#db-empty');
const objectsSection = $('#objects-section');
const tableList = $('#table-list');
const viewList = $('#view-list');
const objectsViewsSection = $('#objects-views');
const runBtn = $('#run-btn');
const clearBtn = $('#clear-btn');
const sqlEditorEl = $('#sql-editor');

const ddlObjectName = $('#ddl-object-name');
const ddlCode = $('#ddl-code');
const ddlQueryBtn = $('#ddl-query-btn');
const ddlCountBtn = $('#ddl-count-btn');
const ddlExportCsvBtn = $('#ddl-export-csv-btn');
const ddlCopyBtn = $('#ddl-copy-btn');

const resultsTabEl = $('#results-tab');
const ddlTabEl = $('#ddl-tab');

const historyEmpty = $('#history-empty');
const historyTableWrap = $('#history-table-wrap');
const historyTbody = $('#history-tbody');

const settingsModal = $('#settingsModal');
const textToSqlProviderInput = $('#text-to-sql-provider-input');
const textToSqlModelInput = $('#text-to-sql-model-input');
const textToSqlApiKeyInput = $('#text-to-sql-api-key-input');
const textToSqlCustomEndpointInput = $('#text-to-sql-custom-endpoint-input');
const textToSqlCustomEndpointGroup = $('#text-to-sql-custom-endpoint-group');
const textToSqlCustomAuthTypeInput = $('#text-to-sql-custom-auth-type-input');
const saveSettingsBtn = $('#save-settings-btn');

// ===== Init =====

export async function initApp(state) {
  appState = state;

  initEditor();
  initResults();
  await refreshObjects();
  await renderHistory();
  bindEvents();
}

// ===== Objects (Tables / Views) =====

async function refreshObjects() {
  try {
    const data = await api.post('/sql-client/objects', {
      project_name: appState.projectName,
      model_name: appState.modelName,
    });

    const tables = data.tables || [];
    const views = data.views || [];

    // Show connected DB in sidebar
    dbEmpty.classList.add('d-none');
    dbList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'list-group-item active text-truncate';
    li.textContent = `${appState.projectName} > ${appState.modelName}`;
    li.title = `${appState.projectName} > ${appState.modelName}`;
    dbList.appendChild(li);

    objectsSection.classList.remove('d-none');
    renderObjectList(tableList, tables);
    renderObjectList(viewList, views);
    objectsViewsSection.classList.toggle('d-none', views.length === 0);

    setStatus(`Connected: ${appState.projectName} > ${appState.modelName}`);
  } catch (err) {
    setStatus('Failed to load objects: ' + err.message, true);
  }
}

function renderObjectList(ul, names) {
  ul.innerHTML = '';
  for (const name of names) {
    const li = document.createElement('li');
    li.className = 'list-group-item obj-item text-truncate';
    li.textContent = name;
    li.title = name;
    li.addEventListener('click', () => showDdl(name));
    ul.appendChild(li);
  }
}

// ===== DDL =====

async function showDdl(name) {
  currentDdlObject = name;
  ddlObjectName.textContent = name;
  ddlCode.textContent = 'Loading...';
  ddlCountBtn.innerHTML = '<i class="fa-solid fa-hashtag me-1" aria-hidden="true"></i>Count';
  ddlCountBtn.disabled = false;
  showBsTab(ddlTabEl);

  try {
    const data = await api.post('/sql-client/ddl', {
      project_name: appState.projectName,
      model_name: appState.modelName,
      object_name: name,
    });
    ddlCode.textContent = data.ddl || '';
  } catch (err) {
    ddlCode.textContent = 'Error loading DDL: ' + err.message;
  }
}

// ===== Query Execution =====

function getQueryAtCursor() {
  const fullText = sqlEditorEl.value;
  const cursorPos = sqlEditorEl.selectionStart;
  if (!fullText.trim()) return '';

  const stmts = [];
  let start = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i];
    if (inString) {
      if (ch === stringChar && fullText[i - 1] !== '\\') inString = false;
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        stringChar = ch;
      } else if (ch === ';') {
        stmts.push({ sql: fullText.slice(start, i).trim(), start, end: i });
        start = i + 1;
      }
    }
  }
  // Trailing statement after last semicolon
  const last = fullText.slice(start).trim();
  if (last) stmts.push({ sql: last, start, end: fullText.length });

  // Find the statement containing the cursor
  for (const stmt of stmts) {
    if (cursorPos >= stmt.start && cursorPos <= stmt.end) {
      return stmt.sql;
    }
  }
  // Cursor after last semicolon with no trailing text — return last statement
  if (stmts.length > 0) return stmts[stmts.length - 1].sql;
  return fullText.trim();
}

async function executeQuery(sqlOverride = null) {
  if (isExecuting) return;
  const raw = sqlOverride ?? getQueryAtCursor();
  const sql = raw.trim();
  if (!sql) return;

  isExecuting = true;
  showResultsLoader();
  setStatus('Executing...');
  runBtn.disabled = true;

  try {
    const start = window.performance.now();
    const result = await api.post('/sql-client/execute', {
      project_name: appState.projectName,
      model_name: appState.modelName,
      sql,
    });
    const elapsed = ((window.performance.now() - start) / 1000).toFixed(3);

    if (result.type === 'rows') {
      const statusMsg = `${result.rows.length} row${result.rows.length !== 1 ? 's' : ''} in ${elapsed}s`;
      renderResultsTable(result.columns, result.rows);
      setStatus(statusMsg);
      await addToHistory(sql, statusMsg, false);
    } else {
      const statusMsg = `${result.changes ?? 0} row(s) affected (${elapsed}s)`;
      showMessage(`Query OK. ${statusMsg}`);
      setStatus(statusMsg);
      await addToHistory(sql, statusMsg, false);
      await refreshObjects();
    }

    await renderHistory();
    showBsTab(resultsTabEl);
  } catch (err) {
    showMessage(err.message, true);
    setStatus('Error', true);
    await addToHistory(sql, err.message, true);
    await renderHistory();
  } finally {
    runBtn.disabled = false;
    isExecuting = false;
  }
}

// ===== Table Export (full table) =====

async function exportTableToCSV(tableName) {
  const originalHTML = ddlExportCsvBtn.innerHTML;
  ddlExportCsvBtn.disabled = true;
  ddlExportCsvBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Exporting...';

  try {
    const result = await api.post('/sql-client/execute', {
      project_name: appState.projectName,
      model_name: appState.modelName,
      sql: `SELECT * FROM [${tableName}]`,
    });

    if (result.type !== 'rows' || !result.rows.length) {
      bsToastSuccess('Table is empty');
      return;
    }

    const csvLines = [result.columns.map(escCsv).join(',')];
    for (const row of result.rows) {
      csvLines.push(row.map(escCsv).join(','));
    }

    const csvBlob = new window.Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const csvUrl = window.URL.createObjectURL(csvBlob);
    const csvLink = document.createElement('a');
    csvLink.href = csvUrl;
    csvLink.download = `${tableName}_export.csv`;
    csvLink.style.display = 'none';
    document.body.appendChild(csvLink);
    csvLink.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(csvUrl);
      csvLink.remove();
    }, 1000);
    bsToastSuccess(
      `Exported ${result.rows.length.toLocaleString()} rows to ${tableName}_export.csv`
    );
  } catch (err) {
    bsToastError('Export failed: ' + err.message);
  } finally {
    ddlExportCsvBtn.innerHTML = originalHTML;
    ddlExportCsvBtn.disabled = false;
  }
}

// ===== History =====

async function addToHistory(sql, status, isError) {
  try {
    await api.post('/sql-client/history/add', {
      project_name: appState.projectName,
      model_name: appState.modelName,
      sql,
      status,
      is_error: isError,
    });
  } catch {
    // History write failures are non-critical — ignore silently
  }
}

async function renderHistory() {
  let entries;
  try {
    const result = await api.post('/sql-client/history', {
      project_name: appState.projectName,
      model_name: appState.modelName,
    });
    entries = Array.isArray(result.history) ? result.history : [];
  } catch {
    entries = [];
  }

  historyEmpty.classList.toggle('d-none', entries.length > 0);
  historyTableWrap.classList.toggle('d-none', entries.length === 0);
  historyTbody.innerHTML = '';

  for (const entry of entries) {
    const tr = document.createElement('tr');
    const time = new Date(entry.timestamp);
    const timeStr =
      time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      ' ' +
      time.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const statusClass = entry.is_errored ? 'text-danger' : 'text-success';
    const dbName = `${appState.projectName}/${appState.modelName}`;

    tr.innerHTML = `
      <td class="text-truncate" style="max-width:120px" title="${esc(dbName)}">${esc(dbName)}</td>
      <td class="font-monospace text-truncate" style="max-width:200px" title="${esc(entry.sql)}">${esc(entry.sql)}</td>
      <td class="${statusClass} text-truncate">${esc(entry.status)}</td>
      <td>${timeStr}</td>
      <td class="text-center">
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-outline-dark btn-sm hist-use-btn" title="Execute">
            <i class="fa-solid fa-play" aria-hidden="true"></i>
          </button>
          <button class="btn btn-outline-dark btn-sm hist-copy-btn" title="Copy to clipboard">
            <i class="fa-regular fa-copy" aria-hidden="true"></i>
          </button>
        </div>
      </td>`;

    tr.querySelector('.hist-use-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      setEditorValue(entry.sql);
      showBsTab(resultsTabEl);
      executeQuery(entry.sql);
    });

    tr.querySelector('.hist-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToClipboard(entry.sql);
    });

    historyTbody.appendChild(tr);
  }
}

// ===== Event Binding =====

function bindEvents() {
  // Ctrl/Cmd+Enter runs query
  sqlEditorEl.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      showBsTab(resultsTabEl);
      executeQuery();
    }
  });

  on(runBtn, 'click', () => {
    showBsTab(resultsTabEl);
    executeQuery();
  });

  on(clearBtn, 'click', () => setEditorValue(''));

  // DDL: Top 1000
  on(ddlQueryBtn, 'click', () => {
    const name = ddlObjectName.textContent;
    if (!name) return;
    const sql = `SELECT * FROM [${name}] LIMIT 1000;`;
    addTab(sql);
    executeQuery(sql);
  });

  // DDL: Count
  on(ddlCountBtn, 'click', async () => {
    const name = ddlObjectName.textContent;
    if (!name) return;
    try {
      ddlCountBtn.disabled = true;
      ddlCountBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Counting...';
      const result = await api.post('/sql-client/execute', {
        project_name: appState.projectName,
        model_name: appState.modelName,
        sql: `SELECT COUNT(*) AS cnt FROM [${name}];`,
      });
      const count = result.rows?.[0]?.[0] ?? '?';
      ddlCountBtn.innerHTML = `<i class="fa-solid fa-hashtag me-1" aria-hidden="true"></i>${Number(count).toLocaleString()} rows`;
    } catch (err) {
      ddlCountBtn.innerHTML = '<i class="fa-solid fa-hashtag me-1" aria-hidden="true"></i>Count';
      bsToastError('Count failed: ' + err.message);
    } finally {
      ddlCountBtn.disabled = false;
    }
  });

  // DDL: Copy DDL text
  on(ddlCopyBtn, 'click', async () => {
    await copyToClipboard(ddlCode.textContent);
    bsToastSuccess('DDL copied');
  });

  // DDL: Export full table to CSV
  on(ddlExportCsvBtn, 'click', async () => {
    const name = currentDdlObject;
    if (!name) return;
    await exportTableToCSV(name);
  });

  // Settings modal: populate on open
  if (settingsModal) {
    on(settingsModal, 'show.bs.modal', () => {
      textToSqlProviderInput.value = settings.textToSqlProvider;
      textToSqlModelInput.value = settings.textToSqlModel;
      textToSqlApiKeyInput.value = settings.textToSqlApiKey;
      textToSqlCustomEndpointInput.value = settings.textToSqlCustomEndpoint;
      textToSqlCustomAuthTypeInput.value = settings.textToSqlCustomAuthType;
      toggleCustomEndpointField();
    });
  }

  if (textToSqlProviderInput) {
    on(textToSqlProviderInput, 'change', toggleCustomEndpointField);
  }

  if (saveSettingsBtn) {
    on(saveSettingsBtn, 'click', () => {
      const provider = textToSqlProviderInput.value || 'chatgpt';
      const customEndpoint = (textToSqlCustomEndpointInput?.value || '').trim();
      if (provider === 'custom' && !isValidHttpUrl(customEndpoint)) {
        bsToastError(
          'Custom endpoint must be a full URL (e.g. https://openrouter.ai/api/v1/chat/completions)'
        );
        return;
      }
      settings.textToSqlProvider = provider;
      settings.textToSqlModel = textToSqlModelInput.value.trim();
      settings.textToSqlApiKey = textToSqlApiKeyInput.value.trim();
      settings.textToSqlCustomEndpoint = customEndpoint;
      settings.textToSqlCustomAuthType =
        (textToSqlCustomAuthTypeInput?.value || 'Bearer').trim() || 'Bearer';

      const modal = window.bootstrap.Modal.getInstance(settingsModal);
      if (modal) modal.hide();
      bsToastSuccess('Settings saved');
    });
  }
}

// ===== Helpers =====

function toggleCustomEndpointField() {
  if (!textToSqlProviderInput || !textToSqlCustomEndpointGroup) return;
  textToSqlCustomEndpointGroup.classList.toggle(
    'd-none',
    textToSqlProviderInput.value !== 'custom'
  );
}

function isValidHttpUrl(url) {
  try {
    const p = new window.URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.classList.toggle('text-danger', isError);
  statusText.classList.toggle('text-muted', !isError);
}

function showBsTab(tabEl) {
  if (tabEl && window.bootstrap) {
    new window.bootstrap.Tab(tabEl).show();
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
