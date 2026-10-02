/**
 * SQL editor tab management.
 *
 * Manages multi-tab SQL editing with CodeMirror and SQLite-aware completion.
 * Each tab stores its own SQL content. Tabs can be added/removed/switched.
 */

import { Compartment } from '@codemirror/state';
import { sql, SQLDialect, SQLite } from '@codemirror/lang-sql';
import { basicSetup, EditorView } from 'codemirror';

const sqlDialect = SQLDialect.define({ ...SQLite.spec, identifierQuotes: '"' });

let tabIdCounter = 0;
const editorTabs = []; // [{ id, title, sql }]
let activeTabId = null;
let activeTabChangeHandler = null;
let tabCloseHandler = null;

const editorTabsUl = document.getElementById('editor-tabs');
const addTabBtn = document.getElementById('add-tab-btn');
const editorHost = document.getElementById('sql-editor');
const schemaCompartment = new Compartment();
let editorView;

export function initEditor() {
  editorView = new EditorView({
    parent: editorHost,
    extensions: [
      basicSetup,
      schemaCompartment.of(sql({ dialect: sqlDialect, schema: {}, upperCaseKeywords: true })),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const currentTab = editorTabs.find((tab) => tab.id === activeTabId);
        if (currentTab) currentTab.sql = update.state.doc.toString();
      }),
    ],
  });
  editorView.contentDOM.setAttribute('aria-label', 'SQL query editor');
  editorView.contentDOM.setAttribute('spellcheck', 'false');

  addTab();
  addTabBtn.addEventListener('click', () => addTab());
}

export function addTab(sql = '') {
  const id = ++tabIdCounter;
  const title = `Query ${id}`;
  editorTabs.push({ id, title, sql });
  switchTab(id);
  renderTabs();
  editorView.focus();
}

export function getActiveTabId() {
  return activeTabId;
}

export function setActiveTabChangeHandler(handler) {
  activeTabChangeHandler = handler;
}

export function setTabCloseHandler(handler) {
  tabCloseHandler = handler;
}

export function setEditorValue(sql) {
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: sql },
    selection: { anchor: sql.length },
  });
  const cur = editorTabs.find((t) => t.id === activeTabId);
  if (cur) cur.sql = sql;
}

export function getEditorValue() {
  return editorView.state.doc.toString();
}

export function getEditorCursorPosition() {
  return editorView.state.selection.main.head;
}

export function insertEditorText(text) {
  const { from, to } = editorView.state.selection.main;
  editorView.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
}

export function setEditorSchema(schema) {
  editorView.dispatch({
    effects: schemaCompartment.reconfigure(
      sql({ dialect: sqlDialect, schema, upperCaseKeywords: true })
    ),
  });
}

function removeTab(id) {
  if (editorTabs.length <= 1) return;
  const idx = editorTabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  editorTabs.splice(idx, 1);
  if (tabCloseHandler) tabCloseHandler(id);
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
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: tab.sql },
    selection: { anchor: tab.sql.length },
  });
  if (activeTabChangeHandler) activeTabChangeHandler(id);
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
      editorView.focus();
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
