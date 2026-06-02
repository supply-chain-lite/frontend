/**
 * SQL editor tab management.
 *
 * Manages multi-tab SQL editing using the native <textarea id="sql-editor">.
 * Each tab stores its own SQL content. Tabs can be added/removed/switched.
 */

let tabIdCounter = 0;
const editorTabs = []; // [{ id, title, sql }]
let activeTabId = null;

const editorTabsUl = document.getElementById('editor-tabs');
const addTabBtn = document.getElementById('add-tab-btn');
const sqlEditorEl = document.getElementById('sql-editor');

export function initEditor() {
  addTab();
  addTabBtn.addEventListener('click', () => addTab());
  sqlEditorEl.addEventListener('input', () => {
    const cur = editorTabs.find((t) => t.id === activeTabId);
    if (cur) cur.sql = sqlEditorEl.value;
  });
}

export function addTab(sql = '') {
  const id = ++tabIdCounter;
  const title = `Query ${id}`;
  editorTabs.push({ id, title, sql });
  switchTab(id);
  renderTabs();
  sqlEditorEl.focus();
}

export function setEditorValue(sql) {
  sqlEditorEl.value = sql;
  const cur = editorTabs.find((t) => t.id === activeTabId);
  if (cur) cur.sql = sql;
}

function removeTab(id) {
  if (editorTabs.length <= 1) return;
  const idx = editorTabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  editorTabs.splice(idx, 1);
  if (activeTabId === id) {
    const next = editorTabs[Math.min(idx, editorTabs.length - 1)];
    switchTab(next.id);
  }
  renderTabs();
}

function switchTab(id) {
  const tab = editorTabs.find((t) => t.id === id);
  if (!tab) return;
  activeTabId = id;
  sqlEditorEl.value = tab.sql;
}

function renderTabs() {
  editorTabsUl.innerHTML = '';
  for (const tab of editorTabs) {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const btn = document.createElement('button');
    btn.className = `nav-link editor-tab-btn${tab.id === activeTabId ? ' active' : ''}`;
    btn.type = 'button';
    btn.textContent = tab.title;
    btn.title = tab.title;
    btn.addEventListener('click', () => {
      switchTab(tab.id);
      renderTabs();
      sqlEditorEl.focus();
    });

    li.appendChild(btn);

    if (editorTabs.length > 1) {
      const close = document.createElement('span');
      close.className = 'editor-tab-close';
      close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      close.title = 'Close tab';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTab(tab.id);
      });
      btn.appendChild(close);
    }

    editorTabsUl.appendChild(li);
  }
}
