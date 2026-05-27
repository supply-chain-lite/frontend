import api from '@/common/js/api';
import { $ } from '@/common/js/dom';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';

/**
 * Populate the notifications dropdown and update the unread indicator.
 *
 * Fetches notifications, renders them into #notificationList (including "New" badges for unread items),
 * toggles the visibility of #notificationDot when unread notifications exist, and appends a divider with a
 * "View all notifications" link. If a notification has type "model_share_request", clicking it opens the
 * accept-model modal populated from the notification. On fetch failure or when there are no notifications,
 * replaces the list with an appropriate message and hides the unread dot if present.
 */
export async function initNotifications() {
  const list = $('#notificationList');
  const dot = $('#notificationDot');
  if (!list) return;

  let notifications;
  try {
    const data = await api.post('/models/get-notifications');
    notifications = data.notifications || [];
  } catch {
    list.innerHTML = '<li class="dropdown-item text-danger">Failed to load notifications</li>';
    if (dot) dot.style.display = 'none';
    return;
  }

  // ── Render list ──────────────────────────────────────────────────────────
  if (!notifications || notifications.length === 0) {
    list.innerHTML = '<li class="dropdown-item text-muted">No notifications</li>';
    if (dot) dot.style.display = 'none';
    return;
  }

  const hasUnread = notifications.some((notification) => notification.is_read === 0);

  if (dot) dot.style.display = hasUnread ? 'block' : 'none';

  list.innerHTML = '';

  notifications.forEach((notification) => {
    const li = document.createElement('li');
    li.dataset.notificationId = notification.notification_id;
    const a = document.createElement('a');
    a.className = 'dropdown-item d-flex justify-content-between align-items-center';
    a.href = '#';

    const label = document.createElement('small');
    label.textContent = notification.title || notification.message;
    a.appendChild(label);

    if (notification.is_read === 0) {
      const badge = document.createElement('span');
      if (notification.notification_level === 'INFO') {
        badge.className = 'badge bg-primary ms-2';
      } else if (notification.notification_level === 'WARNING') {
        badge.className = 'badge bg-warning ms-2';
      } else if (notification.notification_level === 'ERROR') {
        badge.className = 'badge bg-danger ms-2';
      } else {
        badge.className = 'badge bg-secondary ms-2';
      }
      badge.textContent = 'New';
      a.appendChild(badge);
    }

    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (notification.notification_type === 'model_share_request') {
        openAcceptModelModal(notification);
      } else {
        openNotificationModal(notification);
      }
    });

    li.appendChild(a);
    list.appendChild(li);
  });

  // ── Divider + "View all" link ──────────────────────────────────────────
  const divider = document.createElement('li');
  divider.innerHTML = '<hr class="dropdown-divider">';
  list.appendChild(divider);

  const viewAll = document.createElement('li');
  viewAll.innerHTML =
    '<a class="dropdown-item small text-muted" href="#">View all notifications</a>';
  list.appendChild(viewAll);
}

/**
 * Populate and display the Accept Model modal using values from a notification.
 *
 * Populates form fields for sender email, model name, project name, and notification id
 * from the provided notification object, then opens the Bootstrap modal #acceptModelModal.
 *
 * @param {Object} notification - Notification data used to fill the modal.
 * @param {string} [notification.from_user_email] - Email of the user who sent the model share request.
 * @param {string} [notification.model_name] - Name of the shared model.
 * @param {string} [notification.project_name] - Name of the project containing the model.
 * @param {string|number} [notification.notification_id] - Identifier of the notification.
 */
function openAcceptModelModal(notification) {
  const fromUserInput = $('#acceptFromUser');
  const modelNameInput = $('#acceptModelName');
  const projectNameHidden = $('#acceptProjectName');
  const notificationIdHidden = $('#acceptNotificationId');

  if (fromUserInput) fromUserInput.value = notification.from_user_email || '';
  if (modelNameInput) modelNameInput.value = notification.model_name || '';
  if (projectNameHidden) projectNameHidden.value = notification.project_name || '';
  if (notificationIdHidden) notificationIdHidden.value = notification.notification_id || '';

  const modalEl = $('#acceptModelModal');
  if (modalEl) {
    const modal = new window.bootstrap.Modal(modalEl);
    modal.show();
  }
}

