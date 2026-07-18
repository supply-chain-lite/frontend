import api from '@/common/js/api';
import { bsToastWarning, bsToastSuccess } from '@/common/js/bsToast';
import {
  defaultFormatType,
  isNumericType,
  isIntegerType,
  isTextType,
  excelSerialToDate,
  excelSerialToDatetime,
  dateToExcelSerial,
  datetimeToExcelSerial,
  formatCellValue,
  areArraysEqual,
  sanitizeCellForClipboard,
  updateFilterIcon,
  bindDropdownItemToggle,
  getDateColumnsInTextFilters,
  getNumericFiltersInTextFilters,
} from './commons';

let tableLoaderDepth = 0;

/** Return a pretty-printed JSON string if `str` is valid JSON, otherwise return `str` as-is. */
function prettyIfJson(str) {
  const trimmed = str.trim();
  if (trimmed.length > 0 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // not valid JSON — fall through
    }
  }
  return str;
}

/** CSS class applied to the row currently being edited. */
const EDITING_CLASS = 'scl-row-editing';

/** Stores the state of the row being edited (null when idle). */
let activeEdit = null;

/**
 * Makes the global page loader visible and increments the internal reference counter.
 *
 * If the '#pageLoader' element is not present, the function does nothing. It increments the module-level
 * `tableLoaderDepth`, removes the 'd-none' class from the loader, and sets `aria-hidden` to "false"
 * so the loader remains visible across nested async operations.
 *
 * @param {string} [message] - Optional message to display in the loader. Defaults to the existing text.
 */
function showTableLoader(message) {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  tableLoaderDepth += 1;
  loader.classList.remove('d-none');
  loader.setAttribute('aria-hidden', 'false');
  if (message !== undefined) {
    const msgEl = loader.querySelector('.page-loader__content .small');
    if (msgEl) msgEl.textContent = message;
  }
}

/**
 * Decrements the table-loader reference counter and hides the #pageLoader element when the counter reaches zero.
 *
 * If the #pageLoader element is not present this function does nothing. The internal counter is never allowed to go below zero; when it becomes zero the loader receives `d-none` and `aria-hidden="true"`.
 */
function hideTableLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  tableLoaderDepth = Math.max(0, tableLoaderDepth - 1);
  if (tableLoaderDepth > 0) return;

  loader.classList.add('d-none');
  loader.setAttribute('aria-hidden', 'true');
  const msgEl = loader.querySelector('.page-loader__content .small');
  if (msgEl) msgEl.textContent = 'Loading table data...';
}

/**
 * Load table column metadata and construct the header rows with filter controls, sort buttons,
 * and row-selection UI.
 *
 * Fetches column headers from the server, updates appState.columnNames, clears any selected column,
 * rebuilds the two header rows and the table body (clearing stale listeners), and wires handlers for:
 * sorting, column selection, per-column text and LOV filters, filter dropdown population, and
 * select-all / per-row checkboxes. When a text filter is applied this function resets pagination to
 * the first page, clears the total row count, hides the summary and add-row footers, and triggers a
 * data refresh.
 *
 * @param {Object} appState - Application state; must include `tableName`, `projectName`, and `modelName`.
 *   Mutated properties:
 *   - `columnNames` — set to the returned headers (array of [columnName, dataType] tuples).
 *   - `selectedColumn` — set to `null`.
 *   - `textFilters` — may be created or updated when users enter text filters.
 *   - `currentPage` — set to `1` when filters change.
 *   - `totalRowCount` — cleared when filters change.
 */
async function getTableHeaders(appState) {
  showTableLoader();
  try {
    const { headers } = await api.post('/tables/headers', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
    });

    appState.columnNames = headers; // [[columnName, dataType], ...]
    appState.selectedColumn = null;

    // Populate head1: checkbox column + one <th> per column name
    const oldhead1 = document.getElementById('sclTableHead1');
    const head1 = oldhead1.cloneNode(true);
    oldhead1.replaceWith(head1);
    head1.id = 'sclTableHead1';

    head1.innerHTML =
      '<th style="width: 40px"><input type="checkbox" class="form-check-input" aria-label="Select all rows" /></th>';
    for (const [colName] of headers) {
      const th = document.createElement('th');
      th.style.minWidth = '80px';
      const div = document.createElement('div');
      div.className = 'd-flex justify-content-between align-items-center';
      const span = document.createElement('span');
      span.textContent = colName;
      const sortBtn = document.createElement('button');
      sortBtn.type = 'button';
      sortBtn.className = 'scl-sort-btn btn btn-link btn-sm p-0 text-dark';
      sortBtn.setAttribute('aria-label', `Sort by ${colName}`);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-sort';
      sortBtn.appendChild(icon);
      div.append(span, sortBtn);
      th.appendChild(div);
      head1.appendChild(th);
    }

    // Sort: click the <i> icon to cycle sort direction (none → ASC → DESC → none)
    head1.addEventListener('click', (e) => {
      const sortBtn = e.target.closest('.scl-sort-btn');
      if (sortBtn) {
        const th = sortBtn.closest('th');
        if (!th || !head1.contains(th)) return;
        const colIndex = [...head1.children].indexOf(th);
        if (colIndex <= 0) return;
        toggleColumnSort(appState, colIndex);
        return;
      }

      // Column selection: click a column header to select/deselect the column
      const th = e.target.closest('th');
      if (!th || !head1.contains(th)) return;
      const colIndex = [...head1.children].indexOf(th);
      if (colIndex <= 0) return; // Skip checkbox column
      selectColumn(appState, colIndex);
    });

    // Populate head2: empty checkbox column + one filter <th> per column
    const oldhead2 = document.getElementById('sclTableHead2');
    const head2 = oldhead2.cloneNode(true);
    oldhead2.replaceWith(head2);
    head2.id = 'sclTableHead2';
    head2.innerHTML = '<th></th>';
    let i = 0;
    for (const [colName] of headers) {
      i += 1;
      const th = document.createElement('th');
      th.style.minWidth = '80px';
      // th.style.overflow = 'hidden';
      const div = document.createElement('div');
      div.className = 'input-group input-group-sm my-1';
      div.style.flexWrap = 'nowrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.dataset.col = colName; // Safe: dataset escapes automatically
      input.value = appState.textFilters?.[colName] ?? '';
      input.style.minWidth = '0';
      input.setAttribute('aria-label', `Filter ${colName}`);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'input-group-text px-1';
      btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      btn.setAttribute('aria-label', `Select filter for ${colName}`);
      btn.setAttribute('data-bs-toggle', 'dropdown');
      btn.setAttribute('data-bs-auto-close', 'outside');
      btn.setAttribute('aria-expanded', 'false');
      btn.dataset.colIndex = String(i); // 1-based index to match columnNames
      updateFilterIcon(btn, colName in (appState.selectFilters ?? {}));

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu dropdown-menu-start';
      const form1 = document.createElement('form');
      form1.style.fontSize = '0.8rem';
      form1.innerHTML = `<a class="dropdown-item px-2 py-0">
                          <div class="form-check">
                          <input class="form-check-input selectAll" type="checkbox" />
                          <label class="form-check-label">Select All</label>
                          </div>
                        </a>
                        <div class="dropdown-divider"></div>
                        <fieldset class="lovValuesFieldset">
                        </fieldset>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item d-flex px-2 py-0 clearOKBtn">
                        </div>`;
      dropdown.appendChild(form1);
      const saInput = form1.querySelector('.selectAll');
      if (saInput) {
        const saId = `filter-select-all-${colName.replace(/\W/g, '_')}-${i}`;
        saInput.id = saId;
        const saLabel = saInput.closest('.form-check')?.querySelector('label');
        if (saLabel) saLabel.htmlFor = saId;
      }
      div.append(input, btn, dropdown);
      th.appendChild(div);
      head2.appendChild(th);
    }

    // Text-filter: on Enter, update appState.textFilters and refresh data
    head2.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'text') return;

      const col = input.dataset.col;
      const val = input.value.trim();

      if (!appState.textFilters) appState.textFilters = {};

      if (val) {
        appState.textFilters[col] = val;
      } else {
        delete appState.textFilters[col];
      }
      appState.currentPage = 1; // Reset to first page on filter change, since current page may become invalid
      appState.totalRowCount = null;
      hideSummaryRow();
      closeAddRow();
      fetchTableData(appState);
    });

    head2.addEventListener('show.bs.dropdown', (e) => {
      const currentButton = e.target;

      for (const otherButton of head2.querySelectorAll('[data-bs-toggle="dropdown"]')) {
        if (otherButton === currentButton) continue;

        otherButton.closest('th')?.classList.remove('dropdown-open');
        window.bootstrap.Dropdown.getOrCreateInstance(otherButton).hide();
      }

      currentButton.closest('th')?.classList.add('dropdown-open');

      populateFilterDropdown(
        currentButton.nextElementSibling,
        currentButton.previousElementSibling.dataset.col,
        appState,
        Number(currentButton.dataset.colIndex)
      );
    });

    head2.addEventListener('hide.bs.dropdown', (e) => {
      e.target.closest('th')?.classList.remove('dropdown-open');
    });

    // Select-all checkbox: toggle all body checkboxes
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    selectAllCb.addEventListener('change', () => {
      const tbody = document.getElementById('sclTableBody');
      for (const cb of tbody.querySelectorAll('input[type="checkbox"]')) {
        cb.checked = selectAllCb.checked;
      }
    });

    const oldtbody = document.getElementById('sclTableBody');
    const tbody = oldtbody.cloneNode(true);
    oldtbody.replaceWith(tbody);
    tbody.id = 'sclTableBody';

    // Body checkbox: sync select-all when individual rows change
    tbody.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const all = tbody.querySelectorAll('input[type="checkbox"]');
      const checked = tbody.querySelectorAll('input[type="checkbox"]:checked');
      selectAllCb.checked = all.length > 0 && checked.length === all.length;
      selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
    });

    // Clear body
    tbody.innerHTML = '';

    // Restore sort icons from appState
    refreshSortIcons(appState);
  } finally {
    hideTableLoader();
  }
}

