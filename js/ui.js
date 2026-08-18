/**
 * Smart Expense Splitter - UI Rendering & View Management Module
 */

// Universal import fallback for calculation module if running in browser
const calc = typeof window !== 'undefined' && window.calculateBalances ? window : (typeof require !== 'undefined' ? require('./calculation.js') : {});

// Color generator for avatar backgrounds based on string hash
function getAvatarColor(name) {
  const colors = [
    '#4f46e5', '#0284c7', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#c026d3', '#db2777', '#475569'
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Extract initials from name (e.g. "Rahul Sharma" -> "RS")
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Navigation screen switcher
 * @param {string} screenId - ID of screen element to make visible
 */
function showScreen(screenId) {
  const screens = ['screen-welcome', 'screen-create-group', 'screen-members-setup', 'screen-dashboard'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
}

/**
 * Inline validation error display utility
 */
function showFieldError(fieldEl, message) {
  if (!fieldEl) return;
  fieldEl.classList.add('input-error');
  
  let errorEl = fieldEl.parentNode.querySelector('.error-text');
  if (!errorEl) {
    errorEl = document.createElement('span');
    errorEl.className = 'error-text';
    fieldEl.parentNode.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFieldError(fieldEl) {
  if (!fieldEl) return;
  fieldEl.classList.remove('input-error');
  const errorEl = fieldEl.parentNode.querySelector('.error-text');
  if (errorEl) {
    errorEl.remove();
  }
}

/**
 * Toast notifications
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

/**
 * Modal handlers
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Renders Header, Group Info & Theme Icon Toggle
 */
function renderHeader(appState) {
  const groupBadge = document.getElementById('header-group-name');
  if (groupBadge) {
    if (appState.group && appState.group.name) {
      groupBadge.textContent = appState.group.name;
      groupBadge.classList.remove('hidden');
    } else {
      groupBadge.classList.add('hidden');
    }
  }

  // Theme selector state sync
  const currentTheme = appState.theme || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);

  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    if (currentTheme === 'dark') {
      themeBtn.setAttribute('title', 'Switch to Light Mode');
      themeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    } else {
      themeBtn.setAttribute('title', 'Switch to Dark Mode');
      themeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    }
  }

  // Update Undo & Redo controls state
  updateUndoRedoUI(appState);
  renderGroupSwitcher(appState);
}

/**
 * Updates Undo and Redo header button states and tooltips based on history stack.
 * 
 * @param {Object} [appStateOrInfo] 
 */
function updateUndoRedoUI(appStateOrInfo) {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  const historyManager = typeof window !== 'undefined' && window.getHistoryInfo ? window : (typeof require !== 'undefined' ? require('./history.js') : {});
  const info = (appStateOrInfo && typeof appStateOrInfo.canUndo !== 'undefined')
    ? appStateOrInfo
    : (historyManager.getHistoryInfo ? historyManager.getHistoryInfo(appStateOrInfo) : { canUndo: false, canRedo: false });

  if (btnUndo) {
    if (info.canUndo) {
      btnUndo.removeAttribute('disabled');
      btnUndo.title = `Undo: ${info.undoActionName || 'Last Action'} (Ctrl+Z)`;
    } else {
      btnUndo.setAttribute('disabled', 'true');
      btnUndo.title = 'Nothing to undo (Ctrl+Z)';
    }
  }

  if (btnRedo) {
    if (info.canRedo) {
      btnRedo.removeAttribute('disabled');
      btnRedo.title = `Redo: ${info.redoActionName || 'Last Action'} (Ctrl+Y)`;
    } else {
      btnRedo.setAttribute('disabled', 'true');
      btnRedo.title = 'Nothing to redo (Ctrl+Y)';
    }
  }
}

/**
 * Renders the visible Group Switcher dropdown control.
 * @param {Object} appState 
 */
function renderGroupSwitcher(appState) {
  const container = document.getElementById('group-switcher-container');
  if (!container) return;

  const groups = appState.groups || [];

  if (groups.length === 0) {
    container.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-header-create-group">
        + Create Group
      </button>
    `;
    return;
  }

  let optionsHtml = groups.map(g => {
    const isSelected = g.id === appState.activeGroupId;
    return `<option value="${g.id}" ${isSelected ? 'selected' : ''}>🌴 ${escapeHtml(g.name)}</option>`;
  }).join('');

  optionsHtml += `
    <option value="__action_create_group__">+ Create New Group...</option>
    <option value="__action_manage_groups__">⚙ Manage Groups (${groups.length})...</option>
  `;

  container.innerHTML = `
    <div class="group-switcher-wrapper" style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 0.85rem; font-weight: 500; color: var(--color-text-muted);">Workspace:</span>
      <select id="select-active-group" class="group-switcher-select" style="padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--color-surface-border); background: var(--color-surface); color: var(--color-text-main); font-size: 0.9rem; font-weight: 600; cursor: pointer;">
        ${optionsHtml}
      </select>
    </div>
  `;
}

/**
 * Renders list of group workspace cards inside Manage Groups modal.
 * @param {Object} appState 
 */
function renderManageGroupsModal(appState) {
  const container = document.getElementById('manage-groups-cards-list');
  if (!container) return;

  const groups = appState.groups || [];
  if (groups.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
        <p>No expense groups available.</p>
        <button type="button" class="btn btn-primary btn-sm" id="btn-manage-create-first-group" style="margin-top: 10px;">
          + Create New Group
        </button>
      </div>
    `;
    return;
  }

  const expModule = typeof window !== 'undefined' && window.getGroupMetrics ? window : (typeof require !== 'undefined' ? require('./expense.js') : {});

  container.innerHTML = groups.map(g => {
    const isActive = g.id === appState.activeGroupId;
    const metrics = expModule.getGroupMetrics ? expModule.getGroupMetrics(g) : { memberCount: 0, expenseCount: 0, totalSpent: 0 };
    
    return `
      <div class="group-card ${isActive ? 'active-group-card' : ''}" style="border: 1px solid var(--color-surface-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; background: var(--color-surface);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h4 style="margin: 0; font-size: 1.1rem; font-weight: 600;">${escapeHtml(g.name)}</h4>
            ${isActive ? '<span class="badge badge-success" style="background: rgba(46, 204, 113, 0.15); color: #27ae60; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Active</span>' : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            ${!isActive ? `<button type="button" class="btn btn-sm btn-secondary btn-switch-group" data-id="${g.id}">Open</button>` : ''}
            <button type="button" class="btn btn-sm btn-secondary btn-open-rename-group" data-id="${g.id}" data-name="${escapeHtml(g.name)}">Rename</button>
            <button type="button" class="btn btn-sm btn-danger btn-open-delete-group" data-id="${g.id}" data-name="${escapeHtml(g.name)}">Delete</button>
          </div>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.85rem; color: var(--color-text-muted);">
          <span>👥 <strong>${metrics.memberCount}</strong> Members</span>
          <span>💳 <strong>${metrics.expenseCount}</strong> Expenses</span>
          <span>💰 <strong>₹${metrics.totalSpent.toFixed(2)}</strong> Spent</span>
          ${metrics.budget !== null ? `<span>🎯 Budget: ₹${metrics.budget.toFixed(2)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renders Summary Cards Row on Dashboard
 */
function renderSummaryCards(appState) {
  const totalExpEl = document.getElementById('stat-total-expenses');
  const totalMembersEl = document.getElementById('stat-total-members');
  const yourBalanceEl = document.getElementById('stat-your-balance');
  const yourContributionEl = document.getElementById('stat-your-contribution');
  const yourBalanceCard = document.getElementById('card-your-balance');

  const totalExpenseAmount = (appState.expenses || []).reduce(
    (acc, exp) => acc + (parseFloat(exp.amount) || 0), 0
  );
  if (totalExpEl) totalExpEl.textContent = `₹${totalExpenseAmount.toFixed(2)}`;
  if (totalMembersEl) totalMembersEl.textContent = (appState.members || []).length;

  const currentUserId = appState.group ? appState.group.currentUserId : null;
  const balancesMap = calc.calculateBalances ? calc.calculateBalances(appState.members, appState.expenses) : {};

  if (currentUserId && balancesMap[currentUserId]) {
    const userBal = balancesMap[currentUserId];
    const netBal = userBal.balance;
    const paidAmt = userBal.paid;

    if (yourContributionEl) yourContributionEl.textContent = `₹${paidAmt.toFixed(2)}`;

    if (yourBalanceEl) {
      if (netBal > 0) {
        yourBalanceEl.textContent = `+₹${netBal.toFixed(2)}`;
        yourBalanceEl.className = 'stat-value text-success';
        if (yourBalanceCard) yourBalanceCard.className = 'stat-card stat-success';
      } else if (netBal < 0) {
        yourBalanceEl.textContent = `-₹${Math.abs(netBal).toFixed(2)}`;
        yourBalanceEl.className = 'stat-value text-danger';
        if (yourBalanceCard) yourBalanceCard.className = 'stat-card stat-danger';
      } else {
        yourBalanceEl.textContent = `₹0.00`;
        yourBalanceEl.className = 'stat-value';
        if (yourBalanceCard) yourBalanceCard.className = 'stat-card';
      }
    }
  } else {
    if (yourBalanceEl) yourBalanceEl.textContent = '₹0.00';
    if (yourContributionEl) yourContributionEl.textContent = '₹0.00';
  }
}

/**
 * Renders Expense List (Table for desktop, Cards for mobile)
 */
/**
 * Renders Expense List (Table for desktop, Cards for mobile) with full Search & Filters
 * 
 * @param {Object} appState 
 * @param {Object} filterState 
 */
function renderExpenseList(appState, filterState = {}) {
  const tableBody = document.getElementById('expense-table-body');
  const cardsList = document.getElementById('expense-cards-list');
  const emptyState = document.getElementById('expenses-empty-state');
  const tableContainer = document.querySelector('.table-responsive');
  const resultsCountEl = document.getElementById('filter-results-count');
  const totalAmountBadgeEl = document.getElementById('filter-total-amount-badge');
  const activeChipsContainer = document.getElementById('active-filter-chips');
  const btnClearFilters = document.getElementById('btn-clear-filters');
  const paidBySelect = document.getElementById('select-filter-paid-by');

  if (!tableBody || !cardsList) return;

  const members = appState.members || [];
  const rawExpenses = appState.expenses || [];
  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m.name; });

  // Populate Paid By dropdown dynamically
  if (paidBySelect) {
    const currentVal = paidBySelect.value || 'ALL';
    paidBySelect.innerHTML = '<option value="ALL">All Members</option>' +
      members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (members.some(m => m.id === currentVal) || currentVal === 'ALL') {
      paidBySelect.value = currentVal;
    }
  }

  // Invoke calculation module filter and sort helper
  const filterResult = calc.filterAndSortExpenses
    ? calc.filterAndSortExpenses(rawExpenses, members, filterState)
    : { filtered: rawExpenses, totalCount: rawExpenses.length, filteredCount: rawExpenses.length, filteredTotalAmount: 0 };

  const { filtered, totalCount, filteredCount, filteredTotalAmount } = filterResult;

  // Render Result Counter & Filtered Total Badge
  const isFiltered = rawExpenses.length > 0 && (filteredCount !== totalCount || isAnyFilterActive(filterState));

  if (resultsCountEl) {
    if (rawExpenses.length === 0) {
      resultsCountEl.textContent = 'Showing 0 expenses';
    } else if (isFiltered) {
      resultsCountEl.textContent = `Showing ${filteredCount} of ${totalCount} expenses`;
    } else {
      resultsCountEl.textContent = `Showing ${totalCount} expenses`;
    }
  }

  if (totalAmountBadgeEl) {
    totalAmountBadgeEl.textContent = `Filtered Total: ₹${filteredTotalAmount.toFixed(2)}`;
  }

  // Render Active Filter Chips
  renderActiveFilterChips(filterState, memberMap, activeChipsContainer, btnClearFilters);

  // Render empty state if 0 expenses or 0 matching expenses
  if (filtered.length === 0) {
    if (tableContainer) tableContainer.classList.add('hidden');
    cardsList.classList.add('hidden');
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const titleEl = emptyState.querySelector('.empty-state-title');
      const descEl = emptyState.querySelector('p');

      if (rawExpenses.length === 0) {
        if (titleEl) titleEl.textContent = 'No expenses recorded yet';
        if (descEl) descEl.textContent = 'Click "+ Add Expense" to record your group\'s first transaction.';
      } else {
        if (titleEl) titleEl.textContent = 'No matching expenses found';
        if (descEl) descEl.textContent = 'Try adjusting or clearing your search and filter criteria.';
      }
    }
    return;
  }

  if (tableContainer) tableContainer.classList.remove('hidden');
  cardsList.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  // Desktop Table Rows
  tableBody.innerHTML = filtered.map(exp => {
    const paidByName = memberMap[exp.paidBy] || 'Unknown';
    const participantCount = (exp.participants || []).length;
    const hasReceipt = exp.receipt && exp.receipt.data;
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong>${escapeHtml(exp.title)}</strong>
            ${hasReceipt ? `<button type="button" class="btn btn-secondary btn-sm btn-view-receipt" data-id="${exp.id}" title="View Receipt" style="padding: 2px 6px; font-size: 0.72rem; border-radius: var(--radius-sm);">📎 Receipt</button>` : ''}
          </div>
        </td>
        <td><span class="badge badge-category">${escapeHtml(exp.category || 'Other')}</span></td>
        <td><strong>₹${parseFloat(exp.amount).toFixed(2)}</strong></td>
        <td>${escapeHtml(paidByName)}</td>
        <td>${participantCount} member${participantCount > 1 ? 's' : ''}</td>
        <td>${exp.date || ''}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${hasReceipt ? `<button class="btn btn-secondary btn-sm btn-view-receipt" data-id="${exp.id}">View Receipt</button>` : ''}
            <button class="btn btn-secondary btn-sm btn-edit-expense" data-id="${exp.id}">Edit</button>
            <button class="btn btn-danger btn-sm btn-delete-expense" data-id="${exp.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Mobile Stacked Cards
  cardsList.innerHTML = filtered.map(exp => {
    const paidByName = memberMap[exp.paidBy] || 'Unknown';
    const hasReceipt = exp.receipt && exp.receipt.data;
    return `
      <div class="expense-card-mobile">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h4 style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
              ${escapeHtml(exp.title)}
              ${hasReceipt ? `<span class="badge badge-success" style="font-size: 0.68rem; padding: 2px 4px;">📎 Receipt</span>` : ''}
            </h4>
            <span class="badge badge-category" style="margin-top: 4px;">${escapeHtml(exp.category || 'Other')}</span>
          </div>
          <span style="font-size: 1.1rem; font-weight: 700;">₹${parseFloat(exp.amount).toFixed(2)}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-muted); display: flex; justify-content: space-between; margin-top: 8px;">
          <span>Paid by <strong>${escapeHtml(paidByName)}</strong></span>
          <span>${exp.date || ''}</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
          ${hasReceipt ? `<button class="btn btn-secondary btn-sm btn-view-receipt" data-id="${exp.id}" style="flex:1;">View Receipt</button>` : ''}
          <button class="btn btn-secondary btn-sm btn-edit-expense" data-id="${exp.id}" style="flex:1;">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-expense" data-id="${exp.id}" style="flex:1;">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function isAnyFilterActive(filterState) {
  if (!filterState) return false;
  return Boolean(
    (filterState.searchQuery && filterState.searchQuery.trim() !== '') ||
    (filterState.category && filterState.category !== 'ALL') ||
    (filterState.paidBy && filterState.paidBy !== 'ALL') ||
    (filterState.dateRange && filterState.dateRange !== 'ALL') ||
    filterState.startDate ||
    filterState.endDate ||
    (filterState.minAmount !== null && filterState.minAmount !== '') ||
    (filterState.maxAmount !== null && filterState.maxAmount !== '') ||
    (filterState.splitType && filterState.splitType !== 'ALL') ||
    (filterState.receipt && filterState.receipt !== 'ALL')
  );
}

function renderActiveFilterChips(filterState, memberMap, container, clearBtn) {
  if (!container) return;

  const chips = [];

  if (filterState.searchQuery && filterState.searchQuery.trim() !== '') {
    chips.push({ key: 'searchQuery', label: `Search: "${filterState.searchQuery.trim()}"` });
  }
  if (filterState.category && filterState.category !== 'ALL') {
    chips.push({ key: 'category', label: `Category: ${filterState.category}` });
  }
  if (filterState.paidBy && filterState.paidBy !== 'ALL') {
    const name = memberMap[filterState.paidBy] || filterState.paidBy;
    chips.push({ key: 'paidBy', label: `Paid By: ${name}` });
  }
  if (filterState.dateRange && filterState.dateRange !== 'ALL') {
    if (filterState.dateRange === 'CUSTOM') {
      const rangeText = `${filterState.startDate || 'Start'} to ${filterState.endDate || 'End'}`;
      chips.push({ key: 'dateRange', label: `Date: ${rangeText}` });
    } else {
      const labels = { TODAY: 'Today', WEEK: 'This Week', MONTH: 'This Month', LAST_MONTH: 'Last Month' };
      chips.push({ key: 'dateRange', label: `Date: ${labels[filterState.dateRange] || filterState.dateRange}` });
    }
  }
  if ((filterState.minAmount !== null && filterState.minAmount !== '') || (filterState.maxAmount !== null && filterState.maxAmount !== '')) {
    const minText = filterState.minAmount !== null && filterState.minAmount !== '' ? `₹${filterState.minAmount}` : '₹0';
    const maxText = filterState.maxAmount !== null && filterState.maxAmount !== '' ? `₹${filterState.maxAmount}` : '∞';
    chips.push({ key: 'amountRange', label: `Amount: ${minText}–${maxText}` });
  }
  if (filterState.splitType && filterState.splitType !== 'ALL') {
    chips.push({ key: 'splitType', label: `Split: ${filterState.splitType === 'equal' ? 'Equal' : 'Custom'}` });
  }
  if (filterState.receipt && filterState.receipt !== 'ALL') {
    chips.push({ key: 'receipt', label: `Receipt: ${filterState.receipt === 'WITH_RECEIPT' ? 'With Receipt' : 'Without Receipt'}` });
  }

  if (chips.length === 0) {
    container.innerHTML = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    return;
  }

  if (clearBtn) clearBtn.classList.remove('hidden');

  container.innerHTML = chips.map(c => `
    <span class="badge" style="background: var(--color-bg-subtle); border: 1px solid var(--color-surface-border); display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.78rem;">
      <span>${escapeHtml(c.label)}</span>
      <button class="btn-remove-filter-chip" data-key="${c.key}" style="background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-weight: bold; padding: 0 2px;">✕</button>
    </span>
  `).join('');
}

/**
 * Renders Members Cards Grid
 */
function renderMembersList(appState) {
  const container = document.getElementById('members-cards-grid');
  if (!container) return;

  const members = appState.members || [];
  const currentUserId = appState.group ? appState.group.currentUserId : null;
  const balancesMap = calc.calculateBalances ? calc.calculateBalances(members, appState.expenses) : {};

  if (members.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-title">No members added yet</div>
      </div>
    `;
    return;
  }

  container.innerHTML = members.map(m => {
    const balData = balancesMap[m.id] || { paid: 0, share: 0, balance: 0 };
    const netBal = balData.balance;
    const isCurrentUser = m.id === currentUserId;
    const color = getAvatarColor(m.name);
    const initials = getInitials(m.name);

    let statusClass = '';
    let statusText = 'Settled';
    if (netBal > 0) {
      statusClass = 'badge-success';
      statusText = `Receives +₹${netBal.toFixed(2)}`;
    } else if (netBal < 0) {
      statusClass = 'badge-danger';
      statusText = `Owes -₹${Math.abs(netBal).toFixed(2)}`;
    }

    const isDeletable = !appState.expenses.some(
      exp => exp.paidBy === m.id || (exp.participants && exp.participants.includes(m.id))
    );

    return `
      <div class="member-card">
        <div class="member-card-header">
          <div class="member-info">
            <div class="avatar" style="background-color: ${color};">${initials}</div>
            <div>
              <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                ${escapeHtml(m.name)}
                ${isCurrentUser ? '<span class="badge" style="background: var(--color-primary-light); color: var(--color-primary);">You</span>' : ''}
              </div>
              <span class="badge ${statusClass}" style="margin-top: 4px;">${statusText}</span>
            </div>
          </div>
          <button class="btn-icon btn-set-current-user" data-id="${m.id}" title="${isCurrentUser ? 'This is you' : 'Select as current user'}">
            ★
          </button>
        </div>
        <div class="member-balance-details">
          <div>Paid: <strong>₹${balData.paid.toFixed(2)}</strong></div>
          <div>Share: <strong>₹${balData.share.toFixed(2)}</strong></div>
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button class="btn btn-danger btn-sm btn-remove-member ${!isDeletable ? 'btn-disabled' : ''}" 
                  data-id="${m.id}" 
                  ${!isDeletable ? 'disabled title="Cannot remove member with expense history"' : ''}>
            Remove
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renders Settlement Suggestions Grid with Partial Payment Support
 */
function renderSettlementsList(appState) {
  const container = document.getElementById('settlements-grid');
  const emptyState = document.getElementById('settlements-empty-state');
  if (!container) return;

  const settlements = appState.settlements || [];
  const memberMap = {};
  (appState.members || []).forEach(m => { memberMap[m.id] = m.name; });

  if (settlements.length === 0) {
    container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = settlements.map(s => {
    const fromName = memberMap[s.from] || 'Unknown';
    const toName = memberMap[s.to] || 'Unknown';

    const stats = calc.getSettlementPaymentStats ? calc.getSettlementPaymentStats(s) : {
      totalDue: s.amount,
      totalPaid: 0,
      remainingAmount: s.amount,
      status: s.status || 'pending',
      payments: s.payments || []
    };

    const isFullyPaid = stats.status === 'paid';
    const isPartiallyPaid = stats.status === 'partially_paid';

    let badgeClass = 'badge-danger';
    let badgeText = 'Pending';
    if (isFullyPaid) {
      badgeClass = 'badge-success';
      badgeText = '✓ Fully Paid';
    } else if (isPartiallyPaid) {
      badgeClass = 'badge-warning';
      badgeText = 'Partially Paid';
    }

    const historyHtml = (stats.payments && stats.payments.length > 0) ? `
      <div class="payment-history-wrap" style="margin-top: 12px; border-top: 1px dashed var(--color-surface-border); padding-top: 8px;">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px;">Payment History (${stats.payments.length})</div>
        ${stats.payments.map(p => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-subtle); padding: 6px 10px; border-radius: var(--radius-sm); font-size: 0.8rem; margin-bottom: 4px;">
            <div>
              <strong>₹${parseFloat(p.amount).toFixed(2)}</strong> via <span class="badge" style="padding: 2px 6px; font-size: 0.7rem;">${escapeHtml(p.paymentMethod || 'UPI')}</span>
              ${p.note ? `<div style="font-size: 0.75rem; color: var(--color-text-subtle); margin-top: 2px;">"${escapeHtml(p.note)}"</div>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--color-text-subtle); font-size: 0.75rem;">${p.date || ''}</span>
              <button type="button" class="btn-delete-payment" data-settlement-id="${s.id}" data-payment-id="${p.id}" title="Remove payment record" style="background:none; border:none; color:var(--color-danger-text); cursor:pointer; font-weight:bold;">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="settlement-card ${isFullyPaid ? 'settled' : ''}">
        <div class="settlement-flow">
          <div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">Payer</div>
            <strong style="font-size: 1rem;">${escapeHtml(fromName)}</strong>
          </div>
          <div class="settlement-arrow">
            <span class="settlement-amount">₹${stats.totalDue.toFixed(2)}</span>
            <span style="font-size: 0.75rem;">➔ pays ➔</span>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">Receiver</div>
            <strong style="font-size: 1rem;">${escapeHtml(toName)}</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 0.85rem;">
          <div>
            ${isFullyPaid ? '<span style="color: var(--color-success-text); font-weight: 600;">✓ Fully Paid</span>' : ''}
            ${isPartiallyPaid ? `<span style="color: var(--color-danger-text); font-weight: 600;">₹${stats.remainingAmount.toFixed(2)} remaining</span> <span style="color: var(--color-success-text); font-size: 0.8rem;">(₹${stats.totalPaid.toFixed(2)} paid)</span>` : ''}
            ${!isFullyPaid && !isPartiallyPaid ? `<span style="color: var(--color-danger-text); font-weight: 600;">₹${stats.remainingAmount.toFixed(2)} remaining</span>` : ''}
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 12px;">
          ${!isFullyPaid ? `
            <button class="btn btn-primary btn-sm btn-open-make-payment" data-id="${s.id}" style="flex:1;">Make Payment</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm btn-toggle-settlement" data-id="${s.id}" style="${isFullyPaid ? 'width: 100%;' : ''}">
            ${isFullyPaid ? 'Mark as Unpaid' : 'Mark Fully Paid'}
          </button>
        </div>

        ${historyHtml}
      </div>
    `;
  }).join('');
}

/**
 * Renders Spend Insights & Analytics section
 */
function renderStatistics(appState) {
  const emptyState = document.getElementById('insights-empty-state');
  const contentContainer = document.getElementById('insights-content');
  if (!emptyState || !contentContainer) return;

  const expenses = appState.expenses || [];
  const members = appState.members || [];

  if (expenses.length === 0) {
    emptyState.classList.remove('hidden');
    contentContainer.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  contentContainer.classList.remove('hidden');

  // 1. Total Spending & Count & Average & Highest/Lowest
  const totalSpending = calc.calculateTotalSpending ? calc.calculateTotalSpending(expenses) : 0;
  const avgExpense = calc.calculateAverageExpense ? calc.calculateAverageExpense(expenses) : 0;
  const highestExp = calc.findHighestExpense ? calc.findHighestExpense(expenses) : null;
  const lowestExp = calc.findLowestExpense ? calc.findLowestExpense(expenses) : null;

  const totalSpendEl = document.getElementById('analytics-total-spending');
  const totalCountEl = document.getElementById('analytics-total-count');
  const avgExpenseEl = document.getElementById('analytics-average-expense');
  const highestAmtEl = document.getElementById('analytics-highest-amount');
  const highestTitleEl = document.getElementById('analytics-highest-title');
  const lowestAmtEl = document.getElementById('analytics-lowest-amount');
  const lowestTitleEl = document.getElementById('analytics-lowest-title');

  if (totalSpendEl) totalSpendEl.textContent = `₹${totalSpending.toFixed(2)}`;
  if (totalCountEl) totalCountEl.textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'} recorded`;
  if (avgExpenseEl) avgExpenseEl.textContent = `₹${avgExpense.toFixed(2)}`;

  if (highestExp) {
    if (highestAmtEl) highestAmtEl.textContent = `₹${parseFloat(highestExp.amount).toFixed(2)}`;
    if (highestTitleEl) highestTitleEl.textContent = escapeHtml(highestExp.title);
  } else {
    if (highestAmtEl) highestAmtEl.textContent = '₹0.00';
    if (highestTitleEl) highestTitleEl.textContent = '-';
  }

  if (lowestExp) {
    if (lowestAmtEl) lowestAmtEl.textContent = `₹${parseFloat(lowestExp.amount).toFixed(2)}`;
    if (lowestTitleEl) lowestTitleEl.textContent = escapeHtml(lowestExp.title);
  } else {
    if (lowestAmtEl) lowestAmtEl.textContent = '₹0.00';
    if (lowestTitleEl) lowestTitleEl.textContent = '-';
  }

  // 2. Smart Insights List
  const insightsListContainer = document.getElementById('analytics-smart-insights-list');
  if (insightsListContainer) {
    const insights = calc.generateSmartInsights ? calc.generateSmartInsights(appState) : [];
    if (insights.length === 0) {
      insightsListContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--color-text-muted);">Add more expense data to generate personalized insights.</div>';
    } else {
      insightsListContainer.innerHTML = insights.map(insight => `
        <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.9rem; color: var(--color-text-main);">
          <span style="color: var(--color-primary); font-weight: bold;">•</span>
          <span>${escapeHtml(insight)}</span>
        </div>
      `).join('');
    }
  }

  // 3. Time-Based Spending & MoM Comparison
  const periodData = calc.calculatePeriodSpending ? calc.calculatePeriodSpending(expenses) : { today: 0, thisWeek: 0, thisMonth: 0, previousMonth: 0 };
  const momData = calc.calculateSpendingChange ? calc.calculateSpendingChange(expenses) : { hasHistoricalData: false, formattedMessage: '' };

  const todayEl = document.getElementById('analytics-period-today');
  const weekEl = document.getElementById('analytics-period-week');
  const monthEl = document.getElementById('analytics-period-month');
  const prevMonthEl = document.getElementById('analytics-period-prev-month');
  const momBadge = document.getElementById('analytics-mom-comparison-badge');

  if (todayEl) todayEl.textContent = `₹${periodData.today.toFixed(2)}`;
  if (weekEl) weekEl.textContent = `₹${periodData.thisWeek.toFixed(2)}`;
  if (monthEl) monthEl.textContent = `₹${periodData.thisMonth.toFixed(2)}`;
  if (prevMonthEl) prevMonthEl.textContent = `₹${periodData.previousMonth.toFixed(2)}`;

  if (momBadge) {
    if (momData.hasHistoricalData) {
      const isUp = momData.direction === 'increase';
      const isDown = momData.direction === 'decrease';
      const color = isUp ? 'var(--color-danger-text)' : (isDown ? 'var(--color-success-text)' : 'var(--color-text-main)');
      const icon = isUp ? '📈' : (isDown ? '📉' : '➡️');
      momBadge.style.color = color;
      momBadge.innerHTML = `${icon} ${escapeHtml(momData.formattedMessage)}`;
    } else {
      momBadge.style.color = 'var(--color-text-muted)';
      momBadge.textContent = 'ℹ️ No spending recorded in previous month for comparison.';
    }
  }

  // 4. Member Actual Spending Breakdown
  const memberListContainer = document.getElementById('analytics-member-spending-list');
  if (memberListContainer) {
    const memberData = calc.calculateMemberSpending ? calc.calculateMemberSpending(members, expenses) : { memberPayments: [], highestPayer: null, lowestPayer: null };
    const maxPaid = memberData.highestPayer ? memberData.highestPayer.totalPaid : 1;

    memberListContainer.innerHTML = memberData.memberPayments.map(m => {
      const pct = maxPaid > 0 ? Math.round((m.totalPaid / maxPaid) * 100) : 0;
      const isHighest = memberData.highestPayer && m.memberId === memberData.highestPayer.memberId && m.totalPaid > 0;
      const isLowest = memberData.lowestPayer && m.memberId === memberData.lowestPayer.memberId && m.totalPaid > 0 && memberData.memberPayments.length > 1;

      return `
        <div class="cat-bar-item">
          <div class="cat-bar-label">
            <span style="font-weight: 500;">
              ${escapeHtml(m.name)}
              ${isHighest ? '<span class="badge badge-success" style="margin-left: 6px; font-size: 0.7rem;">Top Payer</span>' : ''}
              ${isLowest ? '<span class="badge badge-secondary" style="margin-left: 6px; font-size: 0.7rem;">Lowest</span>' : ''}
            </span>
            <strong>₹${m.totalPaid.toFixed(2)}</strong>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width: ${pct}%; background-color: var(--color-primary);"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 5. Category Breakdown Section
  const catListContainer = document.getElementById('stats-categories-list');
  const catHighlightsContainer = document.getElementById('analytics-category-highlights');

  if (catListContainer) {
    const catData = calc.calculateCategorySpending ? calc.calculateCategorySpending(expenses) : { categories: [], highestCategory: null, lowestCategory: null };

    if (catHighlightsContainer) {
      if (catData.highestCategory && catData.lowestCategory && catData.categories.length > 1) {
        catHighlightsContainer.innerHTML = `
          <span class="badge badge-success">Top: ${escapeHtml(catData.highestCategory.category)} (₹${catData.highestCategory.totalAmount.toFixed(2)})</span>
          <span class="badge badge-secondary">Lowest: ${escapeHtml(catData.lowestCategory.category)} (₹${catData.lowestCategory.totalAmount.toFixed(2)})</span>
        `;
      } else {
        catHighlightsContainer.innerHTML = '';
      }
    }

    const catColors = {
      'Food': 'var(--cat-food)',
      'Travel': 'var(--cat-travel)',
      'Hotel': 'var(--cat-hotel)',
      'Shopping': 'var(--cat-shopping)',
      'Entertainment': 'var(--cat-entertainment)',
      'Other': 'var(--cat-other)'
    };

    catListContainer.innerHTML = catData.categories.map(c => {
      const color = catColors[c.category] || 'var(--cat-other)';
      return `
        <div class="cat-bar-item">
          <div class="cat-bar-label">
            <span>${escapeHtml(c.category)} (${c.percentage}%)</span>
            <strong>₹${c.totalAmount.toFixed(2)}</strong>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width: ${c.percentage}%; background-color: ${color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

/**
 * Renders Budget Overview Widget on Dashboard
 */
function renderBudgetWidget(appState) {
  const container = document.getElementById('budget-summary-widget');
  if (!container) return;

  const stats = calc.getBudgetStats ? calc.getBudgetStats(appState.group, appState.expenses) : {
    hasBudget: false
  };

  if (!stats.hasBudget) {
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 2px;">Group Budget Overview</h3>
          <span style="font-size: 0.85rem; color: var(--color-text-muted);">No spending budget configured for this group.</span>
        </div>
        <button class="btn btn-secondary btn-sm btn-open-set-budget">Set Budget</button>
      </div>
    `;
    return;
  }

  let barColor = 'var(--color-primary)';
  if (stats.isExceeded) {
    barColor = 'var(--color-danger-text)';
  } else if (stats.isWarning) {
    barColor = 'var(--color-warning-text)';
  }

  const fillWidth = Math.min(100, stats.percentage);

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <h3 style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
          Group Budget
          <span class="badge ${stats.isExceeded ? 'badge-danger' : (stats.isWarning ? 'badge-warning' : 'badge-success')}">
            ${stats.percentage}% Used
          </span>
        </h3>
      </div>
      <button class="btn btn-secondary btn-sm btn-open-set-budget">Edit Budget</button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: var(--color-bg-subtle); padding: 12px; border-radius: var(--radius-md); text-align: center;">
      <div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Budget</div>
        <strong style="font-size: 1rem;">₹${stats.totalBudget.toFixed(2)}</strong>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Spent</div>
        <strong style="font-size: 1rem;">₹${stats.totalSpent.toFixed(2)}</strong>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Remaining</div>
        <strong style="font-size: 1rem; color: ${stats.remaining > 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'};">
          ₹${stats.remaining.toFixed(2)}
        </strong>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Used</div>
        <strong style="font-size: 1rem;">${stats.percentage}%</strong>
      </div>
    </div>

    <div class="cat-bar-track" style="height: 10px; margin-top: 12px;">
      <div class="cat-bar-fill" style="width: ${fillWidth}%; background-color: ${barColor};"></div>
    </div>

    ${stats.isExceeded ? `
      <div style="background: var(--color-danger-bg); border: 1px solid rgba(239,68,68,0.3); color: var(--color-danger-text); padding: 10px 14px; border-radius: var(--radius-sm); margin-top: 12px; font-size: 0.85rem; font-weight: 600;">
        🔴 Your group budget has been exceeded by <strong>₹${stats.exceededAmount.toFixed(2)}</strong>.
      </div>
    ` : ''}

    ${stats.isWarning ? `
      <div style="background: var(--color-warning-bg); border: 1px solid rgba(245,158,11,0.3); color: var(--color-warning-text); padding: 10px 14px; border-radius: var(--radius-sm); margin-top: 12px; font-size: 0.85rem; font-weight: 600;">
        ⚠️ You have used <strong>${stats.percentage}%</strong> of your group budget.
      </div>
    ` : ''}
  `;
}

/**
 * Renders Activity Timeline history list
 */
function renderActivityTimeline(appState, filterCategory = 'ALL') {
  const container = document.getElementById('activity-timeline-list');
  const emptyState = document.getElementById('activity-empty-state');
  if (!container) return;

  let activities = [...(appState.activities || [])];

  if (filterCategory !== 'ALL') {
    activities = activities.filter(a => a.category === filterCategory);
  }

  if (activities.length === 0) {
    container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  const typeIcons = {
    'group_created': '🏷️',
    'member_added': '👤',
    'member_removed': '❌',
    'expense_added': '💸',
    'expense_edited': '✏️',
    'expense_deleted': '🗑️',
    'payment_made': '💰',
    'partial_payment_made': '💰',
    'settlement_fully_paid': '✓',
    'budget_created': '👛',
    'budget_updated': '👛',
    'budget_removed': '🚫'
  };

  container.innerHTML = activities.map(act => {
    const icon = typeIcons[act.type] || '📌';
    const dateStr = act.timestamp ? new Date(act.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const hasAmount = typeof act.amount === 'number' && act.amount > 0;

    return `
      <div class="card" style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-radius: var(--radius-md);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: var(--radius-full); background: var(--color-bg-subtle); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
            ${icon}
          </div>
          <div>
            <div style="font-size: 0.95rem; font-weight: 500; color: var(--color-text-main);">${escapeHtml(act.message)}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-subtle); margin-top: 2px;">${dateStr}</div>
          </div>
        </div>
        ${hasAmount ? `
          <span class="badge" style="background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; font-size: 0.85rem;">
            ₹${act.amount.toFixed(2)}
          </span>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Renders Recurring Expenses Due Banner Widget at top of dashboard
 */
function renderRecurringDueWidget(appState) {
  const container = document.getElementById('recurring-due-banner');
  if (!container) return;

  const recurringList = appState.recurringExpenses || [];
  const memberMap = {};
  (appState.members || []).forEach(m => { memberMap[m.id] = m.name; });

  const dueItems = recurringList.filter(item => {
    if (item.status === 'paused') return false;
    const statusInfo = calc.getRecurringDueStatus ? calc.getRecurringDueStatus(item.nextDueDate, item.status) : { isDue: false };
    return statusInfo.isDue;
  });

  if (dueItems.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');

  container.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--color-warning-text); background: var(--color-surface); padding: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="font-size: 1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
          🔔 Expenses Due (${dueItems.length})
        </h3>
        <span style="font-size: 0.8rem; color: var(--color-text-muted);">Action required to convert scheduled templates</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${dueItems.map(item => {
          const statusInfo = calc.getRecurringDueStatus ? calc.getRecurringDueStatus(item.nextDueDate, item.status) : { code: 'DUE_TODAY', label: 'Due Today' };
          const isOverdue = statusInfo.code === 'OVERDUE';
          const payerName = memberMap[item.paidBy] || 'Unknown';
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-subtle); padding: 10px 14px; border-radius: var(--radius-sm); flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem;">
                  ${escapeHtml(item.title)} — <span style="color: ${isOverdue ? 'var(--color-danger-text)' : 'var(--color-warning-text)'};">${statusInfo.label}</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  ₹${item.amount.toFixed(2)} • Paid by <strong>${escapeHtml(payerName)}</strong> • Frequency: ${item.frequency} • Due: ${item.nextDueDate}
                </div>
              </div>
              <button class="btn btn-primary btn-sm btn-convert-recurring" data-id="${item.id}">Add Expense</button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Renders Recurring Expenses Management tab list
 */
function renderRecurringExpensesList(appState) {
  const container = document.getElementById('recurring-expenses-grid');
  const emptyState = document.getElementById('recurring-empty-state');
  if (!container) return;

  const recurringList = appState.recurringExpenses || [];
  const memberMap = {};
  (appState.members || []).forEach(m => { memberMap[m.id] = m.name; });

  if (recurringList.length === 0) {
    container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = recurringList.map(item => {
    const payerName = memberMap[item.paidBy] || 'Unknown';
    const statusInfo = calc.getRecurringDueStatus ? calc.getRecurringDueStatus(item.nextDueDate, item.status) : { code: 'UPCOMING', label: 'Active' };

    let badgeClass = 'badge-success';
    let badgeText = statusInfo.label;

    if (item.status === 'paused') {
      badgeClass = 'badge-secondary';
      badgeText = 'Paused';
    } else if (statusInfo.code === 'OVERDUE') {
      badgeClass = 'badge-danger';
      badgeText = statusInfo.label;
    } else if (statusInfo.code === 'DUE_TODAY') {
      badgeClass = 'badge-warning';
      badgeText = 'Due Today';
    }

    const participantCount = (item.participants || []).length;
    const freqCapitalized = item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1);

    return `
      <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px; ${item.status === 'paused' ? 'opacity: 0.75;' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h4 style="font-size: 1.05rem; font-weight: 600; margin: 0;">${escapeHtml(item.title)}</h4>
              <span class="badge ${badgeClass}">${badgeText}</span>
              <span class="badge badge-category">${escapeHtml(item.category || 'Other')}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 4px;">
              Paid by <strong>${escapeHtml(payerName)}</strong> • Split with ${participantCount} member${participantCount > 1 ? 's' : ''} (${item.splitType})
            </div>
          </div>
          <span style="font-size: 1.2rem; font-weight: 700;">₹${item.amount.toFixed(2)}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; background: var(--color-bg-subtle); padding: 10px; border-radius: var(--radius-sm); font-size: 0.8rem;">
          <div>Frequency: <strong>${freqCapitalized}</strong></div>
          <div>Start Date: <strong>${item.startDate || '-'}</strong></div>
          <div>Next Due Date: <strong>${item.nextDueDate}</strong></div>
          <div>Last Generated: <strong>${item.lastGeneratedDate || 'Never'}</strong></div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
          ${item.status === 'active' ? `
            <button class="btn btn-primary btn-sm btn-convert-recurring" data-id="${item.id}" style="flex: 1; min-width: 110px;">Add Expense</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm btn-toggle-pause-recurring" data-id="${item.id}">
            ${item.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button class="btn btn-secondary btn-sm btn-edit-recurring" data-id="${item.id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-recurring" data-id="${item.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

}

/**
 * Updates receipt upload & preview controls in Expense Form modal
 * 
 * @param {Object|null} receiptObj 
 */
function renderReceiptPreview(receiptObj) {
  const emptyControls = document.getElementById('receipt-controls-empty');
  const activeControls = document.getElementById('receipt-controls-active');
  const thumbnail = document.getElementById('receipt-thumbnail-preview');
  const fileNameEl = document.getElementById('receipt-file-name');

  if (!emptyControls || !activeControls) return;

  if (receiptObj && receiptObj.data) {
    emptyControls.classList.add('hidden');
    activeControls.classList.remove('hidden');
    if (thumbnail) thumbnail.src = receiptObj.data;
    if (fileNameEl) fileNameEl.textContent = receiptObj.name || 'receipt.jpg';
  } else {
    emptyControls.classList.remove('hidden');
    activeControls.classList.add('hidden');
    if (thumbnail) thumbnail.src = '';
    if (fileNameEl) fileNameEl.textContent = 'receipt.jpg';
  }
}

/**
 * Opens Lightbox Modal displaying attached expense receipt image
 * 
 * @param {Object} receiptObj 
 * @param {string} [expenseTitle] 
 */
function openReceiptLightboxModal(receiptObj, expenseTitle) {
  if (!receiptObj || !receiptObj.data) return;

  const modal = document.getElementById('modal-view-receipt');
  const titleEl = document.getElementById('modal-receipt-title');
  const imageEl = document.getElementById('lightbox-receipt-image');
  const captionEl = document.getElementById('lightbox-receipt-caption');

  if (!modal || !imageEl) return;

  if (titleEl) titleEl.textContent = `Receipt — ${expenseTitle || 'Expense'}`;
  imageEl.src = receiptObj.data;
  if (captionEl) captionEl.textContent = `File: ${receiptObj.name || 'receipt.jpg'}`;

  openModal('modal-view-receipt');
}

// Utility HTML escape helper to prevent XSS
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders What-If Settlement Simulator screen & Before vs After comparison
 * 
 * @param {Object} appState 
 * @param {Object} simState 
 */
function renderSimulatorTab(appState, simState) {
  const emptyState = document.getElementById('simulator-empty-state');
  const resultsContainer = document.getElementById('simulator-results-container');
  const changesListContainer = document.getElementById('sim-changes-list');
  const changesCountEl = document.getElementById('sim-changes-count');

  if (!emptyState || !resultsContainer) return;

  const expenses = appState.expenses || [];
  if (expenses.length === 0 && (!simState || (simState.expenses || []).length === 0)) {
    emptyState.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    if (changesListContainer) changesListContainer.innerHTML = '';
    if (changesCountEl) changesCountEl.textContent = '0';
    return;
  }

  emptyState.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  // Active Simulation Changes List
  const changes = (simState && simState.changes) || [];
  if (changesCountEl) changesCountEl.textContent = changes.length;

  if (changesListContainer) {
    if (changes.length === 0) {
      changesListContainer.innerHTML = `<span style="font-size: 0.85rem; color: var(--color-text-muted);">No hypothetical changes added yet. Choose an action above to start simulation.</span>`;
    } else {
      changesListContainer.innerHTML = changes.map(c => `
        <div class="badge" style="background: var(--color-surface); border: 1px solid var(--color-primary-light); padding: 6px 12px; font-size: 0.85rem; gap: 8px; font-weight: 500; color: var(--color-text-main);">
          <span>+ ${escapeHtml(c.description)}</span>
          <button type="button" class="btn-remove-sim-change" data-id="${c.id}" title="Remove change" style="background:none; border:none; color:var(--color-danger-text); cursor:pointer; font-weight:bold;">✕</button>
        </div>
      `).join('');
    }
  }

  // Calculate BEFORE metrics
  const beforeBalances = calc.calculateBalances ? calc.calculateBalances(appState.members || [], appState.expenses || []) : {};
  const beforeSettlements = calc.calculateSettlements ? calc.calculateSettlements(beforeBalances) : [];
  const beforeTotalSpend = calc.calculateTotalSpending ? calc.calculateTotalSpending(appState.expenses || []) : 0;
  const beforeBudget = calc.getBudgetStats ? calc.getBudgetStats(appState.group, appState.expenses || []) : { hasBudget: false };

  // Calculate AFTER metrics
  const afterMembers = (simState && simState.members) || appState.members || [];
  const afterExpenses = (simState && simState.expenses) || appState.expenses || [];
  const afterBalances = calc.calculateBalances ? calc.calculateBalances(afterMembers, afterExpenses) : {};

  const rawAfterSettlements = calc.calculateSettlements ? calc.calculateSettlements(afterBalances) : [];
  
  const simPaymentsMap = new Map();
  ((simState && simState.settlements) || []).forEach(s => {
    const key = `${s.from}_${s.to}`;
    if (Array.isArray(s.payments) && s.payments.length > 0) {
      simPaymentsMap.set(key, s.payments);
    }
  });

  const afterSettlements = rawAfterSettlements.map(s => {
    const key = `${s.from}_${s.to}`;
    if (simPaymentsMap.has(key)) {
      const pList = [...simPaymentsMap.get(key)];
      const stats = calc.getSettlementPaymentStats ? calc.getSettlementPaymentStats({ amount: s.amount, payments: pList }) : { status: 'pending' };
      return {
        ...s,
        payments: pList,
        status: stats.status
      };
    }
    return s;
  });

  const afterTotalSpend = calc.calculateTotalSpending ? calc.calculateTotalSpending(afterExpenses) : 0;
  const afterBudget = calc.getBudgetStats ? calc.getBudgetStats(simState ? simState.group : appState.group, afterExpenses) : { hasBudget: false };

  const spendingDiff = Math.round((afterTotalSpend - beforeTotalSpend) * 100) / 100;
  const balanceComparisons = calc.compareBalances ? calc.compareBalances(beforeBalances, afterBalances) : [];

  const memberMap = {};
  afterMembers.forEach(m => { memberMap[m.id] = m.name; });

  // Render HTML Comparison sections
  resultsContainer.innerHTML = `
    <!-- 1. Total Spending Comparison Card -->
    <div class="card" style="border-left: 4px solid var(--color-primary);">
      <h4 style="font-size: 0.95rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 12px;">Total Spending Comparison</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; text-align: center;">
        <div style="background: var(--color-bg-subtle); padding: 12px; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Before</div>
          <strong style="font-size: 1.2rem; display: block; margin-top: 2px;">₹${beforeTotalSpend.toFixed(2)}</strong>
        </div>
        <div style="background: var(--color-bg-subtle); padding: 12px; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Simulated (After)</div>
          <strong style="font-size: 1.2rem; display: block; margin-top: 2px; color: var(--color-primary);">₹${afterTotalSpend.toFixed(2)}</strong>
        </div>
        <div style="background: var(--color-bg-subtle); padding: 12px; border-radius: var(--radius-md); display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Difference</div>
          <span class="badge ${spendingDiff > 0 ? 'badge-danger' : (spendingDiff < 0 ? 'badge-success' : 'badge-secondary')}" style="font-size: 0.95rem; padding: 4px 10px; margin-top: 4px;">
            ${spendingDiff > 0 ? `+₹${spendingDiff.toFixed(2)}` : (spendingDiff < 0 ? `-₹${Math.abs(spendingDiff).toFixed(2)}` : '₹0.00')}
          </span>
        </div>
      </div>
    </div>

    <!-- 2. Budget Impact Card (If budget configured) -->
    ${afterBudget.hasBudget ? `
      <div class="card" style="border-left: 4px solid ${afterBudget.isExceeded ? 'var(--color-danger-text)' : (afterBudget.isWarning ? 'var(--color-warning-text)' : 'var(--color-success-text)')};">
        <h4 style="font-size: 0.95rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 12px;">Group Budget Impact</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; text-align: center;">
          <div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Budget Limit</div>
            <strong style="font-size: 1rem;">₹${afterBudget.totalBudget.toFixed(2)}</strong>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Before Usage</div>
            <strong style="font-size: 1rem;">${beforeBudget.percentage}%</strong>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Simulated Usage</div>
            <strong style="font-size: 1rem; color: ${afterBudget.isExceeded ? 'var(--color-danger-text)' : 'var(--color-primary)'};">${afterBudget.percentage}%</strong>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Remaining</div>
            <strong style="font-size: 1rem; color: ${afterBudget.remaining > 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'};">₹${afterBudget.remaining.toFixed(2)}</strong>
          </div>
        </div>

        ${afterBudget.isExceeded ? `
          <div style="background: var(--color-danger-bg); border: 1px solid rgba(239,68,68,0.3); color: var(--color-danger-text); padding: 10px 14px; border-radius: var(--radius-sm); margin-top: 12px; font-size: 0.85rem; font-weight: 600;">
            🔴 Simulated changes exceed the group budget by <strong>₹${afterBudget.exceededAmount.toFixed(2)}</strong>.
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- 3. Member Balances BEFORE vs AFTER -->
    <div class="card">
      <h4 style="font-size: 0.95rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 12px;">Member Balances (Before vs After)</h4>
      <div class="table-responsive">
        <table class="expense-table" style="font-size: 0.9rem;">
          <thead>
            <tr>
              <th>Member</th>
              <th>Before Balance</th>
              <th>Simulated Balance</th>
              <th>Net Difference</th>
            </tr>
          </thead>
          <tbody>
            ${balanceComparisons.map(b => {
              const beforeText = b.beforeBalance > 0 ? `+₹${b.beforeBalance.toFixed(2)}` : (b.beforeBalance < 0 ? `-₹${Math.abs(b.beforeBalance).toFixed(2)}` : '₹0.00');
              const afterText = b.afterBalance > 0 ? `+₹${b.afterBalance.toFixed(2)}` : (b.afterBalance < 0 ? `-₹${Math.abs(b.afterBalance).toFixed(2)}` : '₹0.00');

              let diffClass = 'badge-secondary';
              let diffText = 'No Change';
              if (b.balanceDiff > 0) {
                diffClass = 'badge-success';
                diffText = `+₹${b.balanceDiff.toFixed(2)}`;
              } else if (b.balanceDiff < 0) {
                diffClass = 'badge-danger';
                diffText = `-₹${Math.abs(b.balanceDiff).toFixed(2)}`;
              }

              return `
                <tr>
                  <td><strong>${escapeHtml(b.name)}</strong></td>
                  <td><span style="font-weight: 500;">${beforeText}</span></td>
                  <td><strong style="color: var(--color-primary);">${afterText}</strong></td>
                  <td><span class="badge ${diffClass}">${diffText}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 4. Settlement Transactions Comparison -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
      <div class="card">
        <h4 style="font-size: 0.95rem; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 12px;">Before Settlements (${beforeSettlements.length})</h4>
        ${beforeSettlements.length === 0 ? `
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">Everyone is currently settled up.</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${beforeSettlements.map(s => {
              const fromName = memberMap[s.from] || s.from;
              const toName = memberMap[s.to] || s.to;
              return `
                <div style="background: var(--color-bg-subtle); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                  <span><strong>${escapeHtml(fromName)}</strong> ➔ pays ➔ <strong>${escapeHtml(toName)}</strong></span>
                  <strong style="color: var(--color-danger-text);">₹${s.amount.toFixed(2)}</strong>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="card" style="border: 1px solid var(--color-primary-light);">
        <h4 style="font-size: 0.95rem; font-weight: 600; text-transform: uppercase; color: var(--color-primary); margin-bottom: 12px;">Simulated Settlements (${afterSettlements.length})</h4>
        ${afterSettlements.length === 0 ? `
          <div style="font-size: 0.85rem; color: var(--color-success-text); font-weight: 600;">Everyone is settled up 🎉</div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${afterSettlements.map(s => {
              const fromName = memberMap[s.from] || s.from;
              const toName = memberMap[s.to] || s.to;
              const stats = calc.getSettlementPaymentStats ? calc.getSettlementPaymentStats(s) : { remainingAmount: s.amount, status: s.status || 'pending' };
              const isPaid = stats.status === 'paid';
              return `
                <div style="background: var(--color-bg-subtle); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; ${isPaid ? 'opacity: 0.6;' : ''}">
                  <span><strong>${escapeHtml(fromName)}</strong> ➔ pays ➔ <strong>${escapeHtml(toName)}</strong></span>
                  <div style="text-align: right;">
                    <strong style="color: ${isPaid ? 'var(--color-success-text)' : 'var(--color-primary)'};">₹${stats.remainingAmount.toFixed(2)}</strong>
                    ${isPaid ? '<span class="badge badge-success" style="margin-left: 4px; font-size: 0.7rem;">Paid</span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

/**
 * Renders Expense Templates list grid
 * 
 * @param {Object} appState 
 */
function renderTemplatesList(appState) {
  const container = document.getElementById('templates-grid');
  const emptyState = document.getElementById('templates-empty-state');
  if (!container) return;

  const rawTemplates = appState.templates || [];
  const members = appState.members || [];
  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m.name; });

  if (rawTemplates.length === 0) {
    container.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = rawTemplates.map(t => {
    const validParticipants = (t.participants || []).filter(id => memberMap[id]);
    const payerName = t.defaultPayer && memberMap[t.defaultPayer] ? memberMap[t.defaultPayer] : 'Any Member';
    const amountText = t.defaultAmount ? `₹${t.defaultAmount.toFixed(2)}` : 'Flexible Amount';
    const participantCount = validParticipants.length;
    const participantNames = validParticipants.map(id => memberMap[id]).join(', ');

    return `
      <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h4 style="font-size: 1.05rem; font-weight: 600; margin: 0;">${escapeHtml(t.name)}</h4>
              <span class="badge badge-category">${escapeHtml(t.category || 'Other')}</span>
              <span class="badge badge-secondary" style="font-size: 0.72rem;">${t.splitType === 'custom' ? 'Custom Split' : 'Equal Split'}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 4px;">
              Title: <strong>"${escapeHtml(t.title)}"</strong>
            </div>
          </div>
          <span style="font-size: 1.15rem; font-weight: 700; color: var(--color-primary);">${amountText}</span>
        </div>

        <div style="background: var(--color-bg-subtle); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px;">
          <div>Default Payer: <strong>${escapeHtml(payerName)}</strong></div>
          <div>Participants (${participantCount}): <strong>${escapeHtml(participantNames || 'None')}</strong></div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
          <button class="btn btn-primary btn-sm btn-use-template" data-id="${t.id}" style="flex: 1; min-width: 110px;">⚡ Use Template</button>
          <button class="btn btn-secondary btn-sm btn-duplicate-template" data-id="${t.id}">Duplicate</button>
          <button class="btn btn-secondary btn-sm btn-edit-template" data-id="${t.id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-template" data-id="${t.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Safely copies text to the system clipboard with async fallback.
 * 
 * @param {string} text 
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}

/**
 * Updates Export & Report Modal scope counts and button states based on filter state
 * 
 * @param {Object} appState 
 * @param {Object} [filterState] 
 */
function renderExportReportModal(appState, filterState = {}) {
  const scopeContainer = document.getElementById('export-scope-container');
  const countAllEl = document.getElementById('export-count-all');
  const countFilteredEl = document.getElementById('export-count-filtered');
  const btnShare = document.getElementById('btn-do-share-settlement');

  const rawExpenses = appState.expenses || [];
  const members = appState.members || [];

  const isFiltered = isAnyFilterActive(filterState);
  let filteredCount = rawExpenses.length;

  if (isFiltered) {
    const filterResult = calc.filterAndSortExpenses
      ? calc.filterAndSortExpenses(rawExpenses, members, filterState)
      : { filteredCount: rawExpenses.length };
    filteredCount = filterResult.filteredCount;
  }

  if (countAllEl) countAllEl.textContent = rawExpenses.length;
  if (countFilteredEl) countFilteredEl.textContent = filteredCount;

  if (scopeContainer) {
    if (isFiltered && rawExpenses.length > 0) {
      scopeContainer.classList.remove('hidden');
    } else {
      scopeContainer.classList.add('hidden');
    }
  }

  if (btnShare) {
    if (typeof navigator !== 'undefined' && navigator.share) {
      btnShare.innerHTML = '📲 Share Settlement Summary';
    } else {
      btnShare.innerHTML = '📲 Share Settlement (Copy Fallback)';
    }
  }
}

/**
 * Renders print-ready HTML structure into #print-report-container
 * 
 * @param {Object} appState 
 * @param {Array<Object>} [expensesToReport] 
 * @param {string} [scopeLabel] 
 */
function renderPrintReport(appState, expensesToReport, scopeLabel = 'All Expenses') {
  const container = document.getElementById('print-report-container');
  if (!container) return;

  const report = calc.compileReportData ? calc.compileReportData(appState, expensesToReport, scopeLabel) : null;
  if (!report) return;

  const budgetStats = report.budgetStats || {};
  const analytics = report.analytics || {};

  let budgetHtml = '<p style="font-size: 9pt; color: #64748b;">No budget configured.</p>';
  if (budgetStats.hasBudget) {
    const statusClass = budgetStats.isExceeded ? 'print-badge-danger' : (budgetStats.isWarning ? 'print-badge-warning' : 'print-badge-success');
    const statusMsg = budgetStats.isExceeded
      ? `Exceeded by ₹${budgetStats.exceededAmount.toFixed(2)}`
      : `${budgetStats.percentage}% Used`;

    budgetHtml = `
      <div class="print-grid">
        <div class="print-stat-card">
          <div class="print-stat-label">Budget Limit</div>
          <div class="print-stat-value">₹${budgetStats.totalBudget.toFixed(2)}</div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Spent</div>
          <div class="print-stat-value">₹${budgetStats.totalSpent.toFixed(2)}</div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Remaining</div>
          <div class="print-stat-value" style="color: ${budgetStats.remaining > 0 ? '#16a34a' : '#dc2626'};">
            ₹${budgetStats.remaining.toFixed(2)}
          </div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Status</div>
          <div class="print-stat-value"><span class="print-badge ${statusClass}">${statusMsg}</span></div>
        </div>
      </div>
    `;
  }

  // Members Table
  const membersRows = report.members.map(m => {
    const balFormatted = m.balance > 0
      ? `+₹${m.balance.toFixed(2)}`
      : (m.balance < 0 ? `-₹${Math.abs(m.balance).toFixed(2)}` : '₹0.00');

    let badgeClass = 'print-badge-success';
    if (m.balance < 0) badgeClass = 'print-badge-danger';
    else if (m.balance === 0) badgeClass = 'print-badge-warning';

    return `
      <tr>
        <td><strong>${escapeHtml(m.name)}</strong></td>
        <td>₹${m.paid.toFixed(2)}</td>
        <td>₹${m.share.toFixed(2)}</td>
        <td><strong>${balFormatted}</strong></td>
        <td><span class="print-badge ${badgeClass}">${escapeHtml(m.statusText)}</span></td>
      </tr>
    `;
  }).join('');

  // Expenses Table
  const expensesRows = report.expenses.map(exp => `
    <tr>
      <td>${escapeHtml(exp.date)}</td>
      <td><strong>${escapeHtml(exp.title)}</strong></td>
      <td>₹${exp.amount.toFixed(2)}</td>
      <td>${escapeHtml(exp.paidByName)}</td>
      <td>${escapeHtml(exp.category)}</td>
      <td>${escapeHtml(exp.splitType)}</td>
      <td>${escapeHtml(exp.participantNames)}</td>
      <td>${exp.hasReceipt ? '<span class="print-badge print-badge-success">📎 Receipt Attached</span>' : 'No'}</td>
    </tr>
  `).join('');

  // Settlements Table
  const settlementsRows = report.settlements.map(s => {
    let badgeClass = 'print-badge-warning';
    if (s.status === 'paid') badgeClass = 'print-badge-success';
    else if (s.status === 'partially_paid') badgeClass = 'print-badge-warning';

    return `
      <tr>
        <td><strong>${escapeHtml(s.fromName)}</strong></td>
        <td><strong>${escapeHtml(s.toName)}</strong></td>
        <td>₹${s.totalDue.toFixed(2)}</td>
        <td>₹${s.paid.toFixed(2)}</td>
        <td><strong>₹${s.remaining.toFixed(2)}</strong></td>
        <td><span class="print-badge ${badgeClass}">${escapeHtml(s.statusLabel)}</span></td>
      </tr>
    `;
  }).join('');

  // Payment History Table
  let paymentHistoryHtml = '';
  if (report.paymentHistory && report.paymentHistory.length > 0) {
    const payRows = report.paymentHistory.map(p => `
      <tr>
        <td>${escapeHtml(p.date)}</td>
        <td>${escapeHtml(p.fromName)}</td>
        <td>${escapeHtml(p.toName)}</td>
        <td><strong>₹${p.amount.toFixed(2)}</strong></td>
        <td>${escapeHtml(p.paymentMethod)}</td>
        <td>${escapeHtml(p.note || '-')}</td>
      </tr>
    `).join('');

    paymentHistoryHtml = `
      <div class="print-section">
        <div class="print-section-title">Settlement Payment History (${report.paymentHistory.length})</div>
        <table class="print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payer</th>
              <th>Receiver</th>
              <th>Amount</th>
              <th>Payment Method</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${payRows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Analytics Box
  let analyticsHtml = '';
  if (analytics.highestExpense || analytics.highestCategory || analytics.highestPayer) {
    const topExpText = analytics.highestExpense ? `${analytics.highestExpense.title} (₹${parseFloat(analytics.highestExpense.amount).toFixed(2)})` : '-';
    const topCatText = analytics.highestCategory ? `${analytics.highestCategory.category} (${analytics.highestCategory.percentage}%)` : '-';
    const topPayerText = analytics.highestPayer ? `${analytics.highestPayer.name} (₹${analytics.highestPayer.totalPaid.toFixed(2)})` : '-';
    const avgText = analytics.averageExpense ? `₹${analytics.averageExpense.toFixed(2)}` : '₹0.00';

    analyticsHtml = `
      <div class="print-section">
        <div class="print-section-title">Spending Analytics & Insights</div>
        <div class="print-grid">
          <div class="print-stat-card">
            <div class="print-stat-label">Highest Expense</div>
            <div class="print-stat-value" style="font-size: 10.5pt;">${escapeHtml(topExpText)}</div>
          </div>
          <div class="print-stat-card">
            <div class="print-stat-label">Highest Category</div>
            <div class="print-stat-value" style="font-size: 10.5pt;">${escapeHtml(topCatText)}</div>
          </div>
          <div class="print-stat-card">
            <div class="print-stat-label">Highest Payer</div>
            <div class="print-stat-value" style="font-size: 10.5pt;">${escapeHtml(topPayerText)}</div>
          </div>
          <div class="print-stat-card">
            <div class="print-stat-label">Average Expense</div>
            <div class="print-stat-value" style="font-size: 10.5pt;">${escapeHtml(avgText)}</div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="print-header">
      <div>
        <h1>SMART EXPENSE SPLITTER</h1>
        <div class="print-header-sub">Group Financial Summary: <strong>${escapeHtml(report.groupName)}</strong></div>
      </div>
      <div class="print-header-meta">
        <div><strong>Report Scope:</strong> ${escapeHtml(report.scopeLabel)}</div>
        <div><strong>Date:</strong> ${escapeHtml(report.reportDate)}</div>
      </div>
    </div>

    <!-- Summary Grid -->
    <div class="print-section">
      <div class="print-section-title">Overview Summary</div>
      <div class="print-grid">
        <div class="print-stat-card">
          <div class="print-stat-label">Total Expenses</div>
          <div class="print-stat-value">₹${report.totalExpenses.toFixed(2)}</div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Expense Records</div>
          <div class="print-stat-value">${report.expenseCount}</div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Members</div>
          <div class="print-stat-value">${report.members.length}</div>
        </div>
        <div class="print-stat-card">
          <div class="print-stat-label">Pending Settlements</div>
          <div class="print-stat-value">₹${report.totalPendingAmount.toFixed(2)}</div>
        </div>
      </div>
    </div>

    <!-- Group Budget Section -->
    <div class="print-section">
      <div class="print-section-title">Group Budget</div>
      ${budgetHtml}
    </div>

    <!-- Members Section -->
    <div class="print-section">
      <div class="print-section-title">Members Balances Summary (${report.members.length})</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Member Name</th>
            <th>Paid Out of Pocket</th>
            <th>Calculated Share</th>
            <th>Net Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${membersRows}
        </tbody>
      </table>
    </div>

    <!-- Expenses Section -->
    <div class="print-section">
      <div class="print-section-title">Expense Records (${report.expenses.length})</div>
      ${report.expenses.length === 0 ? '<p style="font-size: 9pt; color: #64748b;">No expense records available.</p>' : `
        <table class="print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Expense</th>
              <th>Amount</th>
              <th>Paid By</th>
              <th>Category</th>
              <th>Split Type</th>
              <th>Participants</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            ${expensesRows}
          </tbody>
        </table>
      `}
    </div>

    <!-- Settlements Section -->
    <div class="print-section">
      <div class="print-section-title">Settlement Debt Breakdown (${report.settlements.length})</div>
      ${report.settlements.length === 0 ? '<p style="font-size: 9pt; color: #64748b;">Everyone is settled up 🎉</p>' : `
        <table class="print-table">
          <thead>
            <tr>
              <th>Payer</th>
              <th>Receiver</th>
              <th>Total Due</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${settlementsRows}
          </tbody>
        </table>
      `}
    </div>

    <!-- Payment History Section -->
    ${paymentHistoryHtml}

    <!-- Analytics Section -->
    ${analyticsHtml}

    <div class="print-footer">
      Generated automatically by Smart Expense Splitter presentation layer on ${escapeHtml(report.reportDate)}.
    </div>
  `;
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showScreen,
    showFieldError,
    clearFieldError,
    showToast,
    openModal,
    closeModal,
    renderHeader,
    renderSummaryCards,
    renderExpenseList,
    renderMembersList,
    renderSettlementsList,
    renderStatistics,
    renderBudgetWidget,
    renderActivityTimeline,
    renderRecurringDueWidget,
    renderRecurringExpensesList,
    renderReceiptPreview,
    openReceiptLightboxModal,
    renderSimulatorTab,
    renderTemplatesList,
    copyToClipboard,
    renderExportReportModal,
    renderPrintReport,
    updateUndoRedoUI,
    renderGroupSwitcher,
    renderManageGroupsModal,
    escapeHtml
  };
}



