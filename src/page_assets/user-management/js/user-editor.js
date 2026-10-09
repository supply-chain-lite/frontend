import api from '@/common/js/api';
import { bsToastError, bsToastSuccess } from '@/common/js/bsToast';
import { initModelAccess } from './model-access';

/**
 * @typedef {import('./model-assignments').UserModelAssignment} UserModelAssignment
 * @typedef {Object} UserDetails
 * @property {string} UserEmail
 * @property {string} DisplayName
 * @property {string} RoleName
 * @property {number} IsActive
 * @property {string} EndDate
 * @property {number} MaxConcurrentRuns
 * @property {string[]} Templates
 * @property {UserModelAssignment[]} userModels Only this user's non-owned models.
 * @typedef {{userDetails: UserDetails[]}} GetUsersResponse
 * @typedef {Object} UserSaveRequest
 * @property {string} UserEmail
 * @property {string} DisplayName
 * @property {string} EndDate
 * @property {number} MaxConcurrentRuns
 * @property {string[]} Templates
 * @property {string} [RoleName]
 * @property {number} [IsActive]
 * @property {UserModelAssignment[]|null} [userModels] Omit/null skips updates; [] clears them.
 * @typedef {UserSaveRequest & {RoleName: string}} AddUserRequest
 * @typedef {UserSaveRequest & {IsActive: number}} UpdateUserRequest
 */

export function initUserEditor(state, refreshData) {
  let selectedUser = null;
  let savedSnapshot = '';
  const modelAccess = initModelAccess();
  const email = document.getElementById('selectedUserEmail');
  const displayName = document.getElementById('selectedFirstName');
  const role = document.getElementById('selectedUserRole');
  const active = document.getElementById('selectedUserStatus');
  const expiry = document.getElementById('accessExpiry');
  const maxRunsInput = document.getElementById('maxConcurrentRuns');
  const templates = document.getElementById('userTemplates');
  const modelAccessTab = document.getElementById('user-models-tab');
  const modelAccessTabItem = modelAccessTab.closest('.nav-item');
  const currentUserEmail =
    JSON.parse(sessionStorage.getItem('user') || '{}')
      .email?.trim()
      .toLowerCase() || '';
  active.addEventListener('change', updateActiveLabel);

  function updateModelAccessVisibility(userEmail) {
    const isCurrentUser =
      Boolean(currentUserEmail) && userEmail?.trim().toLowerCase() === currentUserEmail;
    if (isCurrentUser && modelAccessTab.classList.contains('active')) {
      document.getElementById('user-details-tab').click();
    }
    modelAccessTabItem.hidden = isCurrentUser;
  }

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
      userModels: modelAccess.snapshot(),
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
    modelAccess.select(user);
    updateModelAccessVisibility(user.UserEmail);
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
    modelAccess.add();
    updateModelAccessVisibility('');
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
    modelAccess.saveAs();
    updateModelAccessVisibility('');
    markSaved();
    return true;
  }

  async function save() {
    const selectedTemplates = [...templates.querySelectorAll('input:checked')].map(
      (input) => input.value
    );
    /** @type {UserSaveRequest} */
    const payload = {
      UserEmail: email.value.trim(),
      DisplayName: displayName.value.trim(),
      EndDate: expiry.value,
      MaxConcurrentRuns: Number(maxRunsInput.value),
      Templates: selectedTemplates,
    };
    if (!selectedUser || role.value !== selectedUser.RoleName) payload.RoleName = role.value;
    if (selectedUser) payload.IsActive = Number(active.checked);
    if (
      !payload.UserEmail ||
      !payload.DisplayName ||
      !role.value ||
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
    const requestedModels = modelAccess.requestModels(!selectedUser);
    if (requestedModels !== undefined) {
      if (
        requestedModels.some(
          (model) => !['read', 'write', 'execute', 'admin'].includes(model.AccessLevel)
        )
      ) {
        bsToastError('Choose a supported access level for each assigned model.');
        return false;
      }
      payload.userModels = requestedModels;
    }
    const endpoint = selectedUser ? 'update-user' : 'add-user';
    const selectedUserEmail = selectedUser?.UserEmail;
    const isNewUser = !selectedUser;
    const response = await api.post(`/user-management/${endpoint}`, payload);
    bsToastSuccess(response.message);
    await refreshData();

    // Never use submitted assignments as evidence that model access was persisted.
    const userFields = { ...payload };
    delete userFields.userModels;
    const savedUser = state.userDetails.find(
      (user) =>
        user.UserEmail?.toLowerCase() === (selectedUserEmail || payload.UserEmail).toLowerCase()
    ) || {
      ...selectedUser,
      ...userFields,
      userModels: selectedUser?.userModels || [],
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
    modelAccess.select(savedUser);

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