/**
 * Cycle sort direction for a column: none → ASC → DESC → none.
 *
 * Supports multi-column sort. Each click cycles the column through
 * ASC → DESC → removed. Columns not yet in the sort list are appended;
 * removing a column preserves the order of the remaining sorts.
 *
 * @param {Object} appState - Application state; reads `columnNames`, mutates `sortColumns` and `currentPage`.
 * @param {number} colIndex - 1-based column index in the table (0 is the checkbox column).
 */
function toggleColumnSort(appState, colIndex) {
  const colName = appState.columnNames[colIndex - 1]?.[0];
  if (!colName) return;

  if (!appState.sortColumns) appState.sortColumns = [];

  const idx = appState.sortColumns.findIndex(([name]) => name === colName);

  if (idx === -1) {
    // Not sorted yet — add as ASC
    appState.sortColumns.push([colName, 'ASC']);
  } else if (appState.sortColumns[idx][1] === 'ASC') {
    // ASC → DESC
    appState.sortColumns[idx] = [colName, 'DESC'];
  } else {
    // DESC → remove from sort list
    appState.sortColumns.splice(idx, 1);
  }

  appState.currentPage = 1;
  refreshSortIcons(appState);
  fetchTableData(appState);
}

const SORT_ICON_MAP = {
  ASC: 'fa-solid fa-sort-up',
  DESC: 'fa-solid fa-sort-down',
};
const SORT_ICON_DEFAULT = 'fa-solid fa-sort';

/**
 * Update all sort icons in head1 to reflect the current `appState.sortColumns`.
 *
 * @param {Object} appState - Application state; reads `sortColumns` and `columnNames`.
 */
function refreshSortIcons(appState) {
  const head1 = document.getElementById('sclTableHead1');
  if (!head1) return;

  const sortMap = new Map(appState.sortColumns ?? []);

  // Skip the first child (checkbox column)
  for (let i = 0; i < appState.columnNames.length; i++) {
    const th = head1.children[i + 1];
    if (!th) continue;
    const icon = th.querySelector('i');
    if (!icon) continue;
    const colName = appState.columnNames[i][0];
    const dir = sortMap.get(colName);
    icon.className = dir ? SORT_ICON_MAP[dir] : SORT_ICON_DEFAULT;
    const sortBtn = th.querySelector('.scl-sort-btn');
    if (sortBtn) {
      const dirLabel = dir === 'ASC' ? ', ascending' : dir === 'DESC' ? ', descending' : '';
      sortBtn.setAttribute('aria-label', `Sort by ${colName}${dirLabel}`);
    }
  }
}

/**
 * Toolbar buttons that mutate table data or structure. These are disabled when
 * the table is rendered in non-editable mode (no rowid column returned).
 */
const EDIT_CONTROL_IDS = ['deleteRowsBtn', 'updateColumnBtn', 'addRowBtn', 'addColumnBtn'];

/**
 * Enable or disable the row/column mutation toolbar controls
 * (`deleteRowsBtn`, `updateColumnBtn`, `addRowBtn`, `addColumnBtn`).
 *
 * When disabled, the buttons are also given `aria-disabled="true"` and hidden
 * via the Bootstrap `d-none` utility class so they neither react to clicks nor
 * appear in the toolbar.
 *
 * @param {boolean} enabled - `true` to enable and show the controls; `false` to disable and hide them.
 */
function setEditControlsEnabled(enabled) {
  for (const id of EDIT_CONTROL_IDS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', String(!enabled));
    btn.classList.toggle('d-none', !enabled);
  }
  const head1 = document.getElementById('sclTableHead1');
  const selectAllCb = head1?.querySelector('input[type="checkbox"]');
  if (selectAllCb) selectAllCb.disabled = !enabled;
}

/**
 * Fetches the current page of table rows and renders them into the table body.
 *
 * Updates appState.currentRowCount, cancels any active inline edit, replaces the contents of #sclTableBody with the fetched rows, reapplies column highlighting, and updates pagination state/UI.
 *
 * The rendering mode is determined by inspecting the first row:
 * - If the first row has `columnNames.length + 1` elements, the leading value is treated as the
 *   rowid and the table is rendered as editable/selectable (existing behavior: each row gets a
 *   checkbox carrying the rowid plus dblclick/keydown inline-edit handlers).
 * - If the first row has exactly `columnNames.length` elements, there is no rowid; the table is
 *   rendered with the same DOM structure (leading cell preserved) but without checkboxes or
 *   inline-edit handlers, making it non-editable and non-selectable. The row/column mutation
 *   toolbar buttons (delete rows, update column, add row, add column) are also hidden/disabled.
 * - If the first row has fewer than `columnNames.length` elements, an error is thrown.
 *
 * @param {Object} appState - Application state used to build the request and control rendering. Required properties: `tableName`, `projectName`, `modelName`, `currentPage`, `pageSize`, `selectFilters`, `textFilters`, `columnNames`, and `sortColumns`. May include `columnFormats`.
 */
async function fetchTableData(appState) {
  showTableLoader();
  try {
    const dateCols = getDateColumnsInTextFilters(appState);
    const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
    const column_names = appState.columnNames.map(([name]) => name);
    const { data } = await api.post('/tables/data', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      page_number: appState.currentPage,
      page_size: appState.pageSize,
      select_filters: appState.selectFilters,
      text_filters: textFilters,
      numeric_filters: numericFilters,
      sort_columns: appState.sortColumns,
      date_columns: dateCols,
      column_names,
    });

    appState.currentRowCount = data.length;
    cancelEditing();
    const tbody = document.getElementById('sclTableBody');
    tbody.innerHTML = '';

    // Determine rendering mode from the first row's length:
    //   n === columns + 1 → editable (first element is rowid)
    //   n === columns     → non-editable, non-selectable (no rowid)
    //   else      → malformed response, raise an error
    const numColumns = appState.columnNames.length;
    let hasRowId = false;
    if (data.length > 0) {
      const firstRowLength = data[0].length;
      if (firstRowLength === numColumns + 1) {
        hasRowId = true;
      } else if (firstRowLength === numColumns) {
        hasRowId = false;
      } else {
        throw new Error(
          `fetchTableData: row has ${firstRowLength} element(s) but table has ${numColumns} column(s); expected ${numColumns} or ${numColumns + 1}.`
        );
      }
    }

    // Disable row/column mutation controls when the table is non-editable
    // (i.e. rows carry no rowid and therefore cannot be targeted for updates).
    setEditControlsEnabled(hasRowId);

    for (const row of data) {
      const tr = document.createElement('tr');
      let values;

      // Leading cell: preserves table structure in both modes.
      const leadTd = document.createElement('td');
      if (hasRowId) {
        const [rowid, ...rest] = row;
        values = rest;
        // Checkbox cell with rowid
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.value = rowid;
        leadTd.appendChild(checkbox);
      } else {
        // Non-editable, non-selectable: no rowid, no checkbox; keep empty cell.
        values = row;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.disabled = true;
        leadTd.appendChild(checkbox);
      }
      tr.appendChild(leadTd);

      // Data cells
      for (let i = 0; i < values.length; i++) {
        const td = document.createElement('td');
        const val = values[i];
        const [colName, dataType] = appState.columnNames[i] ?? [];
        const fmt = appState.columnFormats?.[colName];
        const { text, align } = formatCellValue(val, dataType, fmt);
        const rawStr = val !== null && val !== undefined ? String(val) : '';
        td.dataset.rawValue = rawStr;
        td.title = prettyIfJson(rawStr);
        td.textContent = text;
        if (align) td.style.textAlign = align;
        tr.appendChild(td);
      }

      if (hasRowId) {
        tr.tabIndex = 0;
        // Inline edit: dblclick → edit mode; keydown → save / cancel / tab
        tr.addEventListener('dblclick', (e) => {
          if (e.target.closest('input[type="checkbox"]')) return;
          if (activeEdit?.tr === tr) return;
          startEditing(tr, appState);
        });

        tr.addEventListener('keydown', (e) => {
          // Enter on the focused row itself (not an input inside it) starts editing
          if (e.key === 'Enter' && e.target === tr && !activeEdit) {
            e.preventDefault();
            startEditing(tr, appState);
            return;
          }
          if (!activeEdit || activeEdit.tr !== tr) return;
          const input = e.target.closest('.scl-inline-edit');
          if (!input) return;

          if (e.key === 'Enter') {
            e.preventDefault();
            saveEditing(appState);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditing();
          } else if (e.key === 'Tab') {
            const inputs = [...tr.querySelectorAll('.scl-inline-edit')];
            const idx = inputs.indexOf(input);
            const leavingRow =
              (e.shiftKey && idx === 0) || (!e.shiftKey && idx === inputs.length - 1);
            if (!leavingRow) {
              e.preventDefault();
              inputs[e.shiftKey ? idx - 1 : idx + 1].focus();
            }
          }
        });
      }

      tbody.appendChild(tr);
    }

    refreshColumnHighlight(appState);

    await populatePaginationInfo(appState);
  } finally {
    hideTableLoader();
  }
}

