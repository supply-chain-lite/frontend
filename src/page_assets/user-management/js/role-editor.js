import api from '@/common/js/api';
import { bsToastError, bsToastSuccess } from '@/common/js/bsToast';

export function initRoleEditor(state, refreshData) {
  let selectedRole = null;
  let savedSnapshot = '';
  const name = document.getElementById('selectedRoleName');
  const description = document.getElementById('selectedRoleDescription');
  const canAddNewModel = document.getElementById('adminRoleFlag');
  const permissions = document.getElementById('roleModules');
  const assignedUsers = document.getElementById('roleAssignedUsers');
  const homePage = document.getElementById('selectedRoleHomePage');
  canAddNewModel.addEventListener('change', updateCanAddModelLabel);

  function updateCanAddModelLabel() {
    document.querySelector('label[for="adminRoleFlag"]').textContent = canAddNewModel.checked
      ? 'Yes'
      : 'No';
  }

  function snapshot() {
    return JSON.stringify({
      name: name.value,
      description: description.value,
      canAddNewModel: canAddNewModel.checked,
      homePage: homePage.value,
      modules: [...permissions.querySelectorAll('input:checked')]
        .map((input) => input.value)
        .sort(),
    });
  }

  function markSaved() {
    savedSnapshot = snapshot();
  }

  function confirmDiscard() {
    if (!savedSnapshot || savedSnapshot === snapshot()) return true;
    return window.confirm('You have unsaved role changes. Discard them and continue?');
  }

  function renderHomePages() {
    const selectedValue = homePage.value;
    homePage.replaceChildren();
    for (const page of state.HomePages) {
      const option = document.createElement('option');
      option.value = page;
      option.textContent = page;
      option.selected = page === selectedValue;
      homePage.append(option);
    }
  }

  function renderModules(selectedModules = []) {
    permissions.replaceChildren();
    for (const moduleName of state.modules) {
      const row = document.createElement('div');
      row.className = 'form-check';
      const checkbox = document.createElement('input');
      checkbox.className = 'form-check-input';
      checkbox.type = 'checkbox';
      checkbox.id = `module-${moduleName.replace(/[^a-z0-9]/gi, '-')}`;
      checkbox.value = moduleName;
      checkbox.checked = selectedModules.includes(moduleName);
      const label = document.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = checkbox.id;
      label.textContent = moduleName;
      row.append(checkbox, label);
      permissions.append(row);
    }
    if (!state.modules.length) permissions.textContent = 'No modules are available.';
  }

  function renderAssignedUsers(roleName) {
    assignedUsers.replaceChildren();
    const users = state.userDetails.filter((user) => user.RoleName === roleName);
    if (!users.length) assignedUsers.textContent = 'No users are assigned to this role.';
    for (const user of users) {
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex align-items-center ps-1';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-user me-2';
      item.append(icon, document.createTextNode(user.UserEmail));
      assignedUsers.append(item);
    }
  }

  function select(role) {
    if (!confirmDiscard()) return false;
    selectedRole = role;
    name.value = role.RoleName;
    description.value = role.RoleDescription;
    canAddNewModel.checked = role.CanAddNewModel === 1;
    updateCanAddModelLabel();
    homePage.value = role.HomePage;
    renderModules(role.Modules || []);
    renderAssignedUsers(role.RoleName);
    markSaved();
    return true;
  }

  function add() {
    if (!confirmDiscard()) return false;
    selectedRole = null;
    name.value = '';
    description.value = '';
    canAddNewModel.checked = false;
    updateCanAddModelLabel();
    homePage.selectedIndex = 0;
    renderModules();
    assignedUsers.replaceChildren();
    markSaved();
    return true;
  }

  async function save() {
    const payload = {
      RoleName: name.value.trim(),
      RoleDescription: description.value.trim(),
      HomePage: homePage.value,
      Modules: [...permissions.querySelectorAll('input:checked')].map((input) => input.value),
      CanAddNewModel: Number(canAddNewModel.checked),
    };
    if (!payload.RoleName || !payload.RoleDescription || !payload.HomePage) {
      name.form?.reportValidity();
      return false;
    }
    if (
      !selectedRole &&
      state.roles.some((role) => role.RoleName.toLowerCase() === payload.RoleName.toLowerCase())
    ) {
      bsToastError('A role with this name already exists.');
      name.focus();
      return false;
    }
    const endpoint = selectedRole ? 'update-role' : 'add-role';
    if (selectedRole) payload.RoleId = selectedRole.RoleId;
    const selectedRoleId = selectedRole?.RoleId;
    const response = await api.post(`/user-management/${endpoint}`, payload);
    bsToastSuccess(response.message);
    await refreshData();

    const savedRole = state.roles.find((role) =>
      selectedRoleId
        ? role.RoleId === selectedRoleId
        : role.RoleName?.toLowerCase() === payload.RoleName.toLowerCase()
    ) || {
      ...payload,
      RoleId: response.RoleId || null,
      CanAddNewModel: Number(payload.CanAddNewModel),
    };
    selectedRole = savedRole;

    markSaved();
    return savedRole;
  }

  return {
    select,
    add,
    save,
    refresh: () => {
      const selectedModules = [...permissions.querySelectorAll('input:checked')].map(
        (input) => input.value
      );
      renderHomePages();
      if (!selectedRole) renderModules(selectedModules);
    },
  };
}