/**
 * Remove the "New" badge from a notification list item and hide
 * #notificationDot if no unread badges remain.
 */
function markNotificationReadInUI(notificationId) {
  const list = $('#notificationList');
  if (!list) return;

  const li = list.querySelector(`li[data-notification-id="${notificationId}"]`);
  if (li) {
    const newBadge = li.querySelector('.badge');
    if (newBadge) newBadge.remove();
  }

  // Hide dot if no "New" badges remain anywhere in the list
  const remaining = list.querySelectorAll('.badge');
  const dot = $('#notificationDot');
  if (dot && remaining.length === 0) {
    dot.style.display = 'none';
  }
}

function openNotificationModal(notification) {
  const notification_id = notification.notification_id || '';
  const notification_title = notification.title || 'Notification';
  const project_name = notification.project_name || '';
  const model_name = notification.model_name || '';
  const notification_level = notification.notification_level || 'INFO';
  const message = notification.message || '';
  const task_id = notification.task_id || null;

  // Populate fields
  const titleInput = $('#notificationModalLabel');
  const modelInput = $('#notifModalModelName');
  const projectInput = $('#notifModalProjectName');
  const messageDiv = $('#notifModalMessage');
  const hiddenId = $('#notifModalNotificationId');

  if (titleInput) titleInput.textContent = notification_title;
  if (modelInput) modelInput.value = model_name;
  if (projectInput) projectInput.value = project_name;
  if (hiddenId) {
    hiddenId.value = notification_id;
    if (task_id) hiddenId.dataset.taskId = task_id;
  }

  // Color-code the message based on notification level
  if (messageDiv) {
    messageDiv.textContent = message;
    messageDiv.className = 'alert mb-0';
    if (notification_level === 'INFO') {
      messageDiv.classList.add('alert-info');
    } else if (notification_level === 'WARNING') {
      messageDiv.classList.add('alert-warning');
    } else if (notification_level === 'ERROR') {
      messageDiv.classList.add('alert-danger');
    } else {
      messageDiv.classList.add('alert-secondary');
    }
  }

  const modalEl = $('#notificationModal');
  if (!modalEl) return;

  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  // Show or hide the Details button based on task_id
  const detailsBtn = $('#submitNotifModalDetailsBtn');
  if (detailsBtn) {
    if (task_id) {
      detailsBtn.classList.remove('d-none');
    } else {
      detailsBtn.classList.add('d-none');
    }
  }

  // Wire OK button to mark notification as read
  const okBtn = $('#submitNotifModalOkBtn');

  let isSubmitting = false;

  /** Mark the notification as read (shared by OK and Details). */
  const markRead = async () => {
    if (notification.is_read === 0) {
      try {
        await api.post('/models/mark-notification-read', {
          notification_id: notification_id,
        });
        toastSuccess('Notification marked as read', 400);
        notification.is_read = 1;
        markNotificationReadInUI(notification_id);
      } catch {
        toastError('Failed to mark notification as read');
      }
    }
  };

  const okHandler = async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    if (okBtn) okBtn.disabled = true;
    await markRead();
    if (okBtn) okBtn.disabled = false;
    isSubmitting = false;
    modal.hide();
  };

  const detailsHandler = async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    if (detailsBtn) detailsBtn.disabled = true;
    await markRead();
    if (detailsBtn) detailsBtn.disabled = false;
    isSubmitting = false;
    modal.hide();

    const params = new URLSearchParams({
      task_id: task_id,
      model_name: model_name,
      project_name: project_name,
    });
    window.open(`task-details.html?${params.toString()}`, '_blank');
  };

  if (okBtn) okBtn.addEventListener('click', okHandler);
  if (detailsBtn && task_id) detailsBtn.addEventListener('click', detailsHandler);

  // Clean up listeners when modal closes by any means (X, backdrop, OK, or Details)
  modalEl.addEventListener(
    'hidden.bs.modal',
    () => {
      if (okBtn) okBtn.removeEventListener('click', okHandler);
      if (detailsBtn) detailsBtn.removeEventListener('click', detailsHandler);
    },
    { once: true }
  );
}
