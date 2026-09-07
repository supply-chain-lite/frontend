export function initDirectory({ listId, searchId, paginationId, icon, label, onSelect }) {
  let records = [];
  let page = 0;
  let selectedRecord = null;
  let draftLabel = '';
  const pageSize = 10;
  const list = document.getElementById(listId);
  const search = searchId ? document.getElementById(searchId) : null;
  const pagination = paginationId ? document.getElementById(paginationId) : null;

  function visibleRecords() {
    const term = search?.value.trim().toLowerCase() || '';
    return records.filter((record) =>
      String(label(record) ?? '')
        .toLowerCase()
        .includes(term)
    );
  }

  function render() {
    const matches = visibleRecords();
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages - 1);
    list.replaceChildren();
    if (draftLabel) {
      const draft = document.createElement('a');
      draft.href = '#';
      draft.className = 'list-group-item list-group-item-action ps-1 active';
      const draftIcon = document.createElement('i');
      draftIcon.className = `fa-solid ${icon} me-2`;
      draft.append(draftIcon, document.createTextNode(draftLabel));
      draft.addEventListener('click', (event) => event.preventDefault());
      list.append(draft);
    }
    for (const record of matches.slice(page * pageSize, (page + 1) * pageSize)) {
      const item = document.createElement('a');
      item.href = '#';
      item.className = `list-group-item list-group-item-action ps-1${
        record === selectedRecord ? ' active' : ''
      }`;
      const recordIcon = document.createElement('i');
      recordIcon.className = `fa-solid ${icon} me-2`;
      item.append(recordIcon, document.createTextNode(label(record)));
      item.addEventListener('click', (event) => {
        event.preventDefault();
        select(record);
      });
      list.append(item);
    }
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'list-group-item text-muted';
      empty.textContent = 'No records found.';
      list.append(empty);
    }
    if (!pagination) return;
    pagination.replaceChildren();
    const group = document.createElement('div');
    group.className = 'btn-group w-100';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${listId} pagination`);
    group.append(
      createPageButton('Previous', page === 0, () => {
        page -= 1;
        render();
      })
    );
    const firstPage = Math.max(0, Math.min(page - 1, pages - 4));
    const lastPage = Math.min(pages, firstPage + 4);
    for (let pageNumber = firstPage; pageNumber < lastPage; pageNumber += 1) {
      group.append(
        createPageButton(
          String(pageNumber + 1),
          false,
          () => {
            page = pageNumber;
            render();
          },
          pageNumber === page
        )
      );
    }
    group.append(
      createPageButton('Next', page === pages - 1, () => {
        page += 1;
        render();
      })
    );
    pagination.append(group);
  }

  if (search)
    search.addEventListener('input', () => {
      page = 0;
      render();
    });
  function select(record) {
    if (onSelect(record) === false) return false;
    const recordIndex = visibleRecords().indexOf(record);
    if (recordIndex !== -1) page = Math.floor(recordIndex / pageSize);
    selectedRecord = record;
    render();
    return true;
  }

  return {
    render: (nextRecords) => {
      records = nextRecords;
      selectedRecord = null;
      page = 0;
      render();
    },
    select: (record) => select(record),
    selectFirst: () => {
      if (records.length) select(records[0]);
    },
    hasSelection: () => selectedRecord !== null || Boolean(draftLabel),
    setDraft: (labelText) => {
      draftLabel = labelText;
      selectedRecord = null;
      render();
    },
    clearDraft: () => {
      draftLabel = '';
      render();
    },
  };
}

function createPageButton(label, disabled, action, active = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${active ? 'btn-dark' : 'btn-outline-secondary'}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}