/**
 * Initialize the page's refresh button so clicking it clears table filters, resets related UI, and reloads the table data.
 *
 * The click handler clears in-memory filters and pagination/selection state, resets header UI (header text inputs, header select-all checkbox, and per-column filter icons), and triggers a fresh table data fetch.
 * @param {Object} appState - Table application state. Mutated fields: `appState.textFilters` is set to `{}`, `appState.selectFilters` is set to `{}`, `appState.currentPage` is set to `1`, and `appState.selectedColumn` is set to `null`. Other fields are read by the subsequent data fetch.
 */
function initRefreshDataBtn(appState) {
  const refreshButton = document.getElementById('refreshDataBtn');

  refreshButton.addEventListener('click', async () => {
    if (refreshButton.disabled) return;

    refreshButton.disabled = true;

    appState.textFilters = {};
    appState.selectFilters = {};
    appState.sortColumns = [];
    appState.currentPage = 1; // Reset to first page on refresh, since filters may change total pages and current page may become invalid
    appState.selectedColumn = null;
    appState.totalRowCount = null;

    try {
      clearColumnHighlight();
      refreshSortIcons(appState);
      hideSummaryRow();
      closeAddRow();

      const head1 = document.getElementById('sclTableHead1');
      const selectAllCb = head1.querySelector('input[type="checkbox"]');
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;

      // Clear filter inputs in head2
      const head2 = document.getElementById('sclTableHead2');
      for (const input of head2.querySelectorAll('input[type="text"]')) {
        input.value = '';
      }

      // Reset all dropdown filter icons back to chevron
      for (const btn of head2.querySelectorAll('[data-bs-toggle="dropdown"]')) {
        updateFilterIcon(btn, false);
      }

      await fetchTableData(appState);
    } finally {
      refreshButton.disabled = false;
    }
  });
}

/**
 * Populate a column's filter dropdown with distinct values and wire its selection controls.
 *
 * Loads distinct values for `colName`, renders checkbox items and Select All/OK/Clear controls
 * inside the provided dropdown element, synchronizes the Select All state with individual items,
 * updates `appState.selectFilters` when OK or Clear are used, updates the filter icon, and triggers
 * a table data refresh (and resets pagination) when the effective filter set changes.
 *
 * @param {HTMLElement} dropdown - The dropdown menu element for the column's filter (contains `.lovValuesFieldset`, `.selectAll`, and `.clearOKBtn`).
 * @param {string} colName - The column name whose distinct values should be loaded and edited.
 * @param {Object} appState - Application state object (reads/writes properties such as `tableName`, `projectName`, `modelName`, `pageSize`, `selectFilters`, `textFilters`, and `currentPage`).
 * @param {number} i - Index of the column for unique ID generation.
 */
async function populateFilterDropdown(dropdown, colName, appState, i) {
  const fieldset = dropdown.querySelector('.lovValuesFieldset');
  const selectAllCb = dropdown.querySelector('.selectAll');
  const toggleButton = dropdown.previousElementSibling;
  const selectAllItem = selectAllCb.closest('.dropdown-item');
  const rawValues = [];

  fieldset.innerHTML = '<div class="text-center py-2"><small>Loading…</small></div>';

  let values;
  try {
    const dateCols = getDateColumnsInTextFilters(appState);
    const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
    const res = await api.post('/tables/distinct-values', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      column_name: colName,
      page_size: appState.pageSize,
      select_filters: appState.selectFilters,
      text_filters: textFilters,
      numeric_filters: numericFilters,
      date_columns: dateCols,
    });
    values = res.values ?? [];
  } catch {
    fieldset.innerHTML =
      '<div class="text-center py-2 text-danger"><small>Failed to load</small></div>';
    return;
  }

  const activeSet = new Set(appState.selectFilters?.[colName] ?? []);
  const colMeta = appState.columnNames.find(([name]) => name === colName);
  const dataType = colMeta ? colMeta[1] : '';
  const fmt = appState.columnFormats?.[colName];

  fieldset.innerHTML = '';
  dropdown.querySelector('.lov-truncated-note')?.remove();
  for (const val of values) {
    const a = document.createElement('a');
    a.className = 'dropdown-item px-2 py-0';
    const wrapper = document.createElement('div');
    wrapper.className = 'form-check';
    const cb = document.createElement('input');
    cb.className = 'form-check-input lov-cb';
    cb.type = 'checkbox';
    const rawIndex = rawValues.push(val) - 1;
    cb.dataset.rawIndex = String(rawIndex);
    if (activeSet.has(val)) cb.checked = true;
    const cbId = `lov-cb-${colName.replace(/\W/g, '_')}-${rawIndex}-${i}`;
    cb.id = cbId;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.textContent = val !== null ? formatCellValue(val, dataType, fmt).text : '(blank)';
    label.htmlFor = cbId;
    wrapper.append(cb, label);
    bindDropdownItemToggle(a, cb);
    a.appendChild(wrapper);
    fieldset.appendChild(a);
  }

  if (values.length >= appState.pageSize) {
    const note = document.createElement('div');
    note.className = 'text-start text-muted py-1 px-2 lov-truncated-note';
    note.innerHTML = `<small>Showing first ${values.length} values `;
    fieldset.insertAdjacentElement('afterend', note);
  }

  // Clone & replace the entire dropdown-item wrapper to remove stale listeners
  // from prior loads (both the click handler on the item and change handler on the checkbox)
  const newSelectAllItem = selectAllItem.cloneNode(true);
  selectAllItem.parentNode.replaceChild(newSelectAllItem, selectAllItem);
  const newSelectAll = newSelectAllItem.querySelector('.selectAll');

  // Sync select-all checkbox state with individual checkboxes
  const syncSelectAll = () => {
    const all = fieldset.querySelectorAll('.lov-cb');
    const checked = fieldset.querySelectorAll('.lov-cb:checked');
    newSelectAll.checked = all.length > 0 && checked.length === all.length;
    newSelectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  };
  syncSelectAll();

  bindDropdownItemToggle(newSelectAllItem, newSelectAll);
  newSelectAll.addEventListener('change', () => {
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = newSelectAll.checked;
    }
  });

  fieldset.onchange = syncSelectAll;

  const OkBtn = document.createElement('button');
  OkBtn.type = 'button';
  OkBtn.className = 'btn btn-sm btn-dark rounded-2 ms-auto';
  OkBtn.textContent = 'OK';
  const ClearBtn = document.createElement('button');
  ClearBtn.type = 'button';
  ClearBtn.className = 'btn btn-sm btn-secondary rounded-2';
  ClearBtn.textContent = 'Clear';
  const clearOKContainer = dropdown.querySelector('.clearOKBtn');
  clearOKContainer.innerHTML = '';
  clearOKContainer.appendChild(ClearBtn);
  clearOKContainer.appendChild(OkBtn);

  OkBtn.addEventListener('click', () => {
    const selected = [...fieldset.querySelectorAll('.lov-cb:checked')].map(
      (cb) => rawValues[Number(cb.dataset.rawIndex)]
    );
    if (!appState.selectFilters) appState.selectFilters = {};
    const previousSelected = appState.selectFilters[colName] ?? [];
    let filterChanged;

    if (selected.length) {
      filterChanged = !areArraysEqual(previousSelected, selected);
      if (filterChanged) {
        appState.selectFilters[colName] = selected;
      }
    } else {
      filterChanged = previousSelected.length > 0;
      if (filterChanged) {
        delete appState.selectFilters[colName];
      }
    }
    updateFilterIcon(toggleButton, colName in (appState.selectFilters ?? {}));
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      appState.currentPage = 1;
      appState.totalRowCount = null;
      hideSummaryRow();
      closeAddRow();
      fetchTableData(appState);
    }
  });

  ClearBtn.addEventListener('click', () => {
    const filterChanged = (appState.selectFilters?.[colName] ?? []).length > 0;
    delete appState.selectFilters?.[colName];
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = false;
    }
    newSelectAll.checked = false;
    newSelectAll.indeterminate = false;
    updateFilterIcon(toggleButton, false);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      appState.currentPage = 1;
      appState.totalRowCount = null;
      hideSummaryRow();
      closeAddRow();
      fetchTableData(appState);
    }
  });
}

