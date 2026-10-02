import api from '@/common/js/api';
import { clearFilePreview, loadFilePreview } from './preview.js';

const explorer = document.querySelector('#fileExplorer');
const collapseFoldersButton = document.querySelector('#collapse-folders');
const rootForm = document.querySelector('#root-form');
const rootInput = document.querySelector('#root-input');
const rootError = document.querySelector('#root-error');
const settingsForm = document.querySelector('#s3-settings-form');
const settingsError = document.querySelector('#settings-error');
const settingsModalElement = document.querySelector('#s3SettingsModal');
const previewEmpty = document.querySelector('#preview-empty');
const previewContent = document.querySelector('#preview-content');
const previewIcon = document.querySelector('#preview-icon');
const previewKind = document.querySelector('#preview-kind');
const previewName = document.querySelector('#preview-name');
const previewPath = document.querySelector('#preview-path');
const previewActions = document.querySelector('#preview-actions');
const copyFolderUrlButton = document.querySelector('#copy-folder-url');
const setFolderRootButton = document.querySelector('#set-folder-root');
const downloadFileButton = document.querySelector('#download-file');
const copyFolderUrlStatus = document.querySelector('#copy-folder-url-status');
const previewDetails = document.querySelector('#preview-details');

const folderContents = new Map();
const loadingFolders = new Map();
const pendingRequests = new Map();
let requestGeneration = 0;
let selectedPath = '';
let rootLocation = null;
const ROOT_STORAGE_KEY = 's3-browser-root';
const SETTINGS_STORAGE_KEY = 's3-browser-settings';

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveRoot(root) {
  try {
    localStorage.setItem(ROOT_STORAGE_KEY, root);
  } catch {
    // Keep the current session usable when browser storage is unavailable.
  }
}

