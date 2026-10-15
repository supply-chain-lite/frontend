import api from '@/common/js/api';

const previewSection = document.querySelector('#file-data-preview');
const previewHead = document.querySelector('#file-preview-head');
const previewBody = document.querySelector('#file-preview-body');
const previewCount = document.querySelector('#file-preview-count');
const previewStatus = document.querySelector('#file-preview-status');
const imagePreviewWrap = document.querySelector('#image-preview-wrap');
const imagePreview = document.querySelector('#image-preview');
const previewTableWrap = document.querySelector('#file-preview-table-wrap');
const previewableExtensions = new Set(['csv', 'xls', 'xlsx', 'json', 'parquet', 'txt']);
const imageExtensions = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jfif',
  'jpeg',
  'jpg',
  'jpe',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);
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
  imagePreview.removeAttribute('src');
  imagePreview.alt = '';
  imagePreviewWrap.classList.add('d-none');
  previewTableWrap.classList.remove('d-none');
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
  const isImage = imageExtensions.has(extension);
  if (!isImage && !previewableExtensions.has(extension)) {
    clearFilePreview();
    return;
  }

  const requestId = ++activeRequest;
  previewSection.classList.remove('d-none');
  clearPreviewContent();
  imagePreview.removeAttribute('src');
  imagePreview.alt = '';
  imagePreviewWrap.classList.toggle('d-none', !isImage);
  previewTableWrap.classList.toggle('d-none', isImage);

  if (!settings.endpointURL) {
    previewStatus.textContent = 'Add an endpoint URL in Settings to preview this file.';
    return;
  }

  previewStatus.textContent = isImage ? 'Loading image…' : 'Loading preview…';
  try {
    if (isImage) {
      const { presigned_url: presignedUrl } = await api.post('/s3/presigned-url', {
        endpoint: settings.endpointURL,
        bucket,
        key,
        ...(settings.region ? { region: settings.region } : {}),
        access_key: settings.accessKey || '',
        secret_key: settings.secretKey || '',
      });
      if (requestId !== activeRequest) return;
      if (!presignedUrl) throw new Error('The server did not return a preview URL.');

      imagePreview.alt = key.split('/').pop() || 'S3 image preview';
      imagePreview.addEventListener(
        'load',
        () => {
          if (requestId === activeRequest) previewStatus.textContent = '';
        },
        { once: true },
      );
      imagePreview.addEventListener(
        'error',
        () => {
          if (requestId === activeRequest) previewStatus.textContent = 'Unable to load this image.';
        },
        { once: true },
      );
      imagePreview.src = new window.URL(presignedUrl).href;
      return;
    }

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