const COL_SELECTED_CLASS = 'scl-col-selected';

/**
 * Select or deselect a table column by its 1-based index (accounting for the
 * leading checkbox column). Highlights the column across both header rows and
 * all body rows, and updates `appState.selectedColumn`.
 *
 * Clicking the already-selected column deselects it.
 *
 * @param {Object} appState - Application state; reads `columnNames`, sets `selectedColumn`.
 * @param {number} colIndex - 1-based column index in the table (0 is the checkbox column).
 */
function selectColumn(appState, colIndex) {
  const colName = appState.columnNames[colIndex - 1]?.[0];
  if (!colName) return;

  const isDeselect = appState.selectedColumn === colName;
  clearColumnHighlight();

  if (isDeselect) {
    appState.selectedColumn = null;
    return;
  }

  appState.selectedColumn = colName;
  applyColumnHighlight(colIndex);
}

/**
 * Clears the column selection highlight from all table header and body cells.
 */
function clearColumnHighlight() {
  for (const cell of document.querySelectorAll(`.${COL_SELECTED_CLASS}`)) {
    cell.classList.remove(COL_SELECTED_CLASS);
  }
}

/**
 * Add the column-selected CSS class to header and body cells at the specified column index.
 * @param {number} colIndex - Zero-based column index matching the table's DOM columns (includes the leading checkbox column).
 */
function applyColumnHighlight(colIndex) {
  const head1 = document.getElementById('sclTableHead1');
  const head2 = document.getElementById('sclTableHead2');
  const tbody = document.getElementById('sclTableBody');

  head1.children[colIndex]?.classList.add(COL_SELECTED_CLASS);
  head2.children[colIndex]?.classList.add(COL_SELECTED_CLASS);
  for (const row of tbody.rows) {
    row.cells[colIndex]?.classList.add(COL_SELECTED_CLASS);
  }
}

/**
 * Restore visual highlight for the currently selected column after the table body is re-rendered.
 *
 * If the previously selected column no longer exists in `appState.columnNames`, clears `appState.selectedColumn`.
 * @param {Object} appState - Application state; uses `selectedColumn` and `columnNames`.
 */
function refreshColumnHighlight(appState) {
  if (!appState.selectedColumn) return;
  const idx = appState.columnNames.findIndex(([name]) => name === appState.selectedColumn);
  if (idx === -1) {
    appState.selectedColumn = null;
    return;
  }
  applyColumnHighlight(idx + 1); // +1 for the leading checkbox column
}

/**
 * Update pagination UI and appState.totalRowCount based on the currently fetched rows and, when necessary, a remote total row count.
 *
 * Updates the contents and visibility of #paginationInfo and #paginationControls, sets #paginationPageInput and #paginationTotalPages, and assigns appState.totalRowCount when determinable. If appState.currentRowCount is less than pageSize the function computes and sets the total from the current page; if currentRowCount equals pageSize it may call the server endpoint `/tables/row-count` to obtain the total. On request failure the pagination UI is hidden and the info cleared.
 *
 * @param {Object} appState - Application state object.
 * @param {number} appState.currentRowCount - Number of rows returned for the current page (required to decide pagination state).
 * @param {number} appState.pageSize - Number of rows per page.
 * @param {number} appState.currentPage - Current page number (1-based).
 * @param {string} appState.tableName - Table name used when requesting total row count.
 * @param {string} appState.projectName - Project name used when requesting total row count.
 * @param {string} appState.modelName - Model name used when requesting total row count.
 * @param {Object} [appState.selectFilters] - Current select filters passed to the row-count request.
 * @param {Object} [appState.textFilters] - Current text filters passed to the row-count request.
 * @param {number} [appState.totalRowCount] - Will be set to the computed or fetched total row count.
 */
async function populatePaginationInfo(appState) {
  if (appState.currentRowCount === undefined) return;

  const paginationControls = document.getElementById('paginationControls');
  const paginationInfo = document.getElementById('paginationInfo');

  if (appState.currentRowCount < appState.pageSize) {
    // Fewer rows than page size — we're on the last (or only) page

    const totalRowCount = (appState.currentPage - 1) * appState.pageSize + appState.currentRowCount;
    appState.totalRowCount = totalRowCount;

    if (appState.currentPage === 1) {
      paginationInfo.textContent = `${totalRowCount} Row${totalRowCount !== 1 ? 's' : ''}`;
      paginationControls.classList.remove('d-flex');
      paginationControls.classList.add('d-none');
    } else {
      const start = (appState.currentPage - 1) * appState.pageSize + 1;
      paginationInfo.textContent = `${start}-${totalRowCount} of ${totalRowCount} Rows`;
      const pageInput = document.getElementById('paginationPageInput');
      if (pageInput) pageInput.value = appState.currentPage;
    }
    return;
  }

  // currentRowCount === pageSize — there may be more rows, fetch total
  paginationInfo.textContent = 'Fetching row count…';
  try {
    if (appState.currentPage === 1 && appState.totalRowCount === null) {
      const dateCols = getDateColumnsInTextFilters(appState);
      const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
      const { row_count: totalRowCount } = await api.post('/tables/row-count', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        select_filters: appState.selectFilters,
        text_filters: textFilters,
        numeric_filters: numericFilters,
        date_columns: dateCols,
      });

      appState.totalRowCount = totalRowCount;
    }
    const totalPages = Math.ceil(appState.totalRowCount / appState.pageSize);
    const start = (appState.currentPage - 1) * appState.pageSize + 1;
    const end = Math.min(start + appState.pageSize - 1, appState.totalRowCount);

    paginationInfo.textContent = `${start}-${end} of ${appState.totalRowCount} Rows`;

    // Show pagination controls and update page info
    paginationControls.classList.remove('d-none');
    paginationControls.classList.add('d-flex');
    const pageInput = document.getElementById('paginationPageInput');
    if (pageInput) pageInput.value = appState.currentPage;

    const totalPagesSpan = document.getElementById('paginationTotalPages');
    if (totalPagesSpan) totalPagesSpan.textContent = `of ${totalPages}`;
  } catch {
    paginationInfo.textContent = '';
    paginationControls.classList.remove('d-flex');
    paginationControls.classList.add('d-none');
  }
}

/**
 * Initialize pagination controls and the page-number input to navigate between table pages.
 *
 * Updates appState.currentPage (clamped to the valid page range) and triggers table data reloads.
 * Changing pages also clears the header select-all checkbox state. Pressing Enter in the page input navigates to the typed page if numeric.
 * @param {Object} appState - Application state; reads `totalRowCount` and `pageSize`, and sets `currentPage`.
 */
