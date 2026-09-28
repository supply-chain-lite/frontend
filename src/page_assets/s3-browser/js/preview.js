import api from '@/common/js/api';

const previewSection = document.querySelector('#file-data-preview');
const previewHead = document.querySelector('#file-preview-head');
const previewBody = document.querySelector('#file-preview-body');
const previewCount = document.querySelector('#file-preview-count');
const previewStatus = document.querySelector('#file-preview-status');
const previewableExtensions = new Set(['csv', 'xls', 'xlsx', 'json', 'parquet', 'txt']);
let activeRequest = 0;

function getExtension(key) {
  return String(key).split('.').pop().toLowerCase();
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function clearPreviewContent() {
  previewHead.replaceChildren();
  previewBody.replaceChildren();
  previewCount.textContent = '';
  previewCount.classList.remove('d-none');
  previewStatus.textContent = '';
}

export function clearFilePreview() {
  activeRequest += 1;
  previewSection.classList.add('d-none');
  clearPreviewContent();
}

function renderPreview(columns, rows) {
  const header = document.createDocumentFragment();
  columns.forEach((column) => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = column;
    header.appendChild(cell);
  });
  previewHead.replaceChildren(header);

  const body = document.createDocumentFragment();
  rows.forEach((row) => {
    const tableRow = document.createElement('tr');
    columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatCell(row?.[column]);
      tableRow.appendChild(cell);
    });
    body.appendChild(tableRow);
  });
  previewBody.replaceChildren(body);
}

export async function loadFilePreview({ key, bucket, settings }) {
  const extension = getExtension(key);
  if (!previewableExtensions.has(extension)) {
    clearFilePreview();
    return;
  }

  const requestId = ++activeRequest;
  previewSection.classList.remove('d-none');
  clearPreviewContent();

  if (!settings.endpointURL) {
    previewStatus.textContent = 'Add an endpoint URL in Settings to preview this file.';
    return;
  }

  previewStatus.textContent = 'Loading preview…';
  try {
    const response = await api.post('/s3/preview', {
      endpoint: settings.endpointURL,
      bucket,
      key,
      ...(settings.region ? { region: settings.region } : {}),
      access_key: settings.accessKey || '',
      secret_key: settings.secretKey || '',
    });
    if (requestId !== activeRequest) return;

    const columns = Array.isArray(response?.columns) ? response.columns : [];
    const rows = Array.isArray(response?.rows) ? response.rows : [];
    renderPreview(columns, rows);
    previewCount.textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
    previewCount.classList.toggle('d-none', Boolean(response?.truncated));
    previewStatus.textContent = response?.truncated ? 'Showing the first 500 rows.' : '';
    if (columns.length === 0)
      previewStatus.textContent = 'This file has no tabular data to display.';
  } catch (error) {
    if (requestId !== activeRequest) return;
    previewStatus.textContent = error?.data?.detail || 'Unable to preview this file.';
  }
}
