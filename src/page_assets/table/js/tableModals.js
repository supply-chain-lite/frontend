import * as XLSX from 'xlsx';
import api from '@/common/js/api';
import { bsToastWarning, bsToastSuccess, bsToastError } from '@/common/js/bsToast';
import {
  defaultFormatType,
  formatCellValue,
  getDragAfterElement,
  getDateColumnsInTextFilters,
  getNumericFiltersInTextFilters,
} from './commons';
import {
  buildColumnInput,
  closeAddRow,
  fetchTableData,
  getTableHeaders,
  hideSummaryRow,
  readInputValue,
} from './tables';

/**
 * Create a column list item element for the Select Columns modal.
 * @param {string} colName - Column name to display and store on the element.
 * @returns {HTMLDivElement} A `div.col-select-item` with `data-col-name` set and text content set to `colName`.
 */
function createColumnItem(colName) {
  const div = document.createElement('div');
  div.className = 'col-select-item px-2 py-1 small';
  div.dataset.colName = colName;
  div.textContent = colName;
  div.tabIndex = 0;
  div.setAttribute('role', 'option');
  div.setAttribute('aria-selected', 'false');
  return div;
}

/**
 * Move items from one list container to another.
 * @param {HTMLElement} fromList - Source list container.
 * @param {HTMLElement} toList - Destination list container.
 * @param {boolean} selectedOnly - If true, move only `.active` items; otherwise move all.
 */
function moveItems(fromList, toList, selectedOnly) {
  const selector = selectedOnly ? '.col-select-item.active' : '.col-select-item';
  const makeDraggable = toList.id === 'selectedColumnsList';
  for (const item of [...fromList.querySelectorAll(selector)]) {
    item.classList.remove('active');
    item.setAttribute('aria-selected', 'false');
    item.draggable = makeDraggable;
    toList.appendChild(item);
  }
}

/**
 * Initialize the Select Columns modal so users can move columns between
 * "Available" and "Selected" lists, reorder selected columns via
 * drag-and-drop, and persist the selection.
 *
 * @param {Object} appState - Application state.
 */