function initPaginationControls(appState) {
  const getTotalPages = () =>
    Math.max(1, Math.ceil((appState.totalRowCount ?? 0) / appState.pageSize));

  const goToPage = (page) => {
    const totalPages = getTotalPages();
    const target = Math.max(1, Math.min(page, totalPages));
    if (target === appState.currentPage) return;
    appState.currentPage = target;
    const head1 = document.getElementById('sclTableHead1');
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    if (selectAllCb) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
    fetchTableData(appState);
  };

  document.getElementById('paginationFirstBtn').addEventListener('click', () => goToPage(1));
  document
    .getElementById('paginationPrevBtn')
    .addEventListener('click', () => goToPage(appState.currentPage - 1));
  document
    .getElementById('paginationNextBtn')
    .addEventListener('click', () => goToPage(appState.currentPage + 1));
  document
    .getElementById('paginationLastBtn')
    .addEventListener('click', () => goToPage(getTotalPages()));

  document.getElementById('paginationPageInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) {
      goToPage(val);
    } else {
      e.target.value = appState.currentPage;
    }
  });
}

/**
 * Initialize the Remove Column button
 *
 * If no column is selected (`appState.selectedColumn` is null), a warning toast is shown.
 * Otherwise the selected column is removed from the visible column list, the updated order
 * is persisted via the server, related filters are cleaned up, and the table is refreshed.
 *
 * @param {Object} appState - Application state.
 */
function initRemoveColumnBtn(appState) {
  const removeBtn = document.getElementById('removeColumnBtn');

  removeBtn.addEventListener('click', async () => {
    if (!appState.selectedColumn) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colToRemove = appState.selectedColumn;
    const remainingCols = appState.columnNames
      .map(([name]) => name)
      .filter((name) => name !== colToRemove);

    if (remainingCols.length === 0) {
      bsToastWarning('Cannot remove the last column');
      return;
    }

    // Persist updated column order
    await api.post('/tables/set-columns-order', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      column_names: remainingCols,
    });

    // Clean up filters for the removed column
    delete appState.selectFilters?.[colToRemove];
    delete appState.textFilters?.[colToRemove];
    appState.sortColumns = (appState.sortColumns ?? []).filter(([name]) => name !== colToRemove);

    appState.currentPage = 1;
    appState.selectedColumn = null;
    appState.totalRowCount = null;

    await getTableHeaders(appState);
    await fetchTableData(appState);
  });
}

/**
 * Initialize the Increase / Decrease Decimal toolbar buttons.
 *
 * Each click adjusts `decimal_places` by ±1 for the selected column (must
 * resolve to a REAL format type), persists the change to the server, and
 * re-formats visible cells in-place without a full table re-render.
 *
 * @param {Object} appState - Application state.
 */
function initDecimalBtns(appState) {
  const increaseBtn = document.getElementById('increaseDecimalBtn');
  const decreaseBtn = document.getElementById('decreaseDecimalBtn');

  /**
   * Change the selected column's decimal precision by the given delta and persist the new formatting.
   *
   * Validates that a column is selected and that its effective format is numeric (`REAL`), computes
   * a new decimal_places value clamped to [0, 10], persists the updated format, updates
   * appState.columnFormats, and re-applies the formatting to visible table cells for that column.
   *
   * @param {number} delta - Number of decimal places to add (positive) or remove (negative).
   */
  async function adjustDecimals(delta) {
    const colName = appState.selectedColumn;
    if (!colName) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colMeta = appState.columnNames.find(([name]) => name === colName);
    const fmt = appState.columnFormats?.[colName];
    const columnType = fmt?.column_type ?? (colMeta ? defaultFormatType(colMeta[1]) : 'TEXT');

    if (columnType !== 'REAL') {
      bsToastWarning('Decimal formatting is only available for numeric columns');
      return;
    }

    const currentDecimals = fmt?.decimal_places ?? 2;
    const newDecimals = Math.max(0, Math.min(10, currentDecimals + delta));
    if (newDecimals === currentDecimals) return;

    const format = {
      prefix: fmt?.prefix ?? '',
      thousand_separator: fmt?.thousand_separator ?? 'YES',
      decimal_places: newDecimals,
    };
    if (fmt?.aggregation) format.aggregation = fmt.aggregation;

    increaseBtn.disabled = true;
    decreaseBtn.disabled = true;
    try {
      await api.post('/tables/set-column-formatting', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: colName,
        column_type: columnType,
        format,
      });

      format.column_type = columnType;
      if (!appState.columnFormats) appState.columnFormats = {};
      appState.columnFormats[colName] = format;

      // Apply formatting to visible cells without re-rendering
      const colIndex = appState.columnNames.findIndex(([name]) => name === colName);
      if (colIndex !== -1) {
        const [, dataType] = appState.columnNames[colIndex];
        const tbody = document.getElementById('sclTableBody');
        for (const row of tbody.rows) {
          const td = row.cells[colIndex + 1]; // +1 for leading checkbox column
          if (!td) continue;
          const tdRaw = td.dataset.rawValue ?? td.title;
          if (tdRaw === '' && td.textContent === '') continue;
          const { text, align } = formatCellValue(tdRaw, dataType, format);
          td.textContent = text;
          td.style.textAlign = align || '';
        }
      }
    } catch {
      bsToastWarning('Failed to update decimal formatting');
    } finally {
      increaseBtn.disabled = false;
      decreaseBtn.disabled = false;
    }
  }

  increaseBtn.addEventListener('click', () => adjustDecimals(1));
  decreaseBtn.addEventListener('click', () => adjustDecimals(-1));
}

// ── Bulk column update ───────────────────────────────────────────────────

/**
 * Create and return an input or select element configured for editing values in the specified column.
 *
 * The element type is chosen from LOV select, date, datetime-local, or text based on the column's SQL
 * type and any saved per-column formatting in `appState.columnFormats`. For DATE/DATETIME columns
 * stored as Excel serial numbers the element will include `dataset.excelSerial = 'true'`.
 *
 * @param {Object} appState - Application state containing `columnNames` and `columnFormats`.
 * @param {string} colName - Column name to build the editor for.
 * @returns {HTMLElement} An input (`text`/`date`/`datetime-local`) or `select` element ready for inline editing.
 */
function buildColumnInput(appState, colName) {
  const colMeta = appState.columnNames.find(([name]) => name === colName);
  const [, dataType] = colMeta ?? [];
  const fmt = appState.columnFormats?.[colName];
  const isLov = fmt?.column_type === 'LOV' && Array.isArray(fmt.lov_options);
  const numericCol = isNumericType(dataType) || isIntegerType(dataType);
  const textCol = isTextType(dataType);
  const isDateOnNumeric = numericCol && fmt?.column_type === 'DATE';
  const isDatetimeOnNumeric = numericCol && fmt?.column_type === 'DATETIME';
  const isDateOnText = textCol && fmt?.column_type === 'DATE';
  const isDatetimeOnText = textCol && fmt?.column_type === 'DATETIME';

  let el;
  if (isLov) {
    el = document.createElement('select');
    el.className = 'form-select scl-inline-edit';
    // Prepend a blank placeholder so untouched selects have no value selected
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '—';
    placeholder.disabled = true;
    placeholder.selected = true;
    el.appendChild(placeholder);
    for (const opt of fmt.lov_options) {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      el.appendChild(option);
    }
  } else if (isDateOnNumeric || isDateOnText) {
    el = document.createElement('input');
    el.type = 'date';
    el.className = 'form-control scl-inline-edit';
    if (isDateOnNumeric) el.dataset.excelSerial = 'true';
  } else if (isDatetimeOnNumeric || isDatetimeOnText) {
    el = document.createElement('input');
    el.type = 'datetime-local';
    el.step = '1';
    el.className = 'form-control scl-inline-edit';
    if (isDatetimeOnNumeric) el.dataset.excelSerial = 'true';
  } else {
    el = document.createElement('input');
    el.type = 'text';
    el.className = 'form-control scl-inline-edit';
  }
  return el;
}

/**
 * Read the raw value from an update-column input, converting date/datetime
 * pickers back to their storage format when necessary.
 *
 * @param {HTMLElement} input - The input element.
 * @returns {*} The value to send to the server (string or null).
 */
function readInputValue(input) {
  let val = input.value;
  if (input.dataset.excelSerial) {
    if (input.type === 'date' && val) val = String(dateToExcelSerial(val));
    else if (input.type === 'datetime-local' && val) val = String(datetimeToExcelSerial(val));
  } else if (input.type === 'datetime-local' && val) {
    val = val.replace('T', ' ');
  }
  return val === '' ? null : val;
}

// ── Inline editing ───────────────────────────────────────────────────────

/**
 * Enter inline-edit mode for the specified table row, replacing each data cell with an appropriate inline editor.
 *
 * Records each cell's original raw value, displayed text, and alignment, skips the leading checkbox column, sets the module-level `activeEdit` state, and focuses the first inline editor.
 *
 * @param {HTMLTableRowElement} tr - Table row to edit.
 * @param {Object} appState - Application state; used to resolve column names and per-column formatting via `appState.columnNames` and `appState.columnFormats`.
 */
