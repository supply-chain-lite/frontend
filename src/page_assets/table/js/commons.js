// ── Common utilities shared by the table feature ────────────────────────────
//
// This module holds pure helpers that are reusable across the table page and
// can be consumed by any sibling module under `page_assets/table/js/`. Nothing
// here should depend on the table page's specific DOM structure (IDs like
// `sclTable*`) or on the page-level `appState`. Everything is kept as plain
// functions and constants so unit-test friendliness is preserved.

// ── SQL type classification ─────────────────────────────────────────────────

const NUMERIC_TYPE_RE = /^(NUMERIC|NUMBER|FLOAT|DOUBLE|REAL|DECIMAL|MONEY|SMALLMONEY)\b/i;
const INTEGER_TYPE_RE = /^(INTEGER|INT|BIGINT|SMALLINT|TINYINT|MEDIUMINT)\b/i;
const DATE_TYPE_RE = /^(DATE)\b/i;
const DATETIME_TYPE_RE =
  /^(DATETIME|TIMESTAMP|TIMESTAMPTZ|TIMESTAMP_TZ|TIMESTAMP_NTZ|TIMESTAMP_LTZ)\b/i;
const TEXT_TYPE_RE = /^(TEXT|VARCHAR|STRING|CHAR|NVARCHAR|NCHAR|CLOB|NCLOB|VARDATE)\b/i;

/**
 * Map a SQL column data type to a default format column type.
 *
 * @param {string} dataType - SQL type as returned by the headers endpoint.
 * @returns {string} One of 'REAL', 'INTEGER', 'DATE', 'DATETIME', or 'TEXT'.
 */
function defaultFormatType(dataType) {
  if (NUMERIC_TYPE_RE.test(dataType)) return 'REAL';
  if (INTEGER_TYPE_RE.test(dataType)) return 'INTEGER';
  if (DATETIME_TYPE_RE.test(dataType)) return 'DATETIME';
  if (DATE_TYPE_RE.test(dataType)) return 'DATE';
  return 'TEXT';
}

/**
 * Determine whether a SQL column data type represents a numeric type.
 *
 * Recognizes type names with optional precision/scale suffixes (for example, "NUMERIC(10,2)").
 * @param {string} dataType - Column data type as returned by the headers endpoint.
 * @returns {boolean} `true` if `dataType` corresponds to a numeric SQL type, `false` otherwise.
 */
function isNumericType(dataType) {
  return NUMERIC_TYPE_RE.test(dataType);
}

/**
 * Determines whether a SQL data type name represents an integer type.
 * @param {string} dataType - The SQL type name to test (e.g., "int", "bigint", "smallint").
 * @returns {boolean} `true` if `dataType` matches integer-like SQL type names, `false` otherwise.
 */
function isIntegerType(dataType) {
  return INTEGER_TYPE_RE.test(dataType);
}

/**
 * Determines whether a SQL type string represents a text/string type.
 * @param {string} dataType - SQL type string (e.g., "VARCHAR(255)", "TEXT"); matching is case-insensitive.
 * @returns {boolean} `true` if the SQL type is a text/string type, `false` otherwise.
 */
function isTextType(dataType) {
  return TEXT_TYPE_RE.test(dataType);
}

// ── Excel serial-date helpers ───────────────────────────────────────────────

/** Excel epoch: 1899-12-30 (accounting for the Lotus 1-2-3 leap-year bug). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * Return a string representation of a number left-padded with zeros to a minimum width.
 * @param {number} n - The number to format.
 * @param {number} len - Minimum length of the returned string; pads with leading zeros if shorter.
 * @returns {string} The number as a string left-padded with '0' to at least `len` characters.
 */
function pad(n, len) {
  return String(n).padStart(len, '0');
}

/**
 * Convert an Excel serial day number to a UTC date string in YYYY-MM-DD format.
 * @param {number} serial - Excel serial day count (days since 1899-12-30).
 * @returns {string} Date in `YYYY-MM-DD` (UTC).
 */