function initSelectColumnsModal(appState) {
  const modalEl = document.getElementById('selectColumnsModal');
  const availableList = document.getElementById('availableColumnsList');
  const selectedList = document.getElementById('selectedColumnsList');
  if (!modalEl || !availableList || !selectedList) return;

  availableList.setAttribute('role', 'listbox');
  availableList.setAttribute('aria-multiselectable', 'true');
  availableList.setAttribute('aria-label', 'Available Columns');
  selectedList.setAttribute('role', 'listbox');
  selectedList.setAttribute('aria-multiselectable', 'true');
  selectedList.setAttribute('aria-label', 'Selected Columns');

  modalEl.addEventListener('show.bs.modal', async () => {
    availableList.innerHTML = '<div class="text-center py-3"><small>Loading…</small></div>';
    selectedList.innerHTML = '';

    for (const [colName] of appState.columnNames) {
      const item = createColumnItem(colName);
      item.draggable = true;
      selectedList.appendChild(item);
    }

    try {
      const { headers } = await api.post('/tables/all-headers', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
      });
      appState.allColumns = headers;
    } catch {
      availableList.innerHTML =
        '<div class="text-center py-3 text-danger"><small>Failed to load</small></div>';
      return;
    }

    const selectedNames = new Set(appState.columnNames.map(([name]) => name));
    availableList.innerHTML = '';
    for (const colName of appState.allColumns) {
      if (!selectedNames.has(colName)) {
        availableList.appendChild(createColumnItem(colName));
      }
    }
  });

  for (const list of [availableList, selectedList]) {
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.col-select-item');
      if (!item) return;
      if (!e.ctrlKey && !e.metaKey) {
        for (const sib of list.querySelectorAll('.col-select-item.active')) {
          if (sib !== item) {
            sib.classList.remove('active');
            sib.setAttribute('aria-selected', 'false');
          }
        }
      }
      item.classList.toggle('active');
      item.setAttribute('aria-selected', item.classList.contains('active') ? 'true' : 'false');
    });
  }

  availableList.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.col-select-item');
    if (item) {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
      item.draggable = true;
      selectedList.appendChild(item);
    }
  });
  selectedList.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.col-select-item');
    if (item) {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
      item.draggable = false;
      availableList.appendChild(item);
    }
  });

  // Keyboard: Arrow keys navigate focus; Space toggles selection; Enter moves item
  // to the other list; Ctrl+Arrow reorders within selectedList.
  for (const [list, otherList] of [
    [availableList, selectedList],
    [selectedList, availableList],
  ]) {
    list.addEventListener('keydown', (e) => {
      const item = e.target.closest('.col-select-item');
      if (!item || !list.contains(item)) return;

      if (e.ctrlKey && list === selectedList && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (e.key === 'ArrowUp' && item.previousElementSibling) {
          list.insertBefore(item, item.previousElementSibling);
        } else if (e.key === 'ArrowDown' && item.nextElementSibling) {
          list.insertBefore(item.nextElementSibling, item);
        }
        item.focus();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        item.nextElementSibling?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        item.previousElementSibling?.focus();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!e.ctrlKey && !e.metaKey) {
          for (const sib of list.querySelectorAll('.col-select-item.active')) {
            if (sib !== item) {
              sib.classList.remove('active');
              sib.setAttribute('aria-selected', 'false');
            }
          }
        }
        item.classList.toggle('active');
        item.setAttribute('aria-selected', item.classList.contains('active') ? 'true' : 'false');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
        item.draggable = otherList === selectedList;
        otherList.appendChild(item);
        item.focus();
      }
    });
  }

  let dragItem = null;

  selectedList.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.col-select-item');
    if (!item) return;
    dragItem = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  selectedList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragItem) return;
    const after = getDragAfterElement(selectedList, e.clientY);
    if (after) {
      selectedList.insertBefore(dragItem, after);
    } else {
      selectedList.appendChild(dragItem);
    }
  });

  selectedList.addEventListener('dragend', () => {
    if (dragItem) {
      dragItem.classList.remove('dragging');
      dragItem = null;
    }
  });

  document.getElementById('moveToSelectedBtn')?.addEventListener('click', () => {
    moveItems(availableList, selectedList, true);
  });
  document.getElementById('moveAllToSelectedBtn')?.addEventListener('click', () => {
    moveItems(availableList, selectedList, false);
  });
  document.getElementById('moveToAvailableBtn')?.addEventListener('click', () => {
    moveItems(selectedList, availableList, true);
  });
  document.getElementById('moveAllToAvailableBtn')?.addEventListener('click', () => {
    moveItems(selectedList, availableList, false);
  });

  document.getElementById('submitSelectColumnsBtn')?.addEventListener('click', async () => {
    const allColMap = new Map(appState.allColumns.map((col) => [col, col]));
    const selectedCols = [...selectedList.querySelectorAll('.col-select-item')]
      .map((item) => allColMap.get(item.dataset.colName))
      .filter(Boolean);

    if (selectedCols.length === 0) return;

    try {
      await api.post('/tables/set-columns-order', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_names: selectedCols.map((col) => col),
      });

      for (const col of Object.keys(appState.selectFilters ?? {})) {
        if (!selectedCols.includes(col)) delete appState.selectFilters[col];
      }
      for (const col of Object.keys(appState.textFilters ?? {})) {
        if (!selectedCols.includes(col)) delete appState.textFilters[col];
      }

      appState.sortColumns = (appState.sortColumns ?? []).filter(([name]) =>
        selectedCols.includes(name)
      );

      appState.currentPage = 1;
      appState.selectedColumn = null;
      appState.totalRowCount = null;

      await getTableHeaders(appState);
      await fetchTableData(appState);

      window.bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch {
      // api.js already displays the error toast
    }
  });
}

/**
 * Initialize the Add Column button and its modal flow.
 * @param {Object} appState - Application state.
 */
