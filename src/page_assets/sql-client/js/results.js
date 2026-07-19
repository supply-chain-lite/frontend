/**
 * Results panel rendering, CSV export, and clipboard utilities.
 *
 * Handles the results table, non-SELECT query messages, a loading indicator,
 * and CSV/TSV export.
 */

let lastColumns = null;
let lastRows = null;

const resultsPlaceholder = document.getElementById('results-placeholder');
const resultsTableWrap = document.getElementById('results-table-wrap');
const resultsThead = document.getElementById('results-thead');
const resultsTbody = document.getElementById('results-tbody');
const resultsMessage = document.getElementById('results-message');
const resultsToolbar = document.getElementById('results-toolbar');
const rowCount = document.getElementById('row-count');
const copyResultsBtn = document.getElementById('copy-results-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');

export function initResults() {
  copyResultsBtn.addEventListener('click', async () => {
    if (!lastColumns || !lastRows) return;
    await copyToClipboard(resultsToTSV(lastColumns, lastRows));
  });

  exportCsvBtn.addEventListener('click', () => {
    if (!lastColumns || !lastRows) return;
    downloadCSV(resultsToCSV(lastColumns, lastRows), 'results.csv');
  });
}

export function renderResultsTable(columns, rows) {
  lastColumns = columns;
  lastRows = rows;

  resultsPlaceholder.classList.add('d-none');
  resultsMessage.classList.add('d-none');
  resultsTableWrap.classList.remove('d-none');
  resultsToolbar.classList.remove('d-none');
  resultsToolbar.classList.add('d-flex');
  rowCount.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''}`;

  resultsThead.innerHTML = '<tr>' + columns.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr>';
  resultsTbody.innerHTML = rows
    .map(
      (row) =>
        '<tr>' +
        row
          .map((cell) => {
            if (cell === null) return '<td><i class="text-muted">NULL</i></td>';
            const raw = String(cell);
            const title = escAttr(prettyIfJson(raw));
            return `<td title="${title}">${esc(raw)}</td>`;
          })
          .join('') +
        '</tr>'
    )
    .join('');
}

export function showMessage(text, isError = false) {
  lastColumns = null;
  lastRows = null;
  resultsPlaceholder.classList.add('d-none');
  resultsTableWrap.classList.add('d-none');
  resultsToolbar.classList.add('d-none');
  resultsToolbar.classList.remove('d-flex');
  resultsMessage.classList.remove('d-none');
  resultsMessage.className = `d-block m-0 p-3 text-sm${isError ? ' text-danger' : ' text-muted'}`;
  resultsMessage.textContent = text;
}

export function clearResults() {
  lastColumns = null;
  lastRows = null;
  resultsPlaceholder.className = 'text-center text-muted fst-italic p-4';
  resultsPlaceholder.textContent = 'Run a query to see results';
  resultsPlaceholder.classList.remove('d-none');
  resultsTableWrap.classList.add('d-none');
  resultsToolbar.classList.add('d-none');
  resultsToolbar.classList.remove('d-flex');
  resultsMessage.classList.add('d-none');
  resultsThead.innerHTML = '';
  resultsTbody.innerHTML = '';
}

export function showResultsLoader() {
  clearResults();
  resultsPlaceholder.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
    '<span>Running query...</span>';
}

// ===== Utilities =====

function resultsToTSV(columns, rows) {
  const header = columns.join('\t');
  const body = rows
    .map((row) => row.map((c) => (c === null ? '' : String(c).replace(/\t/g, ' '))).join('\t'))
    .join('\n');
  return header + '\n' + body;
}

function resultsToCSV(columns, rows) {
  const header = columns.map(escCsv).join(',');
  const body = rows.map((row) => row.map(escCsv).join(',')).join('\n');
  return header + '\n' + body;
}

function escCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function downloadCSV(csvString, filename) {
  const blob = new window.Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export async function copyToClipboard(text) {
  try {
    await window.navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function prettyIfJson(str) {
  const trimmed = str.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 0) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // not valid JSON — return as-is
    }
  }
  return str;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Like esc() but also encodes double quotes for use inside attribute values. */
function escAttr(str) {
  return esc(str).replace(/"/g, '&quot;');
}
