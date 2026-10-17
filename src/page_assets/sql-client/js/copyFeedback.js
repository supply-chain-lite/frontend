const feedbackByButton = new WeakMap();

/** Show copy confirmation and restore the original button after two seconds. */
export function showCopyFeedback(button) {
  const previous = feedbackByButton.get(button);
  window.clearTimeout(previous?.timer);
  const originalMarkup = previous?.originalMarkup ?? button.innerHTML;
  const originalLabel = previous ? previous.originalLabel : button.getAttribute('aria-label');
  button.innerHTML = '<i class="fa-solid fa-check me-1" aria-hidden="true"></i>Copied';
  button.setAttribute('aria-label', 'Copied');
  const timer = window.setTimeout(() => {
    button.innerHTML = originalMarkup;
    if (originalLabel === null) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', originalLabel);
    feedbackByButton.delete(button);
  }, 2000);
  feedbackByButton.set(button, { originalMarkup, originalLabel, timer });
}