function excelSerialToDate(serial) {
  const d = new Date(EXCEL_EPOCH_MS + serial * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/**
 * Converts an Excel serial date/time to a UTC timestamp string in the format YYYY-MM-DD HH:MM:SS.
 * @param {number} serial - Excel serial number (days since 1899-12-30); fractional part represents time-of-day.
 * @returns {string} UTC timestamp string formatted as `YYYY-MM-DD HH:MM:SS`.
 */
function excelSerialToDatetime(serial) {
  const totalMs = EXCEL_EPOCH_MS + serial * MS_PER_DAY;
  const d = new Date(totalMs);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`
  );
}

/**
 * Convert a date string (YYYY-MM-DD) to an Excel serial day number, interpreting the date as UTC midnight.
 * @param {string} dateStr - Date in `YYYY-MM-DD` format.
 * @returns {number} Excel serial day count (integer).
 */
function dateToExcelSerial(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return Math.round((ms - EXCEL_EPOCH_MS) / MS_PER_DAY);
}

/**
 * Convert a datetime-local string to an Excel serial number.
 * @param {string} dtStr - Datetime in `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS` format.
 * @returns {number} Excel serial number (fractional part represents time-of-day).
 */
function datetimeToExcelSerial(dtStr) {
  const [datePart, timePart = '00:00:00'] = dtStr.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, sec = 0] = timePart.split(':').map(Number);
  const ms = Date.UTC(y, m - 1, d, h, min, sec);
  return (ms - EXCEL_EPOCH_MS) / MS_PER_DAY;
}

// ── Currency symbol map ─────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  CHF: 'CHF',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  KRW: '₩',
  BRL: 'R$',
  ZAR: 'R',
  RUB: '₽',
  TRY: '₺',
  MXN: 'MX$',
  SGD: 'S$',
  HKD: 'HK$',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  THB: '฿',
  IDR: 'Rp',
  MYR: 'RM',
  PHP: '₱',
  TWD: 'NT$',
  AED: 'AED',
  SAR: 'SAR',
  EGP: 'E£',
  ILS: '₪',
  CLP: 'CL$',
  ARS: 'AR$',
  COP: 'COL$',
  PEN: 'S/.',
  VND: '₫',
  NGN: '₦',
  KES: 'KSh',
  PKR: '₨',
  BDT: '৳',
  LKR: 'Rs',
};

/**
 * Resolve a prefix/currency code to its symbol. If the uppercase value exists
 * in the currency map the symbol is returned; otherwise the original string
 * is returned unchanged (allows users to type arbitrary prefixes like "%" or "€").
 *
 * @param {string} prefix - User-entered prefix or ISO currency code.
 * @returns {string} Resolved symbol or the original prefix.
 */
function resolveCurrencySymbol(prefix) {
  if (!prefix) return '';
  return CURRENCY_SYMBOLS[prefix.toUpperCase()] ?? prefix;
}

// ── Numeric / cell value formatting ─────────────────────────────────────────

/**
 * Format a value as a locale-aware number with up to two decimal places.
 *
 * For `null` returns an empty string. If the value can be converted to a finite number,
 * returns the locale-formatted representation with 0–2 fraction digits. If conversion
 * yields `NaN`, returns `String(val)`.
 *
 * @param {*} val - Value to format (number or value convertible to number).
 * @returns {string} The formatted numeric string, `''` for `null`, or `String(val)` for non-numeric inputs.
 */
function formatNumericValue(val) {
  if (val === null) return '';
  const num = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(num)) return String(val);
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Format a table cell value according to the column's saved format and SQL data type.
 *
 * Applies explicit format overrides (DATE, DATETIME, REAL/NUMERIC, INTEGER, TEXT, LOV) when present,
 * and otherwise falls back to defaults derived from the SQL data type; numeric results are right-aligned.
 *
 * @param {*} val - Raw cell value.
 * @param {string} dataType - SQL column data type (used to choose defaults and detect numeric/text types).
 * @param {Object|undefined} fmt - Optional saved column format from `appState.columnFormats[colName]`.
 * @returns {{ text: string, align: string }} Formatted display text and CSS `text-align` value (`'right'` for numeric alignment, `''` otherwise).
 */
function formatCellValue(val, dataType, fmt) {
  const formatType = fmt?.column_type;

  // ── null / undefined: always fall through to default ──────────────
  if (val === null || val === undefined) {
    if (isNumericType(dataType) || isIntegerType(dataType)) {
      return { text: '', align: 'right' };
    }
    return { text: '', align: '' };
  }

  // ── DATE format ───────────────────────────────────────────────────
  if (formatType === 'DATE') {
    if (isTextType(dataType)) {
      return { text: String(val).substring(0, 10), align: '' };
    }
    // Numeric SQL type → Excel serial
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return { text: excelSerialToDate(num), align: '' };
    }
    return { text: String(val), align: '' };
  }

  // ── DATETIME format ──────────────────────────────────────────────
  if (formatType === 'DATETIME') {
    if (isTextType(dataType)) {
      return { text: String(val).substring(0, 19), align: '' };
    }
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return { text: excelSerialToDatetime(num), align: '' };
    }
    return { text: String(val), align: '' };
  }

  // ── REAL / NUMERIC format ────────────────────────────────────────
  if (formatType === 'REAL' || formatType === 'NUMERIC') {
    const num = typeof val === 'number' ? val : Number(val);
    if (Number.isNaN(num)) return { text: String(val), align: 'right' };

    const decimals = fmt.decimal_places ?? 2;
    const useSeparator = (fmt.thousand_separator ?? 'YES') === 'YES';
    const rawPrefix = fmt.prefix?.toUpperCase() ?? '';
    const isCurrencyCode = rawPrefix in CURRENCY_SYMBOLS;

    let formatted;
    if (isCurrencyCode) {
      formatted = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: rawPrefix,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: useSeparator,
      }).format(num);
    } else {
      const prefix = fmt.prefix ? resolveCurrencySymbol(fmt.prefix) : '';
      formatted =
        prefix +
        new Intl.NumberFormat(undefined, {
          style: 'decimal',
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: useSeparator,
        }).format(num);
    }
    return { text: formatted, align: 'right' };
  }
  if (formatType === 'INTEGER') {
    const num = typeof val === 'number' ? val : Number(val);
    if (Number.isNaN(num)) return { text: String(val), align: 'right' };
    return {
      text: new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: (fmt?.thousand_separator ?? 'YES') === 'YES',
      }).format(num),
      align: 'right',
    };
  }

  if (formatType === 'TEXT' || formatType === 'LOV') {
    return { text: String(val), align: '' };
  }

  // ── No format override → default data-type-based formatting ──────
  if (isNumericType(dataType)) {
    return { text: formatNumericValue(val), align: 'right' };
  }
  if (isIntegerType(dataType)) {
    return { text: String(val), align: 'right' };
  }
  return { text: String(val), align: '' };
}

// ── JSON pretty-print ──────────────────────────────────────────────────────

/**
 * Return a pretty-printed JSON string if `str` is valid JSON, otherwise return `str` as-is.
 *
 * Only attempts to parse strings that begin with `{` or `[` to avoid the cost of
 * trying to parse every cell value.
 *
 * @param {string} str - The string to test and format.
 * @returns {string} Pretty-printed JSON (2-space indent) or the original string.
 */
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

// ── Misc generic utilities ──────────────────────────────────────────────────

/**
 * Check whether two arrays contain identical elements in the same order.
 * @param {Array} left - The first array to compare.
 * @param {Array} right - The second array to compare.
 * @returns {boolean} `true` if both arrays have the same length and each element is strictly equal (`===`) to the corresponding element in the other array, `false` otherwise.
 */
function areArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Escape a cell value for inclusion in a TSV clipboard payload.
 *
 * Converts `null`/`undefined` to an empty string and replaces embedded tabs and
 * line breaks with spaces so that cell boundaries stay intact when pasted into
 * spreadsheet applications.
 *
 * @param {*} val - The cell value to sanitize.
 * @returns {string} The sanitized string representation.
 */
function sanitizeCellForClipboard(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

// ── Pure DOM helpers (no dependency on page-specific IDs) ───────────────────

/**
 * Update the icon inside a column filter toggle button to reflect whether the column is filtered.
 *
 * @param {HTMLElement} toggleButton - The button element that contains the icon to update.
 * @param {boolean} isFiltered - `true` to show the filter icon, `false` to show the chevron.
 */
function updateFilterIcon(toggleButton, isFiltered) {
  const icon = toggleButton.querySelector('i');
  icon.className = isFiltered ? 'fa-solid fa-filter' : 'fa-solid fa-chevron-down';
}

/**
 * Toggle a checkbox when its containing dropdown item is clicked, treating an indeterminate state as a transition to checked.
 *
 * Prevents clicks that directly target the checkbox input from duplicating behavior, stops the default link-like action,
 * clears `indeterminate` and sets `checked` (toggling unless it was indeterminate, in which case it becomes checked),
 * then dispatches a bubbling `change` event on the checkbox.
 *
 * @param {HTMLElement} dropdownItem - The clickable wrapper element representing a dropdown list item.
 * @param {HTMLInputElement} checkbox - The checkbox input inside the dropdown item to toggle.
 */
function bindDropdownItemToggle(dropdownItem, checkbox) {
  dropdownItem.addEventListener('click', (e) => {
    if (e.target.closest('input') === checkbox) return;

    e.preventDefault();

    // If the checkbox is in an indeterminate state, clicking the row should behave like a user click:
    // clear indeterminate and move to a determinate checked state.
    const nextChecked = checkbox.indeterminate ? true : !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.checked = nextChecked;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

/**
 * Find the non-dragging child element in container that a dragged item at vertical position `y` should be inserted before.
 * @param {HTMLElement} container - The list container to inspect.
 * @param {number} y - The pointer's clientY vertical coordinate.
 * @returns {HTMLElement|null} The child element to insert before, or `null` to append at the end.
 */
function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('.col-select-item:not(.dragging)')];
  return (
    items.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element ?? null
  );
}

const NON_NUMERIC_FORMATS = new Set(['DATE', 'DATETIME', 'TEXT', 'LOV']);

function buildColumnDataTypeMap(columnNames = []) {
  return new Map(columnNames.map(([name, dataType]) => [name, dataType]));
}

function getDateColumnsInTextFilters(appState) {
  const dateCols = [];
  const dataTypeByColumn = buildColumnDataTypeMap(appState.columnNames ?? []);
  for (const [col] of Object.entries(appState.textFilters ?? {})) {
    const data_type = dataTypeByColumn.get(col);
    if (!data_type) continue;
    const fmt = appState.columnFormats?.[col]?.column_type;
    if (fmt === 'DATE' || fmt === 'DATETIME') {
      if (isNumericType(data_type) || isIntegerType(data_type)) {
        dateCols.push(col);
      }
    }
  }
  return dateCols;
}

function getNumericFiltersInTextFilters(appState) {
  const numericFilters = [];
  const textFilters = {};
  const opMap = {
    '>=': 'gte',
    '<=': 'lte',
    '==': 'eq',
    '=': 'eq',
    '>': 'gt',
    '<': 'lt',
  };
  // Match an operator (longer tokens first) followed by an optional-sign numeric value.
  const numericFilterRegex = /^\s*(>=|<=|==|=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/;
  const dataTypeByColumn = buildColumnDataTypeMap(appState.columnNames ?? []);
  for (const [col, val] of Object.entries(appState.textFilters ?? {})) {
    const rawVal = typeof val === 'string' ? val : String(val ?? '');
    const data_type = dataTypeByColumn.get(col);
    if (!data_type) {
      textFilters[col] = rawVal;
      continue;
    }
    const fmt = appState.columnFormats?.[col]?.column_type;
    if (isNumericType(data_type) || isIntegerType(data_type)) {
      if (NON_NUMERIC_FORMATS.has(fmt)) {
        textFilters[col] = rawVal;
        continue;
      } else {
        const match = rawVal.match(numericFilterRegex);
        if (!match) {
          textFilters[col] = rawVal;
          continue;
        }
        const op = opMap[match[1]];
        const value = Number(match[2]);
        if (op === undefined || Number.isNaN(value)) {
          textFilters[col] = rawVal;
          continue;
        }
        numericFilters.push([col, op, value]);
      }
    } else {
      textFilters[col] = rawVal;
    }
  }
  return { numericFilters, textFilters };
}

export {
  // SQL type classification
  defaultFormatType,
  isNumericType,
  isIntegerType,
  isTextType,
  // Excel serial-date helpers
  excelSerialToDate,
  excelSerialToDatetime,
  dateToExcelSerial,
  datetimeToExcelSerial,
  // Currency / numeric formatting
  resolveCurrencySymbol,
  formatNumericValue,
  formatCellValue,
  // JSON pretty-print
  prettyIfJson,
  // Misc utilities
  areArraysEqual,
  sanitizeCellForClipboard,
  // Pure DOM helpers
  updateFilterIcon,
  bindDropdownItemToggle,
  getDragAfterElement,
  // Text filter date column detection
  getDateColumnsInTextFilters,
  // Text filter numeric column detection
  getNumericFiltersInTextFilters,
};
