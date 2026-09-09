import { formatJsonLosslessly } from './jsonFormat.js';
import { Modal } from 'bootstrap/dist/js/bootstrap.bundle.min.js';
import { bsToastError } from '../../../common/js/bsToast.js';

const modalElement = document.getElementById('jsonValueModal');
const content = document.getElementById('jsonValueContent');
const modal = new Modal(modalElement);
const cellSelector = '#sclTableBody td[title]';
const controls =
  'input, textarea, select, button, [contenteditable], [role="textbox"], [role="combobox"], [role="button"], .CodeMirror, .cm-editor, .ace_editor, .monaco-editor';
let hoveredCell = null;
let previousFocus = null;

// Delegate because result rows are replaced on refresh and during inline editing.
document.addEventListener('mouseover', (event) => {
  hoveredCell = event.target.closest?.(cellSelector) ?? null;
});
document.addEventListener('mouseout', (event) => {
  if (hoveredCell && !hoveredCell.contains(event.relatedTarget)) hoveredCell = null;
});
window.addEventListener('blur', () => {
  hoveredCell = null;
});

document.addEventListener('keydown', (event) => {
  if (
    (event.code !== 'Space' && event.key !== ' ') ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    !hoveredCell?.isConnected ||
    !hoveredCell.matches(':hover') ||
    event.target.closest?.(controls) ||
    document.activeElement?.closest(controls) ||
    document.querySelector('.modal.show')
  )
    return;

  // Native tooltip display is truncated, but the title property retains all text.
  const text = hoveredCell.title;
  if (!text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) return;
  let prettyJson;
  try {
    prettyJson = formatJsonLosslessly(text);
  } catch {
    return;
  }
  event.preventDefault();
  previousFocus = document.activeElement;
  content.textContent = prettyJson;
  hoveredCell = null;
  modal.show();
});

modalElement.addEventListener('hidden.bs.modal', () => {
  content.textContent = '';
  previousFocus?.focus({ preventScroll: true });
});

document.getElementById('copyJsonValue').addEventListener('click', async () => {
  const text = content.textContent;
  try {
    await window.navigator.clipboard.writeText(text);
  } catch {
    // Keep the fallback inside the modal so Bootstrap's focus trap allows selection.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.className = 'position-fixed opacity-0';
    textarea.setAttribute('aria-label', 'JSON to copy');
    modalElement.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } catch {
      bsToastError('Could not copy JSON. Please select and copy the text manually.');
    } finally {
      textarea.remove();
      document.getElementById('copyJsonValue').focus();
    }
  }
});