function parseS3Location(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^s3:\/\/([^/?#]+)(?:\/([^?#]*))?\/?$/i);
  if (!match) throw new Error('Enter an S3 path such as s3://bucket-name/folder.');
  const bucket = decodeURIComponent(match[1]);
  if (!bucket) throw new Error('Enter an S3 bucket, such as s3://bucket-name/path.');
  return { bucket, prefix: normalizePrefix(decodeURIComponent(match[2] || '')) };
}

const tree = document.createElement('div');
tree.className = 's3-tree';
tree.setAttribute('aria-label', 'S3 file tree');
explorer.appendChild(tree);

function normalizePrefix(prefix) {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function locationPath(prefix = rootLocation.prefix) {
  return `s3://${rootLocation.bucket}${prefix ? `/${prefix}` : ''}`;
}

function getItemPrefix(item, parentPrefix) {
  let key = String(item.key || item.name).replace(/^\/+|\/+$/g, '');
  if (key.startsWith('s3://')) {
    const location = parseS3Location(key);
    key = location.prefix;
  }
  if (!parentPrefix || key === parentPrefix || key.startsWith(`${parentPrefix}/`)) return key;
  return normalizePrefix(`${parentPrefix}/${key}`);
}

function makeButton({ name, path, type, childCount, expanded = false }) {
  const button = document.createElement('button');
  const icon = document.createElement('i');
  const label = document.createElement('span');

  button.type = 'button';
  button.className = `s3-tree-node ${type === 'folder' ? 's3-tree-folder' : 's3-tree-file'}`;
  button.dataset.path = path;
  button.dataset.prefix =
    path === locationPath('')
      ? rootLocation.prefix
      : path.slice(`s3://${rootLocation.bucket}/`.length);
  button.dataset.type = type;
  button.dataset.name = name;
  button.dataset.childCount = String(childCount ?? 0);
  button.classList.toggle('active', path === selectedPath);
  button.setAttribute('aria-selected', String(path === selectedPath));
  if (type === 'folder') button.setAttribute('aria-expanded', String(expanded));

  icon.className = `fa-solid ${type === 'file' ? 'fa-file' : expanded ? 'fa-folder-open' : 'fa-folder'}`;
  icon.setAttribute('aria-hidden', 'true');
  label.textContent = name;
  button.append(icon, label);
  return button;
}

function appendFolderContents(list, prefix) {
  const items = folderContents.get(prefix) || [];
  if (loadingFolders.has(prefix)) {
    const status = document.createElement('li');
    status.className = 'small text-muted py-1';
    status.textContent = 'Loading…';
    list.appendChild(status);
    return;
  }
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'small text-muted py-1';
    empty.textContent = 'Empty folder';
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const itemPrefix = item.type === 'folder' ? getItemPrefix(item, prefix) : '';
    const path =
      item.type === 'folder' ? locationPath(itemPrefix) : `${locationPath(prefix)}/${item.name}`;
    const isExpanded = item.type === 'folder' && expandedFolders.has(itemPrefix);
    const children = folderContents.get(itemPrefix);
    const listItem = document.createElement('li');
    const button = makeButton({
      name: item.name,
      path,
      type: item.type,
      childCount: children?.length ?? 0,
      expanded: isExpanded,
    });
    button.dataset.key = item.key;
    button.dataset.size = item.size ?? '';
    button.dataset.lastModified = item.last_modified ?? '';
    listItem.appendChild(button);

    if (isExpanded) {
      const childList = document.createElement('ul');
      childList.className = 's3-tree-list';
      childList.setAttribute('role', 'group');
      appendFolderContents(childList, itemPrefix);
      listItem.appendChild(childList);
    }
    list.appendChild(listItem);
  });
}

const expandedFolders = new Set();

function renderTree() {
  if (!rootLocation) return;
  tree.replaceChildren();
  const rootPath = locationPath();
  const isExpanded = expandedFolders.has(rootLocation.prefix);
  const rootList = document.createElement('ul');
  rootList.className = 's3-tree-list s3-tree-list-root';
  rootList.setAttribute('role', 'tree');
  const rootItem = document.createElement('li');
  const rootButton = makeButton({
    name: rootPath,
    path: rootPath,
    type: 'folder',
    childCount: folderContents.get(rootLocation.prefix)?.length ?? 0,
    expanded: isExpanded,
  });
  rootButton.dataset.prefix = rootLocation.prefix;
  rootButton.setAttribute('aria-label', `${rootPath}, folder`);
  rootItem.appendChild(rootButton);

  if (isExpanded) {
    const childList = document.createElement('ul');
    childList.className = 's3-tree-list';
    childList.setAttribute('role', 'group');
    appendFolderContents(childList, rootLocation.prefix);
    rootItem.appendChild(childList);
  }

  rootList.appendChild(rootItem);
  tree.appendChild(rootList);
}

function showFolderError(message) {
  rootError.textContent = message;
  rootError.classList.remove('d-none');
}

function invalidateFolderRequests() {
  requestGeneration += 1;
  folderContents.clear();
  loadingFolders.clear();
}

async function loadFolder(prefix) {
  const normalizedPrefix = normalizePrefix(prefix);
  const generation = requestGeneration;
  const bucket = rootLocation.bucket;
  const requestKey = `${generation}:${bucket}/${normalizedPrefix}`;
  if (folderContents.has(normalizedPrefix)) return folderContents.get(normalizedPrefix);
  const settings = readSettings();
  if (!settings.endpointURL) {
    showFolderError('Add an endpoint URL in Settings before browsing this bucket.');
    return;
  }
  if (pendingRequests.has(requestKey)) return pendingRequests.get(requestKey);

  loadingFolders.set(normalizedPrefix, generation);
  renderTree();
  const request = api
    .post('/s3/list', {
      endpoint: settings.endpointURL,
      bucket,
      prefix: normalizedPrefix,
      ...(settings.region ? { region: settings.region } : {}),
      access_key: settings.accessKey || '',
      secret_key: settings.secretKey || '',
    })
    .then((response) => {
      if (generation !== requestGeneration) return [];
      const files = Array.isArray(response?.files) ? response.files : [];
      folderContents.set(normalizedPrefix, files);
      rootError.classList.add('d-none');
      rootError.textContent = '';
      return files;
    })
    .catch((error) => {
      if (generation !== requestGeneration) throw error;
      showFolderError(error?.data?.detail || `Unable to list ${locationPath(normalizedPrefix)}.`);
      throw error;
    })
    .finally(() => {
      pendingRequests.delete(requestKey);
      if (loadingFolders.get(normalizedPrefix) === generation) {
        loadingFolders.delete(normalizedPrefix);
      }
      if (generation === requestGeneration) {
        renderTree();
        if (selectedPath === locationPath(normalizedPrefix)) updatePreviewDetails();
      }
    });

  pendingRequests.set(requestKey, request);
  return request;
}

function updatePreviewDetails() {
  const button = tree.querySelector('.s3-tree-node.active');
  if (!button) return;
  if (button.dataset.type === 'folder') {
    const count = folderContents.get(button.dataset.prefix)?.length ?? 0;
    button.dataset.childCount = String(count);
    previewDetails.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    return;
  }
  const details = [];
  if (button.dataset.size) details.push(`${Number(button.dataset.size).toLocaleString()} bytes`);
  if (button.dataset.lastModified) {
    details.push(new Date(button.dataset.lastModified).toLocaleString());
  }
  previewDetails.textContent = details.join(' · ') || 'File';
}

function selectNode(button) {
  selectedPath = button.dataset.path;
  tree.querySelectorAll('.s3-tree-node').forEach((nodeButton) => {
    const isActive = nodeButton.dataset.path === selectedPath;
    nodeButton.classList.toggle('active', isActive);
    nodeButton.setAttribute('aria-selected', String(isActive));
  });

  const isFolder = button.dataset.type === 'folder';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${isFolder ? 'fa-folder-open' : 'fa-file'}`;
  previewIcon.replaceChildren(icon);
  previewKind.textContent = isFolder ? 'Folder' : 'File';
  previewName.textContent = button.dataset.name;
  previewPath.textContent = selectedPath;
  previewActions.classList.toggle('d-none', !button.dataset.type);
  previewActions.classList.toggle('d-flex', Boolean(button.dataset.type));
  setFolderRootButton.classList.toggle('d-none', !isFolder);
  downloadFileButton.classList.toggle('d-none', isFolder);
  downloadFileButton.disabled = isFolder || !button.dataset.key;
  copyFolderUrlStatus.textContent = '';
  previewEmpty.classList.add('d-none');
  previewContent.classList.remove('d-none');
  updatePreviewDetails();

  if (isFolder) {
    clearFilePreview();
    const prefix = button.dataset.prefix;
    expandedFolders.add(prefix);
    renderTree();
    loadFolder(prefix).catch(() => {});
  } else {
    loadFilePreview({
      key: button.dataset.key,
      bucket: rootLocation.bucket,
      settings: readSettings(),
    });
  }
}

tree.addEventListener('click', (event) => {
  const nodeButton = event.target.closest('.s3-tree-node');
  if (nodeButton) selectNode(nodeButton);
});

copyFolderUrlButton.addEventListener('click', async () => {
  try {
    await window.navigator.clipboard.writeText(selectedPath);
    copyFolderUrlStatus.textContent = 'S3 URL copied to clipboard.';
  } catch {
    showFolderError('Unable to copy the S3 URL. Check clipboard permissions.');
  }
});

setFolderRootButton.addEventListener('click', () => {
  openRoot(selectedPath, true);
});

downloadFileButton.addEventListener('click', async () => {
  const selectedButton = tree.querySelector('.s3-tree-node.active');
  const key = selectedButton?.dataset.key;
  if (!key || selectedButton.dataset.type !== 'file') return;

  const settings = readSettings();
  if (!settings.endpointURL) {
    showFolderError('Add an endpoint URL in Settings before downloading this file.');
    return;
  }

  const downloadWindow = window.open('about:blank', '_blank');
  if (downloadWindow) downloadWindow.opener = null;
  downloadFileButton.disabled = true;
  copyFolderUrlStatus.textContent = 'Preparing download…';
  try {
    const { presigned_url: presignedUrl } = await api.post('/s3/presigned-url', {
      endpoint: settings.endpointURL,
      bucket: rootLocation.bucket,
      key,
      ...(settings.region ? { region: settings.region } : {}),
      access_key: settings.accessKey || '',
      secret_key: settings.secretKey || '',
    });
    if (!presignedUrl) throw new Error('The server did not return a download URL.');

    if (downloadWindow) {
      downloadWindow.location.href = presignedUrl;
    } else {
      const link = document.createElement('a');
      link.href = presignedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    copyFolderUrlStatus.textContent = `Opened ${previewName.textContent} using its presigned URL.`;
  } catch (error) {
    downloadWindow?.close();
    copyFolderUrlStatus.textContent =
      error?.data?.detail || error.message || 'Unable to prepare the download.';
  } finally {
    downloadFileButton.disabled = false;
  }
});

collapseFoldersButton.addEventListener('click', () => {
  expandedFolders.clear();
  if (rootLocation) expandedFolders.add(rootLocation.prefix);
  renderTree();
});

function openRoot(value, persist = false) {
  try {
    rootLocation = parseS3Location(value);
    invalidateFolderRequests();
    rootInput.value = `s3://${rootLocation.bucket}${rootLocation.prefix ? `/${rootLocation.prefix}` : ''}`;
    if (persist) saveRoot(rootInput.value);
    rootError.classList.add('d-none');
    rootError.textContent = '';
    expandedFolders.clear();
    expandedFolders.add(rootLocation.prefix);
    selectedPath = '';
    clearFilePreview();
    previewActions.classList.add('d-none');
    previewActions.classList.remove('d-flex');
    setFolderRootButton.classList.add('d-none');
    downloadFileButton.classList.add('d-none');
    copyFolderUrlStatus.textContent = '';
    previewContent.classList.add('d-none');
    previewEmpty.classList.remove('d-none');
    renderTree();
    loadFolder(rootLocation.prefix).catch(() => {});
  } catch (error) {
    showFolderError(error.message);
  }
}