function startEditing(tr, appState) {
  if (activeEdit) cancelEditing();

  const cells = [...tr.cells];
  const originals = [];

  for (let i = 1; i < cells.length; i++) {
    const td = cells[i];
    const tdRaw = td.dataset.rawValue ?? td.title;
    originals.push({
      cellIndex: i,
      rawValue: tdRaw,
      displayText: td.textContent,
      align: td.style.textAlign,
    });

    const colName = appState.columnNames[i - 1]?.[0];
    const [, dataType] = appState.columnNames[i - 1] ?? [];
    const fmt = appState.columnFormats?.[colName];
    const isLov = fmt?.column_type === 'LOV' && Array.isArray(fmt.lov_options);
    const numericCol = isNumericType(dataType) || isIntegerType(dataType);
    const textCol = isTextType(dataType);
    const isDateOnNumeric = numericCol && fmt?.column_type === 'DATE';
    const isDatetimeOnNumeric = numericCol && fmt?.column_type === 'DATETIME';
    const isDateOnText = textCol && fmt?.column_type === 'DATE';
    const isDatetimeOnText = textCol && fmt?.column_type === 'DATETIME';

    let el;
    if (isLov) {
      el = document.createElement('select');
      el.className = 'form-select form-select-sm scl-inline-edit';

      for (const opt of fmt.lov_options) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        el.appendChild(option);
      }

      if (tdRaw && !fmt.lov_options.includes(tdRaw)) {
        const option = document.createElement('option');
        option.value = tdRaw;
        option.textContent = tdRaw;
        el.appendChild(option);
      }

      el.value = tdRaw;
    } else if (isDateOnNumeric) {
      el = document.createElement('input');
      el.type = 'date';
      el.className = 'form-control form-control-sm scl-inline-edit';
      el.dataset.excelSerial = 'true';
      const num = Number(tdRaw);
      el.value = tdRaw !== '' && !Number.isNaN(num) ? excelSerialToDate(num) : '';
    } else if (isDatetimeOnNumeric) {
      el = document.createElement('input');
      el.type = 'datetime-local';
      el.step = '1';
      el.className = 'form-control form-control-sm scl-inline-edit';
      el.dataset.excelSerial = 'true';
      const num = Number(tdRaw);
      el.value =
        tdRaw !== '' && !Number.isNaN(num) ? excelSerialToDatetime(num).replace(' ', 'T') : '';
    } else if (isDateOnText) {
      el = document.createElement('input');
      el.type = 'date';
      el.className = 'form-control form-control-sm scl-inline-edit';
      el.value = tdRaw ? tdRaw.substring(0, 10) : '';
    } else if (isDatetimeOnText) {
      el = document.createElement('input');
      el.type = 'datetime-local';
      el.step = '1';
      el.className = 'form-control form-control-sm scl-inline-edit';
      el.value = tdRaw ? tdRaw.substring(0, 19).replace(' ', 'T') : '';
    } else {
      el = document.createElement('input');
      el.type = 'text';
      el.className = 'form-control form-control-sm scl-inline-edit';
      el.value = tdRaw;
      if (td.style.textAlign) el.style.textAlign = td.style.textAlign;
    }

    td.textContent = '';
    td.appendChild(el);
  }

  tr.classList.add(EDITING_CLASS);
  activeEdit = { tr, originals };

  const firstInput = tr.querySelector('.scl-inline-edit');
  if (firstInput) firstInput.focus();
}

/**
 * Restore the table row previously in inline-edit mode to its original cell contents and exit edit state.
 *
 * If no row is currently being edited, this function does nothing.
 */
function cancelEditing() {
  if (!activeEdit) return;

  const { tr, originals } = activeEdit;

  for (const { cellIndex, displayText, align } of originals) {
    const td = tr.cells[cellIndex];
    if (!td) continue;
    td.textContent = displayText;
    td.style.textAlign = align || '';
  }

  tr.classList.remove(EDITING_CLASS);
  activeEdit = null;
}

/**
 * Collect changed values from the active edit row and persist via the API.
 *
 * Only columns whose value actually changed are sent. After a successful save
 * the row reverts to display mode with updated raw values and formatting
 * via formatCellValue.
 *
 * @param {Object} appState - Application state.
 */
async function saveEditing(appState) {
  if (!activeEdit) return;

  const { tr, originals } = activeEdit;

  const checkbox = tr.cells[0]?.querySelector('input[type="checkbox"]');
  if (!checkbox) {
    bsToastWarning('Unable to identify the row');
    cancelEditing();
    return;
  }
  const rowid = checkbox.value;

  const changes = {};
  for (const { cellIndex, rawValue } of originals) {
    const input = tr.cells[cellIndex]?.querySelector('.scl-inline-edit');
    if (!input) continue;
    let newValue = input.value;

    // Convert date/datetime picker values back to the raw storage format
    if (input.dataset.excelSerial) {
      if (input.type === 'date' && newValue) {
        newValue = String(dateToExcelSerial(newValue));
      } else if (input.type === 'datetime-local' && newValue) {
        newValue = String(datetimeToExcelSerial(newValue));
      }
    } else if (input.type === 'datetime-local' && newValue) {
      newValue = newValue.replace('T', ' ');
    }

    if (newValue !== rawValue) {
      const colName = appState.columnNames[cellIndex - 1]?.[0];
      if (colName) changes[colName] = newValue === '' ? null : newValue;
    }
  }

  if (Object.keys(changes).length === 0) {
    cancelEditing();
    return;
  }

  for (const input of tr.querySelectorAll('.scl-inline-edit')) {
    input.disabled = true;
  }

  try {
    await api.post('/tables/update-row', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      row_id: rowid,
      updates: changes,
    });

    for (const { cellIndex, rawValue } of originals) {
      const td = tr.cells[cellIndex];
      if (!td) continue;

      const input = td.querySelector('.scl-inline-edit');
      let newValue = input ? input.value : rawValue;

      // Convert date/datetime picker values back to the raw storage format
      if (input?.dataset.excelSerial) {
        if (input.type === 'date' && newValue) {
          newValue = String(dateToExcelSerial(newValue));
        } else if (input.type === 'datetime-local' && newValue) {
          newValue = String(datetimeToExcelSerial(newValue));
        }
      } else if (input?.type === 'datetime-local' && newValue) {
        newValue = newValue.replace('T', ' ');
      }

      const colIndex = cellIndex - 1;
      const [colName, dataType] = appState.columnNames[colIndex] ?? [];
      const fmt = appState.columnFormats?.[colName];

      const rawStr = newValue ?? '';
      td.dataset.rawValue = rawStr;
      td.title = prettyIfJson(rawStr);
      const { text, align } = formatCellValue(newValue, dataType, fmt);
      td.textContent = text;
      td.style.textAlign = align || '';
    }

    tr.classList.remove(EDITING_CLASS);
    activeEdit = null;
    bsToastSuccess('Row updated');
  } catch {
    for (const input of tr.querySelectorAll('.scl-inline-edit')) {
      input.disabled = false;
    }
  }
}

/**
 * Initialize table toolbar controls and pagination behavior.
 *
 * Wires event handlers for refresh, pagination, non-modal row/column actions,
 * decimal adjustment buttons, export helpers, and a global mousedown handler
 * that cancels any active inline row edit when clicking outside it.
 *
 * @param {Object} appState - Application state object holding table configuration and runtime values.
 */
function initTableControls(appState) {
  initRefreshDataBtn(appState);
  initPaginationControls(appState);
  initRemoveColumnBtn(appState);
  initDecimalBtns(appState);
  initDeleteRowsBtn(appState);
  initShowSummaryBtn(appState);
  initAddRowBtn(appState);
  initCopyRowsBtn(appState);
  initDownloadExcelBtn(appState);

  // Click outside an editing row → cancel inline edit
  document.addEventListener('mousedown', (e) => {
    if (!activeEdit) return;
    if (activeEdit.tr.contains(e.target)) return;
    cancelEditing();
  });
}

/**
 * Toggle and manage an add-row footer that lets the user enter values for a new table row.
 *
 * Shows or hides a footer row (#sclTableAddRow) containing one input per visible column (built via
 * buildColumnInput). The footer confines Tab focus, supports Enter to submit and Escape to cancel,
 * validates that at least one column has a value, posts the values to `/tables/add-row`, and refreshes
 * table state on success.
 *
 * @param {Object} appState - Application state. Uses `tableName`, `projectName`, `modelName`,
 *   `columnNames`, and `columnFormats`; resets pagination/row-count state (`totalRowCount`) and
 *   triggers a data refresh after a successful add.
 */
