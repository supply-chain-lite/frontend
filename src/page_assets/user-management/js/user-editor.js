import api from '@/common/js/api';
import { bsToastError, bsToastSuccess } from '@/common/js/bsToast';

export function initUserEditor(state, refreshData) {
  let selectedUser = null;
  let savedSnapshot = '';
  const email = document.getElementById('selectedUserEmail');
  const displayName = document.getElementById('selectedFirstName');
  const role = document.getElementById('selectedUserRole');
  const active = document.getElementById('selectedUserStatus');
  const expiry = document.getElementById('accessExpiry');
  const maxRunsInput = document.getElementById('maxConcurrentRuns');
  const templates = document.getElementById('userTemplates');
  active.addEventListener('change', updateActiveLabel);

  function updateActiveLabel() {
    document.querySelector('label[for="selectedUserStatus"]').textContent = active.checked
      ? 'Active'
      : 'Inactive';
  }

  function snapshot() {
    return JSON.stringify({
      email: email.value,
      displayName: displayName.value,
      role: role.value,
      active: active.checked,
      expiry: expiry.value,
      maxRuns: maxRunsInput.value,
      templates: [...templates.querySelectorAll('input:checked')]
        .map((input) => input.value)
        .sort(),
    });
  }

  function markSaved() {
    savedSnapshot = snapshot();
  }

  function confirmDiscard() {
    if (!savedSnapshot || savedSnapshot === snapshot()) return true;
    return window.confirm('You have unsaved user changes. Discard them and continue?');
  }

  function renderRoles() {
    const currentValue = role.value;
    role.replaceChildren();
    for (const currentRole of state.roles) {
      const option = document.createElement('option');
      option.value = currentRole.RoleName;
      option.textContent = currentRole.RoleName;
      option.disabled =
        currentRole.RoleName === 'SUPER_ADMIN' && selectedUser?.RoleName !== 'SUPER_ADMIN';
      option.selected = currentRole.RoleName === currentValue;
      role.append(option);
    }
    selectFirstAvailableRole();
  }

  function selectFirstAvailableRole() {
    const selectedOption = role.selectedOptions[0];
    if (selectedOption && !selectedOption.disabled) return;
    const firstAvailableRole = [...role.options].find((option) => !option.disabled);
    if (firstAvailableRole) role.value = firstAvailableRole.value;
  }

  function renderTemplates(selectedTemplates = []) {
    templates.replaceChildren();
    for (const templateName of state.templates) {
      const row = document.createElement('div');
      row.className = 'form-check';
      const checkbox = document.createElement('input');
      checkbox.className = 'form-check-input';
      checkbox.type = 'checkbox';
      checkbox.id = `template-${templateName.replace(/[^a-z0-9]/gi, '-')}`;
      checkbox.value = templateName;
      checkbox.checked = selectedTemplates.includes(templateName);
      const label = document.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = checkbox.id;
      label.textContent = templateName;
      row.append(checkbox, label);
      templates.append(row);
    }
    if (!state.templates.length) templates.textContent = 'No templates are available.';
  }

  function select(user) {
    if (!confirmDiscard()) return false;
    selectedUser = user;
    email.value = user.UserEmail;
    email.readOnly = true;
    displayName.value = user.DisplayName;
    role.value = user.RoleName;
    renderRoles();
    active.checked = user.IsActive === 1;
    updateActiveLabel();
    expiry.value = user.EndDate;
    maxRunsInput.value = user.MaxConcurrentRuns;
    renderTemplates(user.Templates || []);
    markSaved();
    return true;
  }

  function add() {
    if (!confirmDiscard()) return false;
    selectedUser = null;
    email.value = '';
    email.readOnly = false;
    displayName.value = '';
    renderRoles();
    active.checked = true;
    updateActiveLabel();
    expiry.value = '';
    maxRunsInput.value = 1;
    renderTemplates();
    markSaved();
    return true;
  }

  function saveAs() {
    if (!selectedUser) return false;
    selectedUser = null;
    email.value = '';
    email.readOnly = false;
    displayName.value = '';
    expiry.value = '';
    renderRoles();
    markSaved();
    return true;
  }

  async function save() {
    const selectedTemplates = [...templates.querySelectorAll('input:checked')].map(
      (input) => input.value
    );
    const payload = {
      UserEmail: email.value.trim(),
      DisplayName: displayName.value.trim(),
      RoleName: role.value,
      EndDate: expiry.value,
      MaxConcurrentRuns: Number(maxRunsInput.value),
      Templates: selectedTemplates,
    };
    if (selectedUser) payload.IsActive = Number(active.checked);
    if (
      !payload.UserEmail ||
      !payload.DisplayName ||
      !payload.RoleName ||
      !payload.EndDate ||
      payload.MaxConcurrentRuns < 1
    ) {
      email.form.reportValidity();
      return false;
    }
    if (
      !selectedUser &&
      state.userDetails.some(
        (user) => user.UserEmail.toLowerCase() === payload.UserEmail.toLowerCase()
      )
    ) {
      bsToastError('A user with this email already exists.');
      email.focus();
      return false;
    }
    const endpoint = selectedUser ? 'update-user' : 'add-user';
    const selectedUserEmail = selectedUser?.UserEmail;
    const isNewUser = !selectedUser;
    const response = await api.post(`/user-management/${endpoint}`, payload);
    bsToastSuccess(response.message);
    await refreshData();

    const savedUser = state.userDetails.find(
      (user) =>
        user.UserEmail?.toLowerCase() === (selectedUserEmail || payload.UserEmail).toLowerCase()
    ) || {
      ...payload,
      IsActive: Number(active.checked),
    };

    if (
      isNewUser &&
      !state.userDetails.some(
        (user) => user.UserEmail?.toLowerCase() === payload.UserEmail.toLowerCase()
      )
    ) {
      state.userDetails.unshift(savedUser);
    }
    selectedUser = savedUser;

    markSaved();
    return savedUser;
  }

  return {
    select,
    add,
    saveAs,
    save,
    hasSelectedUser: () => selectedUser !== null,
    refresh: () => {
      const selectedTemplates = [...templates.querySelectorAll('input:checked')].map(
        (input) => input.value
      );
      renderRoles();
      if (!selectedUser) renderTemplates(selectedTemplates);
    },
  };
}