rootForm.addEventListener('submit', (event) => {
  event.preventDefault();
  openRoot(rootInput.value, true);
});

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const endpointURL = document.querySelector('#s3-endpoint').value.trim();
  try {
    const endpoint = new window.URL(endpointURL);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error();
    const settings = {
      endpointURL: endpointURL.replace(/\/+$/, ''),
      region: document.querySelector('#s3-region').value.trim(),
      accessKey: document.querySelector('#s3-access-key').value,
      secretKey: document.querySelector('#s3-secret-key').value,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    invalidateFolderRequests();
    settingsError.classList.add('d-none');
    window.bootstrap.Modal.getOrCreateInstance(settingsModalElement).hide();
    if (rootLocation) openRoot(rootInput.value, false);
  } catch {
    settingsError.textContent = 'Enter a valid endpoint URL, including http:// or https://.';
    settingsError.classList.remove('d-none');
  }
});

settingsModalElement.addEventListener('show.bs.modal', () => {
  const settings = readSettings();
  document.querySelector('#s3-endpoint').value = settings.endpointURL || '';
  document.querySelector('#s3-region').value = settings.region || '';
  document.querySelector('#s3-access-key').value = settings.accessKey || '';
  document.querySelector('#s3-secret-key').value = settings.secretKey || '';
  settingsError.classList.add('d-none');
});

let savedRoot = '';
try {
  savedRoot = localStorage.getItem(ROOT_STORAGE_KEY) || '';
} catch {
  // Fall back to the page's initial root when browser storage is unavailable.
}
const initialRoot = savedRoot || rootInput.value;
rootInput.value = initialRoot;
openRoot(initialRoot, false);