function initAddRowBtn(appState) {
  const addRowBtn = document.getElementById('addRowBtn');
  if (!addRowBtn) return;

  const tfoot = document.querySelector('.scl-tfoot');
  if (!tfoot) return;

  addRowBtn.addEventListener('click', () => {
    // Toggle off if already open
    hideSummaryRow();
    if (document.getElementById('sclTableAddRow')) {
      closeAddRow();
      return;
    }

    if (!appState.columnNames?.length) {
      bsToastWarning('No columns available');
      return;
    }

    const addRow = document.createElement('tr');
    addRow.id = 'sclTableAddRow';
    addRow.className = 'scl-add-row';

    // Leading cell mirrors the checkbox column and holds the Save button
    const actionTd = document.createElement('td');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-dark p-0 px-1 scl-add-row-save';
    saveBtn.title = 'Save Row';
    saveBtn.setAttribute('aria-label', 'Save Row');
    saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    actionTd.appendChild(saveBtn);
    addRow.appendChild(actionTd);

    // Data cells: one input per visible column, built using the same helper
    // used by the Update Column modal / inline editing so formatting rules
    // (LOV, date, datetime, Excel-serial, numeric) stay consistent.
    for (const [colName] of appState.columnNames) {
      const td = document.createElement('td');
      const input = buildColumnInput(appState, colName);
      if (input.tagName === 'SELECT') {
        input.classList.add('form-select-sm');
      } else {
        input.classList.add('form-control-sm');
      }
      td.appendChild(input);
      addRow.appendChild(td);
    }

    tfoot.appendChild(addRow);
    addRowBtn.classList.add('active');
    addRowBtn.setAttribute('aria-pressed', 'true');

    // Enter = save, Escape = cancel, Tab navigates between inputs
    addRow.addEventListener('keydown', (e) => {
      const input = e.target.closest('.scl-inline-edit');
      if (!input) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAddRow();
      } else if (e.key === 'Tab') {
        const inputs = [...addRow.querySelectorAll('.scl-inline-edit')];
        const idx = inputs.indexOf(input);
        const leavingRow = (e.shiftKey && idx === 0) || (!e.shiftKey && idx === inputs.length - 1);
        if (!leavingRow) {
          e.preventDefault();
          inputs[e.shiftKey ? idx - 1 : idx + 1].focus();
        }
      }
    });

    saveBtn.addEventListener('click', async () => {
      const inputs = [...addRow.querySelectorAll('.scl-inline-edit')];
      const values = {};
      let hasValue = false;
      inputs.forEach((input, idx) => {
        const colName = appState.columnNames[idx]?.[0];
        if (!colName) return;
        const v = readInputValue(input);
        if (v !== null && v !== '') hasValue = true;
        values[colName] = v;
      });

      if (!hasValue) {
        bsToastWarning('Please enter a value for at least one column');
        return;
      }

      saveBtn.disabled = true;
      for (const input of inputs) input.disabled = true;
      showTableLoader();
      try {
        await api.post('/tables/add-row', {
          table_name: appState.tableName,
          project_name: appState.projectName,
          model_name: appState.modelName,
          values,
        });
        bsToastSuccess('Row added');
        closeAddRow();
        appState.totalRowCount = null;
        await fetchTableData(appState);
      } catch {
        saveBtn.disabled = false;
        for (const input of inputs) input.disabled = false;
      } finally {
        hideTableLoader();
      }
    });

    const firstInput = addRow.querySelector('.scl-inline-edit');
    if (firstInput) firstInput.focus();
  });
}

/**
 * Wires the Delete Rows toolbar button to delete selected (or all filtered) table rows.
 *
 * When the delete button is clicked, prompts for confirmation showing how many rows will be deleted,
 * then issues a server request to remove either the explicitly checked rows or all rows matching current filters
 * when the header select-all checkbox is fully checked. On success updates pagination state, clears the header
 * select-all checkbox, refreshes table data, and shows a toast indicating the result.
 *
 * @param {object} appState - Application state object for the table view. Used for table identifiers, current/total row counts, and active filters.
 */
function initDeleteRowsBtn(appState) {
  const deleteBtn = document.getElementById('deleteRowsBtn');
  if (!deleteBtn) return;

  deleteBtn.addEventListener('click', async () => {
    const tbody = document.getElementById('sclTableBody');
    const checkedBoxes = tbody.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCount = checkedBoxes.length;

    if (selectedCount === 0) {
      window.alert('Please select at least one row to delete.');
      return;
    }

    const head1 = document.getElementById('sclTableHead1');
    const selectAllCb = head1?.querySelector('input[type="checkbox"]');
    const totalRowCount = appState.totalRowCount ?? appState.currentRowCount ?? selectedCount;
    const allSelected = !!selectAllCb && selectAllCb.checked && !selectAllCb.indeterminate;

    const rowsToDelete = allSelected ? totalRowCount : selectedCount;
    const confirmMsg = `This operation will delete ${rowsToDelete} row${
      rowsToDelete !== 1 ? 's' : ''
    }. Do you want to continue?`;
    if (!window.confirm(confirmMsg)) return;

    const row_ids = allSelected ? [] : [...checkedBoxes].map((cb) => cb.value);

    deleteBtn.disabled = true;
    showTableLoader();
    try {
      const dateCols = getDateColumnsInTextFilters(appState);
      const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
      const { rows_deleted } = await api.post('/tables/delete-rows', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        select_filters: appState.selectFilters,
        text_filters: textFilters,
        numeric_filters: numericFilters,
        date_columns: dateCols,
        row_ids,
      });

      if (rows_deleted !== rowsToDelete) {
        bsToastWarning(
          `Requested to delete ${rowsToDelete} row${rowsToDelete !== 1 ? 's' : ''} but ${rows_deleted} were deleted.`
        );
      } else {
        bsToastSuccess(`${rows_deleted} row${rows_deleted !== 1 ? 's' : ''} deleted`);
      }

      if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      }
      appState.currentPage = 1;
      appState.totalRowCount = null;
      await fetchTableData(appState);
    } finally {
      hideTableLoader();
      deleteBtn.disabled = false;
    }
  });
}

/**
 * Wire the Copy Rows toolbar button (#copyRowsBtn).
 *
 * Copies table data to the clipboard as tab-separated values (TSV) with a
 * header row. Behavior:
 *  - If one or more rows are selected via the row checkboxes, copies just
 *    those rows (formatted text as currently displayed in the table).
 *  - Otherwise, fetches up to 5000 rows from the server that match the
 *    current select/text filters and sort order, formats each value using
 *    the column's saved formatting, and copies the result.
 *
 * @param {Object} appState - Application state; reads `tableName`,
 *   `projectName`, `modelName`, `columnNames`, `columnFormats`,
 *   `selectFilters`, `textFilters`, and `sortColumns`.
 */
function initCopyRowsBtn(appState) {
  const copyBtn = document.getElementById('copyRowsBtn');
  if (!copyBtn) return;

  const COPY_ROW_LIMIT = 5000;

  copyBtn.addEventListener('click', async () => {
    if (!appState.columnNames?.length) {
      bsToastWarning('No columns available to copy');
      return;
    }

    const headers = appState.columnNames.map(([name]) => name);
    const tbody = document.getElementById('sclTableBody');
    const checkedBoxes = tbody ? [...tbody.querySelectorAll('input[type="checkbox"]:checked')] : [];

    copyBtn.disabled = true;
    showTableLoader();
    try {
      let rows;

      // All filtered rows already fit on the current page when the known
      // total row count is less than or equal to the page size. In that case
      // we can copy directly from the DOM and skip a redundant server call.
      const allRowsOnPage =
        appState.totalRowCount !== null && appState.totalRowCount <= appState.pageSize;

      if (checkedBoxes.length > 0) {
        // Copy the currently rendered text for the selected rows only.
        rows = checkedBoxes.map((cb) => {
          const tr = cb.closest('tr');
          // Skip the leading checkbox column.
          return [...tr.cells].slice(1).map((td) => td.textContent ?? '');
        });
      } else if (allRowsOnPage && tbody) {
        // No rows selected, but the entire dataset is already rendered.
        rows = [...tbody.rows].map((tr) =>
          [...tr.cells].slice(1).map((td) => td.textContent ?? '')
        );
      } else {
        // No rows selected — pull up to COPY_ROW_LIMIT rows from the server
        // honoring the current filters and sort order.
        const dateCols = getDateColumnsInTextFilters(appState);
        const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
        const { data } = await api.post('/tables/data', {
          table_name: appState.tableName,
          project_name: appState.projectName,
          model_name: appState.modelName,
          page_number: 1,
          page_size: COPY_ROW_LIMIT,
          select_filters: appState.selectFilters,
          text_filters: textFilters,
          numeric_filters: numericFilters,
          sort_columns: appState.sortColumns,
          column_names: headers,
          date_columns: dateCols,
        });

        const numColumns = headers.length;
        rows = (data ?? []).map((row) => {
          // When the response includes a rowid, it is the first element and
          // has length = numColumns + 1; otherwise length = numColumns.
          const values = row.length === numColumns + 1 ? row.slice(1) : row;
          return values.map((val, i) => {
            const [colName, dataType] = appState.columnNames[i] ?? [];
            const fmt = appState.columnFormats?.[colName];
            return formatCellValue(val, dataType, fmt).text;
          });
        });
      }

      const tsv = [headers, ...rows]
        .map((row) => row.map(sanitizeCellForClipboard).join('\t'))
        .join('\r\n');

      await window.navigator.clipboard.writeText(tsv);

      const rowCount = rows.length;
      bsToastSuccess(`Copied ${rowCount} row${rowCount !== 1 ? 's' : ''} to clipboard`);
    } catch {
      bsToastWarning('Failed to copy rows to clipboard');
    } finally {
      hideTableLoader();
      copyBtn.disabled = false;
    }
  });
}