function initAddColumnBtn(appState) {
  const addBtn = document.getElementById('addColumnBtn');
  const modalEl = document.getElementById('addColumnModal');
  const nameInput = document.getElementById('addColumnName');
  const dataTypeSelect = document.getElementById('addColumnDataType');
  const submitBtn = document.getElementById('submitAddColumnBtn');
  if (!addBtn || !modalEl || !nameInput || !dataTypeSelect || !submitBtn) return;

  const modal = new window.bootstrap.Modal(modalEl);

  addBtn.addEventListener('click', () => {
    nameInput.value = '';
    dataTypeSelect.value = 'TEXT';
    modal.show();
  });

  submitBtn.addEventListener('click', async () => {
    const columnName = nameInput.value.trim();
    if (!columnName) {
      bsToastWarning('Please enter a column name');
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
      bsToastWarning(
        'Invalid column name. Use only letters, numbers, and underscores, and start with a letter or underscore.'
      );
      return;
    }

    if (appState.columnNames.some(([name]) => name === columnName)) {
      bsToastWarning(`Column "${columnName}" already exists`);
      return;
    }

    submitBtn.disabled = true;
    try {
      await api.post('/tables/add-column', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: columnName,
        column_type: dataTypeSelect.value,
      });

      // Immediately reflect the new column in local state so that:
      // - the duplicate-name guard won't allow re-submission on a retry, and
      // - newColumnOrder is consistent with the current backend state.
      appState.columnNames = [...appState.columnNames, [columnName, dataTypeSelect.value]];
      const newColumnOrder = appState.columnNames.map(([name]) => name);

      try {
        await api.post('/tables/set-columns-order', {
          table_name: appState.tableName,
          project_name: appState.projectName,
          model_name: appState.modelName,
          column_names: newColumnOrder,
        });
      } catch {
        // Column was created but ordering failed. Local state is already
        // updated so a retry will not hit a duplicate-column error.
        bsToastWarning(`Column "${columnName}" was added but column order could not be saved`);
      }

      bsToastSuccess(`Column "${columnName}" added`);

      appState.currentPage = 1;
      appState.selectedColumn = null;
      appState.totalRowCount = null;

      await getTableHeaders(appState);
      await fetchTableData(appState);

      modal.hide();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/**
 * Open and manage the Format Column modal.
 * @param {Object} appState - Application state.
 */
function initFormatColumnBtn(appState) {
  const formatBtn = document.getElementById('formatColumnBtn');
  const modalEl = document.getElementById('formatColumnModal');
  const titleName = document.getElementById('formatColumnTitleName');
  const columnTypeSelect = document.getElementById('formatColumnType');
  const aggregationOptions = document.getElementById('formatAggregationOptions');
  const aggregationSelect = document.getElementById('formatAggregation');
  const realOptions = document.getElementById('formatRealOptions');
  const lovOptions = document.getElementById('formatLovOptions');
  const prefixInput = document.getElementById('formatRealPrefix');
  const separatorSelect = document.getElementById('formatRealSeparator');
  const decimalsInput = document.getElementById('formatRealDecimals');
  const lovTextarea = document.getElementById('formatLovValues');
  const submitBtn = document.getElementById('submitFormatColumnBtn');
  if (
    !formatBtn ||
    !modalEl ||
    !titleName ||
    !columnTypeSelect ||
    !aggregationOptions ||
    !aggregationSelect ||
    !realOptions ||
    !lovOptions ||
    !prefixInput ||
    !separatorSelect ||
    !decimalsInput ||
    !lovTextarea ||
    !submitBtn
  ) {
    return;
  }

  const modal = new window.bootstrap.Modal(modalEl);

  function toggleSections() {
    const type = columnTypeSelect.value;
    const isNumeric = type === 'REAL' || type === 'INTEGER';
    aggregationOptions.classList.toggle('d-none', !isNumeric);
    aggregationOptions.setAttribute('aria-hidden', String(!isNumeric));
    realOptions.classList.toggle('d-none', type !== 'REAL');
    realOptions.setAttribute('aria-hidden', String(type !== 'REAL'));
    lovOptions.classList.toggle('d-none', type !== 'LOV');
    lovOptions.setAttribute('aria-hidden', String(type !== 'LOV'));
  }

  columnTypeSelect.addEventListener('change', toggleSections);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      const ae = document.activeElement;
      const inEditable =
        ae &&
        (ae.matches('input, textarea, select') ||
          ae.isContentEditable ||
          ae.closest('dialog, [role="dialog"]') ||
          ae.closest('.modal.show'));
      if (inEditable) return;
      e.preventDefault();
      formatBtn.click();
    }
  });

  formatBtn.addEventListener('click', () => {
    if (!appState.selectedColumn) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colName = appState.selectedColumn;
    titleName.textContent = `${colName}`;

    const fmt = appState.columnFormats?.[colName] ?? {};
    const colMeta = appState.columnNames.find(([name]) => name === colName);
    const defaultType = colMeta ? defaultFormatType(colMeta[1]) : 'TEXT';
    columnTypeSelect.value = fmt.column_type ?? defaultType;
    aggregationSelect.value = fmt.aggregation ?? '';
    prefixInput.value = fmt.prefix ?? '';
    separatorSelect.value = fmt.thousand_separator ?? 'YES';
    decimalsInput.value = fmt.decimal_places ?? 2;
    lovTextarea.value = (fmt.lov_options ?? []).join('\n');

    toggleSections();
    modal.show();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    titleName.textContent = '';
  });

  submitBtn.addEventListener('click', async () => {
    const colName = appState.selectedColumn;
    if (!colName) return;

    const columnType = columnTypeSelect.value;
    const format = {};

    if (columnType === 'REAL' || columnType === 'INTEGER') {
      const agg = aggregationSelect.value;
      if (agg) format.aggregation = agg;
    }

    if (columnType === 'REAL') {
      const parsedDecimals = Number.parseInt(decimalsInput.value, 10);
      if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 10) {
        bsToastWarning('Decimal places must be between 0 and 10');
        return;
      }
      format.prefix = prefixInput.value.trim();
      format.thousand_separator = separatorSelect.value;
      format.decimal_places = parsedDecimals;
    }

    if (columnType === 'LOV') {
      format.lov_options = lovTextarea.value
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
    }

    submitBtn.disabled = true;
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

      const colIndex = appState.columnNames.findIndex(([name]) => name === colName);
      if (colIndex !== -1) {
        const [, dataType] = appState.columnNames[colIndex];
        const tbody = document.getElementById('sclTableBody');
        for (const row of tbody.rows) {
          const td = row.cells[colIndex + 1];
          if (!td) continue;
          if (td.title === '' && td.textContent === '') continue;
          const { text, align } = formatCellValue(td.title, dataType, format);
          td.textContent = text;
          td.style.textAlign = align || '';
        }
      }

      bsToastSuccess(`Format updated for "${colName}"`);
      modal.hide();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/**
 * Wire the Update Column modal flow.
 * @param {Object} appState - Application state.
 */
function initUpdateColumnBtn(appState) {
  const updateBtn = document.getElementById('updateColumnBtn');
  const modalEl = document.getElementById('updateColumnModal');
  const titleName = document.getElementById('updateColumnTitleName');
  const container = document.getElementById('updateColumnInputContainer');
  const submitBtn = document.getElementById('submitUpdateColumnBtn');
  if (!updateBtn || !modalEl || !titleName || !container || !submitBtn) return;

  const modal = new window.bootstrap.Modal(modalEl);

  updateBtn.addEventListener('click', () => {
    if (!appState.selectedColumn) {
      bsToastWarning('Please select a column first');
      return;
    }

    titleName.textContent = appState.selectedColumn;
    container.innerHTML = '';
    container.appendChild(buildColumnInput(appState, appState.selectedColumn));
    modal.show();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      const ae = document.activeElement;
      const inEditable =
        ae &&
        (ae.matches('input, textarea, select') ||
          ae.isContentEditable ||
          ae.closest('dialog, [role="dialog"]') ||
          ae.closest('.modal.show'));
      if (inEditable) return;
      e.preventDefault();
      updateBtn.click();
    }
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    const input = container.querySelector('.scl-inline-edit');
    if (input) input.focus();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    titleName.textContent = '';
    container.innerHTML = '';
  });

  submitBtn.addEventListener('click', async () => {
    if (!appState.selectedColumn) return;

    const input = container.querySelector('.scl-inline-edit');
    if (!input) return;

    const newValue = readInputValue(input);
    const tbody = document.getElementById('sclTableBody');
    const allCbs = [...tbody.querySelectorAll('input[type="checkbox"]')];
    const checkedCbs = allCbs.filter((cb) => cb.checked);
    const rowIds =
      checkedCbs.length === 0 || checkedCbs.length === allCbs.length
        ? []
        : checkedCbs.map((cb) => cb.value);

    submitBtn.disabled = true;
    try {
      const dateCols = getDateColumnsInTextFilters(appState);
      const { numericFilters, textFilters } = getNumericFiltersInTextFilters(appState);
      const { rows_updated } = await api.post('/tables/update-rows', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: appState.selectedColumn,
        column_value: newValue,
        row_ids: rowIds,
        select_filters: appState.selectFilters,
        text_filters: textFilters,
        numeric_filters: numericFilters,
        date_columns: dateCols,
      });

      bsToastSuccess(`${rows_updated} row${rows_updated !== 1 ? 's' : ''} updated`);
      modal.hide();
      appState.currentPage = 1;
      appState.totalRowCount = null;
      await fetchTableData(appState);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/**
 * Wire the Upload Excel modal and submit flow.
 * @param {Object} appState - Application state.
 */
function setupUploadExcel(appState) {
  const modalEl = document.getElementById('uploadExcelModal');
  const modal_name = document.getElementById('uploadModelName');
  const table_name = document.getElementById('uploadTableName');
  const fileInput = document.getElementById('uploadExcelFile');
  const submitBtn = document.getElementById('submitUploadExcelBtn');
  if (!modalEl || !modal_name || !table_name || !submitBtn || !fileInput) return;

  const allowedExtensions = ['.xlsx', '.xls'];

  modalEl.addEventListener('show.bs.modal', (event) => {
    modal_name.value = appState.modelName;
    table_name.value = appState.tableName;
    modal_name.disabled = true;
    table_name.disabled = true;
    fileInput.value = '';
    fileInput.accept = allowedExtensions.join(',');

    if (!appState.modelName || !appState.tableName) {
      bsToastError('No table exists for upload.');
      event.preventDefault();
      window.bootstrap.Modal.getInstance(modalEl)?.hide();
    }
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    fileInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  });

  submitBtn.addEventListener('click', async () => {
    if (!appState.modelName || !appState.tableName) {
      bsToastError('No table exists for upload.');
      return;
    }

    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) {
      bsToastError('Please choose an Excel file.');
      return;
    }

    const lowerName = selectedFile.name.toLowerCase();
    const isAllowedFile = allowedExtensions.some((extension) => lowerName.endsWith(extension));
    if (!isAllowedFile) {
      bsToastError('Only .xlsx and .xls files are supported.');
      return;
    }

    let sheetNames;
    const expected = appState.tableName.trim().toLowerCase();

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', bookSheets: true });

      sheetNames = workbook.SheetNames ?? [];
      const hasMatchingSheet = sheetNames.some((name) => name.trim().toLowerCase() === expected);

      if (!hasMatchingSheet) {
        bsToastError(
          `Excel file must contain a sheet named "${appState.tableName}". ` +
            `Found: ${sheetNames.length ? sheetNames.join(', ') : 'none'}.`
        );
        return;
      }
    } catch {
      bsToastError('Unable to read the selected Excel file. Please verify the file and try again.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Uploading…';

    try {
      const formData = new FormData();
      const matchedSheetName = sheetNames.find((name) => name.trim().toLowerCase() === expected);
      const sheet_actions = { [matchedSheetName]: 'upload' };
      formData.append('project_name', appState.projectName);
      formData.append('model_name', appState.modelName);
      formData.append('sheet_actions', JSON.stringify(sheet_actions));
      formData.append('upload_file', selectedFile);
      const result = await api.postFormData('/tables/upload-excel', formData);
      const tableResponse = result?.response?.[matchedSheetName];
      const requestStatus = String(tableResponse?.status || '').toLowerCase();
      if (!tableResponse || requestStatus !== 'success') {
        const reason =
          tableResponse?.reason ||
          (tableResponse?.status
            ? `Unexpected status: ${tableResponse.status}`
            : 'No response received from the server for this table.');
        bsToastError(`Server failed to process the uploaded Excel file: ${reason}`);
        return;
      }
      const rowsAdded = tableResponse.rows_imported;
      if (rowsAdded === 0) {
        bsToastSuccess('Table deleted as empty table is uploaded');
        hideSummaryRow();
        closeAddRow();
        appState.currentPage = 1;
        appState.selectedColumn = null;
        appState.totalRowCount = null;
        window.bootstrap.Modal.getInstance(modalEl)?.hide();
        return;
      }

      bsToastSuccess(
        typeof rowsAdded === 'number'
          ? `Uploaded ${rowsAdded} row${rowsAdded !== 1 ? 's' : ''} from Excel`
          : 'Excel uploaded successfully'
      );

      hideSummaryRow();
      closeAddRow();
      appState.currentPage = 1;
      appState.selectedColumn = null;
      appState.totalRowCount = null;

      const head1 = document.getElementById('sclTableHead1');
      const selectAllCb = head1?.querySelector('input[type="checkbox"]');
      if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      }
      window.bootstrap.Modal.getInstance(modalEl)?.hide();
      await fetchTableData(appState);
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload';
    }
  });
}

/**
 * Wire the generic data-file upload modal and submit flow.
 * @param {Object} appState - Application state.
 */
function setupUploadDataFile(appState) {
  const modalEl = document.getElementById('uploadDataFileModal');
  const fileTypeSelect = document.getElementById('uploadDataFileType');
  const fileInput = document.getElementById('uploadDataFile');
  const submitBtn = document.getElementById('submitUploadDataFileBtn');
  if (!modalEl || !fileTypeSelect || !fileInput || !submitBtn) return;

  const acceptedExtensions = {
    csv: ['.csv'],
    tsv: ['.tsv'],
    parquet: ['.parquet'],
    json: ['.json'],
    txt: ['.txt'],
  };

  fileTypeSelect.addEventListener('change', () => {
    fileInput.accept = acceptedExtensions[fileTypeSelect.value].join(',');
    fileInput.value = '';
  });

  modalEl.addEventListener('show.bs.modal', () => {
    fileTypeSelect.value = 'csv';
    fileInput.accept = acceptedExtensions.csv.join(',');
    fileInput.value = '';
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    fileInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  });

  submitBtn.addEventListener('click', async () => {
    if (!appState.projectName || !appState.modelName || !appState.tableName) {
      bsToastError('No table exists for upload.');
      return;
    }

    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) {
      bsToastError('Please choose a file to upload.');
      return;
    }

    const fileType = fileTypeSelect.value;
    const allowedExtensions = acceptedExtensions[fileType] ?? [];
    if (
      !allowedExtensions.some((extension) => selectedFile.name.toLowerCase().endsWith(extension))
    ) {
      bsToastError(`Please choose a ${fileType.toUpperCase()} file.`);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Uploading…';

    try {
      const formData = new FormData();
      formData.append('project_name', appState.projectName);
      formData.append('model_name', appState.modelName);
      formData.append('table_name', appState.tableName);
      formData.append('file_type', fileType);
      formData.append('upload_file', selectedFile);

      await api.postFormData('/tables/upload-file', formData);
      bsToastSuccess(`${fileType.toUpperCase()} file uploaded successfully`);
      window.bootstrap.Modal.getInstance(modalEl)?.hide();
      appState.currentPage = 1;
      appState.selectedColumn = null;
      appState.totalRowCount = null;
      hideSummaryRow();
      closeAddRow();
      await fetchTableData(appState);
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload';
    }
  });
}

function initTableModals(appState) {
  initSelectColumnsModal(appState);
  initAddColumnBtn(appState);
  initFormatColumnBtn(appState);
  initUpdateColumnBtn(appState);
  setupUploadExcel(appState);
  setupUploadDataFile(appState);
}

export {
  initAddColumnBtn,
  initFormatColumnBtn,
  initSelectColumnsModal,
  initTableModals,
  initUpdateColumnBtn,
  setupUploadExcel,
};
