import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // table-specific styles
import api from '@/common/js/api';
import { saveRedirectUrl, handleAccessControlRedirect, currentPageUrl } from '@/common/js/auth';
import { getTableHeaders, fetchTableData, fetchColumnFormats, initTableControls } from './tables';
import { initTableModals } from './tableModals';
import { bsToastError } from '../../../common/js/bsToast';
import { $, ready } from '@/common/js/dom';

/**
 * Synchronizes header row heights by setting the CSS variable `--head1-height` on each `.scl-table .head2 th` to match the computed height of `.scl-table .head1`.
 *
 * If `.scl-table .head1` is not present, the function does nothing.
 */
function setStickyHead2() {
  const head1 = document.querySelector('.scl-table .head1');
  if (!head1) return;
  const height = head1.getBoundingClientRect().height;
  document.querySelectorAll('.scl-table .head2 th').forEach((th) => {
    th.style.setProperty('--head1-height', `${height}px`);
  });
}

/**
 * Adjusts the max-height of the table container (#sclTableDiv) so it fits the viewport.
 *
 * If the container exists, sets its inline `maxHeight` CSS property to the larger of 220px
 * or the available vertical space calculated as window.innerHeight minus the container's
 * top offset and a 60px bottom gap.
 */
function autosizeSclTable() {
  const tableContainer = document.getElementById('sclTableDiv');
  if (!tableContainer) return;

  const rect = tableContainer.getBoundingClientRect();
  const bottomGap = 60;
  const available = window.innerHeight - rect.top - bottomGap;

  tableContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
}

const appState = {
  user: null,

  modelName: '',

  projectName: '',

  tableName: '',

  displayName: '',

  currentPage: 1,

  currentRowCount: 0,

  totalRowCount: null,

  pageSize: 1000,

  selectedColumn: null,

  sortColumns: [],

  columnFormats: {},

  /** { [columnName]: string[] }  — column → filter values */
  selectFilters: {},

  /** { [columnName]: string }  — column → text filter value */
  textFilters: {},

  /** Array of tuples: [columnName, dataType] */
  columnNames: [],

  /** All columns from the API (superset of columnNames) */
  allColumns: [],
};

ready(async () => {
  const params = new URLSearchParams(window.location.search);

  const tableName = params.get('table');
  if (tableName) {
    appState.tableName = tableName;
  } else {
    bsToastError(
      'No table specified',
      'Please specify a table in the URL, e.g. <code>?table=my_table</code>'
    );
    return;
  }

  const projectName = params.get('project');
  if (projectName) {
    appState.projectName = projectName;
  } else {
    bsToastError(
      'No project specified',
      'Please specify a project in the URL, e.g. <code>?project=my_project</code>'
    );
    return;
  }

  const modelName = params.get('model');
  if (modelName) {
    appState.modelName = modelName;
  } else {
    bsToastError(
      'No model specified',
      'Please specify a model in the URL, e.g. <code>?model=my_model</code>'
    );
    return;
  }

  const displayName = params.get('displayName');
  if (displayName) {
    appState.displayName = displayName;
  } else {
    appState.displayName = appState.tableName;
  }

  document.title = `${appState.displayName}`;

  $('#tableDisplayName').textContent =
    `${appState.projectName} > ${appState.modelName} > ${appState.displayName}`;

  let user;
  try {
    user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
      appState.user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
      if (handleAccessControlRedirect(user)) return;
    } else {
      saveRedirectUrl();
      window.location.href = '/login.html';
      return;
    }
  } catch {
    saveRedirectUrl();
    window.location.href = '/login.html';
    return;
  }

  await Promise.all([getTableHeaders(appState), fetchColumnFormats(appState)]);
  await fetchTableData(appState);

  autosizeSclTable();
  setStickyHead2();
  const modalEl = document.getElementById('selectColumnsModal');
  modalEl.addEventListener('hidden.bs.modal', () => {
    autosizeSclTable();
    setStickyHead2();
  });
  window.addEventListener('resize', () => {
    autosizeSclTable();
    setStickyHead2();
  });

  initTableControls(appState);
  initTableModals(appState);
});