/**
 * Wire the Show Summary toolbar button (#showSummaryBtn).
 *
 * Clicking the button toggles a sticky footer row that displays per-column aggregates
 * (SUM / AVG / MIN / MAX / COUNT / MEDIAN) as configured on each column's format.
 * Only columns whose format has an `aggregation` set are sent to the server and
 * rendered in the summary row; the remaining cells in the summary row are blank.
 *
 * The aggregated values are fetched from `/tables/summary` so that the aggregation is
 * computed across all rows that match the current select/text filters (not just the
 * currently paginated page).
 *
 * @param {Object} appState - Application state. Reads `tableName`, `projectName`,
 *   `modelName`, `columnNames`, `columnFormats`, `selectFilters`, and `textFilters`.
 */
function initShowSummaryBtn(appState) {
  const showBtn = document.getElementById('showSummaryBtn');
  if (!showBtn) return;

  showBtn.addEventListener('click', async () => {
    const tfootRow = document.getElementById('sclTableFoot');
    if (!tfootRow) return;

    // Toggle off if already visible
    if (!tfootRow.classList.contains('d-none')) {
      hideSummaryRow();
      return;
    }

    // Collect aggregations configured via column formatting
    const aggregations = {};
    for (const [colName, dataType] of appState.columnNames) {
      const fmt = appState.columnFormats?.[colName];
      if (fmt) {
        if (fmt.aggregation) {
          aggregations[colName] = fmt.aggregation;
        }
      } else if (isNumericType(dataType)) {
        aggregations[colName] = 'SUM';
      }
    }

    if (Object.keys(aggregations).length === 0) {
      bsToastWarning('No columns have an aggregation configured. Set one via Format Column.');
      return;
    }

    showBtn.disabled = true;
    showTableLoader();
    try {
      const dateCols = getDateColumnsInTextFilters(appState);
      const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
      const { summary } = await api.post('/tables/summary', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        select_filters: appState.selectFilters,
        text_filters: textFilters,
        numeric_filters: numericFilters,
        column_names: aggregations,
        date_columns: dateCols,
      });

      renderSummaryRow(appState, summary ?? {}, aggregations);
      tfootRow.classList.remove('d-none');
      showBtn.classList.add('active');
      showBtn.setAttribute('aria-pressed', 'true');
    } catch {
      bsToastWarning('Failed to load summary');
    } finally {
      showBtn.disabled = false;
      hideTableLoader();
    }
  });
}

/**
 * Populate the sticky footer row with aggregated values returned by the server.
 *
 * The first cell mirrors the leading checkbox column and shows a Σ label. Each
 * subsequent cell corresponds to a visible column; when the column has an
 * aggregation configured, the aggregated value is formatted using the column's
 * saved formatting (via formatCellValue). Cells for columns without an
 * aggregation are left blank.
 *
 * @param {Object} appState - Application state providing `columnNames` and `columnFormats`.
 * @param {Object<string, *>} summary - Map of columnName → aggregated raw value.
 * @param {Object<string, string>} aggregations - Map of columnName → aggregation type
 *   (e.g. 'SUM', 'AVG'); used to annotate the cell's tooltip.
 */
function renderSummaryRow(appState, summary, aggregations) {
  closeAddRow();
  const tfootRow = document.getElementById('sclTableFoot');
  if (!tfootRow) return;
  tfootRow.innerHTML = '';

  // Leading cell aligns with the checkbox column
  const labelTd = document.createElement('td');
  labelTd.className = 'scl-summary-label';
  labelTd.textContent = '\u03A3';
  labelTd.title = 'Summary';
  tfootRow.appendChild(labelTd);

  for (const [colName, dataType] of appState.columnNames) {
    const td = document.createElement('td');
    const agg = aggregations[colName];
    if (agg) {
      const rawVal = summary[colName];
      const fmt = appState.columnFormats?.[colName];
      const { text, align } = formatCellValue(rawVal, dataType, fmt);
      td.textContent = text;
      td.title = `${agg}${rawVal !== null && rawVal !== undefined ? `: ${rawVal}` : ''}`;
      if (align) td.style.textAlign = align;
    } else {
      td.textContent = '';
    }
    tfootRow.appendChild(td);
  }
}

/** Remove the add-row footer and reset the toolbar button state. */
function closeAddRow() {
  const existing = document.getElementById('sclTableAddRow');
  if (existing) existing.remove();
  const addRowBtn = document.getElementById('addRowBtn');
  if (!addRowBtn) return;
  addRowBtn.classList.remove('active');
  addRowBtn.setAttribute('aria-pressed', 'false');
}

/**
 * Hide the sticky summary row and clear its contents, resetting the toolbar
 * button's pressed state.
 */
function hideSummaryRow() {
  const tfootRow = document.getElementById('sclTableFoot');
  if (tfootRow) {
    tfootRow.classList.add('d-none');
    tfootRow.innerHTML = '';
  }
  const showBtn = document.getElementById('showSummaryBtn');
  if (showBtn) {
    showBtn.classList.remove('active');
    showBtn.setAttribute('aria-pressed', 'false');
  }
}

/**
 * Loads column formatting metadata from the server and stores it on appState.
 *
 * On success sets `appState.columnFormats` to the returned mapping keyed by column name.
 * On failure sets `appState.columnFormats` to an empty object.
 *
 * @param {Object} appState - Application state providing `tableName`, `projectName`, and `modelName`; mutated with `columnFormats`.
 */
async function fetchColumnFormats(appState) {
  try {
    const { column_formatting } = await api.post('/tables/get-column-formatting', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
    });
    appState.columnFormats = column_formatting ?? {};
  } catch {
    appState.columnFormats = {};
  }
}

// ── Excel download / upload ──────────────────────────────────────────────

/**
 * Wire the Download Excel toolbar button (#downloadExcelBtn).
 *
 * Clicking the button posts the current table identifiers along with the
 * active select/text filters and sort order to `/tables/download-excel`
 * and triggers a browser download of the returned `.xlsx` blob. The
 * filename is taken from the server's Content-Disposition header when
 * present and otherwise falls back to `<tableName>.xlsx`.
 *
 * @param {Object} appState - Application state; reads `tableName`,
 *   `projectName`, `modelName`, `columnNames`, `selectFilters`,
 *   `textFilters`, and `sortColumns`.
 */
function initDownloadExcelBtn(appState) {
  const downloadBtn = document.getElementById('downloadExcelBtn');
  if (!downloadBtn) return;

  downloadBtn.addEventListener('click', async () => {
    if (!appState.columnNames?.length) {
      bsToastWarning('No columns available to download');
      return;
    }

    downloadBtn.disabled = true;
    showTableLoader('Downloading excel data...');
    try {
      const { blob, fileName } = await api.postDownload('/tables/download-excel', {
        table_names: [appState.tableName],
        project_name: appState.projectName,
        model_name: appState.modelName,
      });

      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName || `${appState.tableName}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      bsToastSuccess('Excel download started');
    } catch {
      // api.js already displayed the error toast
    } finally {
      hideTableLoader();
      downloadBtn.disabled = false;
    }
  });
}

export {
  buildColumnInput,
  closeAddRow,
  fetchColumnFormats,
  fetchTableData,
  getTableHeaders,
  hideSummaryRow,
  initTableControls,
  readInputValue,
  selectColumn,
};
