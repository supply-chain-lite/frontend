const explorer = document.querySelector('#fileExplorer');
const rootForm = document.querySelector('#root-form');
const rootInput = document.querySelector('#root-input');
const previewEmpty = document.querySelector('#preview-empty');
const previewContent = document.querySelector('#preview-content');
const previewIcon = document.querySelector('#preview-icon');
const previewKind = document.querySelector('#preview-kind');
const previewName = document.querySelector('#preview-name');
const previewPath = document.querySelector('#preview-path');
const previewDetails = document.querySelector('#preview-details');

const sampleObjects = [
  {
    name: 'incoming',
    type: 'folder',
    children: [
      {
        name: '2026-09',
        type: 'folder',
        children: [
          { name: 'orders.csv', type: 'file' },
          { name: 'inventory.csv', type: 'file' },
        ],
      },
      { name: 'supplier-list.csv', type: 'file' },
    ],
  },
  {
    name: 'processed',
    type: 'folder',
    children: [
      { name: 'inventory-snapshot.parquet', type: 'file' },
      {
        name: 'forecasts',
        type: 'folder',
        children: [
          { name: 'demand-forecast.csv', type: 'file' },
          { name: 'demand-forecast2.csv', type: 'file' },
          { name: 'demand-forecast3.csv', type: 'file' },
          { name: 'demand-forecast4.csv', type: 'file' },
          { name: 'demand-forecast5.csv', type: 'file' },
          { name: 'demand-forecast6.csv', type: 'file' },
          { name: 'demand-forecast7.csv', type: 'file' },
        ],
      },
    ],
  },
  { name: 'README.txt', type: 'file' },
];

const expandedFolders = new Set();
let selectedPath = '';
const tree = document.createElement('div');
tree.className = 's3-tree';
tree.setAttribute('aria-label', 'S3 file tree');
explorer.appendChild(tree);

function createNode(node, parentPath) {
  const path = `${parentPath.replace(/\/$/, '')}/${node.name}`;
  const listItem = document.createElement('li');
  const hasChildren = node.type === 'folder' && node.children?.length > 0;
  const isExpanded = expandedFolders.has(path);
  const button = document.createElement('button');
  const icon = document.createElement('i');
  const label = document.createElement('span');

  button.type = 'button';
  button.className = `s3-tree-node ${node.type === 'folder' ? 's3-tree-folder' : 's3-tree-file'}`;
  button.dataset.path = path;
  button.dataset.type = node.type;
  button.dataset.name = node.name;
  button.dataset.childCount = String(node.children?.length ?? 0);
  button.classList.toggle('active', path === selectedPath);
  button.setAttribute('aria-selected', String(path === selectedPath));
  if (node.type === 'folder') button.setAttribute('aria-expanded', String(isExpanded));
  if (node.type === 'folder' && !hasChildren)
    button.setAttribute('aria-label', `${node.name}, empty folder`);

  icon.className = `fa-solid ${node.type === 'file' ? 'fa-file' : isExpanded ? 'fa-folder-open' : 'fa-folder'}`;
  icon.setAttribute('aria-hidden', 'true');
  label.textContent = node.name;
  button.append(icon, label);
  listItem.appendChild(button);

  if (hasChildren && isExpanded) {
    const childList = document.createElement('ul');
    childList.className = 's3-tree-list';
    childList.setAttribute('role', 'group');
    node.children.forEach((child) => childList.appendChild(createNode(child, path)));
    listItem.appendChild(childList);
  }

  return listItem;
}

function renderTree() {
  const rootPath = rootInput.value.trim().replace(/\/$/, '') || 'S3 root';
  const rootExpanded = expandedFolders.has(rootPath);
  tree.replaceChildren();
  const rootList = document.createElement('ul');
  rootList.className = 's3-tree-list s3-tree-list-root';
  rootList.setAttribute('role', 'tree');
  const rootItem = document.createElement('li');
  const rootButton = document.createElement('button');
  const rootIcon = document.createElement('i');
  const rootLabel = document.createElement('span');

  rootButton.type = 'button';
  rootButton.className = 's3-tree-node s3-tree-folder';
  rootButton.dataset.path = rootPath;
  rootButton.dataset.type = 'folder';
  rootButton.dataset.name = rootPath;
  rootButton.dataset.childCount = String(sampleObjects.length);
  rootButton.classList.toggle('active', rootPath === selectedPath);
  rootButton.setAttribute('aria-selected', String(rootPath === selectedPath));
  rootButton.setAttribute('aria-expanded', String(rootExpanded));
  rootButton.setAttribute('aria-label', `${rootPath}, folder`);
  rootIcon.className = `fa-solid ${rootExpanded ? 'fa-folder-open' : 'fa-folder'}`;
  rootIcon.setAttribute('aria-hidden', 'true');
  rootLabel.textContent = rootPath;
  rootButton.append(rootIcon, rootLabel);
  rootItem.appendChild(rootButton);

  if (rootExpanded) {
    const childList = document.createElement('ul');
    childList.className = 's3-tree-list';
    childList.setAttribute('role', 'group');
    sampleObjects.forEach((child) => childList.appendChild(createNode(child, rootPath)));
    rootItem.appendChild(childList);
  }

  rootList.appendChild(rootItem);
  tree.appendChild(rootList);
}

function toggleFolder(button) {
  const path = button.dataset.path;
  if (expandedFolders.has(path)) expandedFolders.delete(path);
  else expandedFolders.add(path);
  renderTree();
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
  previewDetails.textContent = isFolder
    ? `${button.dataset.childCount} ${button.dataset.childCount === '1' ? 'item' : 'items'}`
    : button.dataset.name.includes('.')
      ? `.${button.dataset.name.split('.').pop()} file`
      : 'File';
  previewEmpty.classList.add('d-none');
  previewContent.classList.remove('d-none');
}

tree.addEventListener('dblclick', (event) => {
  const folderButton = event.target.closest('.s3-tree-folder');
  if (folderButton && folderButton.dataset.path) toggleFolder(folderButton);
});

// Keep folders keyboard-operable while mouse users use double-click to expand.
tree.addEventListener('click', (event) => {
  const nodeButton = event.target.closest('.s3-tree-node');
  if (!nodeButton) return;

  selectNode(nodeButton);
  if (nodeButton.classList.contains('s3-tree-folder') && event.detail === 0) {
    toggleFolder(nodeButton);
  }
});

rootForm.addEventListener('submit', (event) => {
  event.preventDefault();
  expandedFolders.clear();
  const rootPath = rootInput.value.trim().replace(/\/$/, '') || 'S3 root';
  expandedFolders.add(rootPath);
  selectedPath = '';
  previewContent.classList.add('d-none');
  previewEmpty.classList.remove('d-none');
  renderTree();
});

expandedFolders.add(rootInput.value.trim().replace(/\/$/, ''));
renderTree();
