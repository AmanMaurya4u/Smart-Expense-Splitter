/**
 * Smart Expense Splitter - Main Application Entry Point
 * Orchestrates event wiring, modal management, DOM interactions, and state flow.
 */

// Universal dependencies resolution
const storage = typeof window !== 'undefined' && window.loadData ? window : (typeof require !== 'undefined' ? require('./storage.js') : {});
const expense = typeof window !== 'undefined' && window.addExpense ? window : (typeof require !== 'undefined' ? require('./expense.js') : {});
const ui = typeof window !== 'undefined' && window.showScreen ? window : (typeof require !== 'undefined' ? require('./ui.js') : {});
const calcLogic = typeof window !== 'undefined' && window.calculateCustomSplit ? window : (typeof require !== 'undefined' ? require('./calculation.js') : {});

// Global State Instance
let appState = {
  version: 1,
  theme: 'light',
  group: null,
  members: [],
  expenses: [],
  settlements: []
};

// State for active edit/delete operations
let editingExpenseId = null;
let deletingExpenseId = null;

// Filter state
let currentFilterCategory = 'ALL';
let currentSearchQuery = '';
let currentSortBy = 'newest';
let searchDebounceTimer = null;

/**
 * App Initialization Entry Point
 */
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Load persisted state from storage
  appState = storage.loadData ? storage.loadData() : appState;

  // Apply initial theme
  document.documentElement.setAttribute('data-theme', appState.theme || 'light');

  // Bind global DOM event listeners
  bindEventListeners();

  // Route to initial screen
  navigateInitialScreen();
}

/**
 * Navigates to appropriate screen based on persisted state
 */
function navigateInitialScreen() {
  if (appState.group && appState.members && appState.members.length >= 2) {
    ui.showScreen('screen-dashboard');
    renderFullDashboard();
  } else if (appState.group) {
    ui.showScreen('screen-members-setup');
    renderMembersSetupScreen();
  } else {
    ui.showScreen('screen-welcome');
    renderWelcomeScreen();
  }
  ui.renderHeader(appState);
}

/**
 * Re-renders all active dashboard widgets
 */
function renderFullDashboard() {
  ui.renderHeader(appState);
  ui.renderSummaryCards(appState);
  ui.renderExpenseList(appState, currentFilterCategory, currentSearchQuery, currentSortBy);
  ui.renderMembersList(appState);
  ui.renderSettlementsList(appState);
  ui.renderStatistics(appState);
}

/**
 * Renders Welcome Screen state
 */
function renderWelcomeScreen() {
  const btnContinue = document.getElementById('btn-welcome-continue');
  if (!btnContinue) return;

  if (appState.group && appState.group.name) {
    btnContinue.textContent = `Continue with "${appState.group.name}"`;
    btnContinue.classList.remove('hidden');
  } else {
    btnContinue.classList.add('hidden');
  }
}

/**
 * Renders Member Setup Screen
 */
function renderMembersSetupScreen() {
  const titleEl = document.getElementById('setup-group-title');
  if (titleEl && appState.group) {
    titleEl.textContent = appState.group.name;
  }
  renderSetupMembersList();
}

function renderSetupMembersList() {
  const listEl = document.getElementById('setup-members-chips');
  const btnContinue = document.getElementById('btn-finish-setup');
  const countNotice = document.getElementById('setup-members-count-notice');
  if (!listEl) return;

  const members = appState.members || [];

  listEl.innerHTML = members.map(m => `
    <div class="badge" style="background: var(--color-surface); border: 1px solid var(--color-surface-border); padding: 6px 12px; font-size: 0.9rem; gap: 8px;">
      <span>${ui.escapeHtml(m.name)}</span>
      <button type="button" class="btn-remove-setup-member" data-id="${m.id}" style="background:none; border:none; color:var(--color-danger-text); cursor:pointer; font-weight:bold;">✕</button>
    </div>
  `).join('');

  const validCount = members.length >= 2;
  if (btnContinue) {
    if (validCount) {
      btnContinue.removeAttribute('disabled');
      btnContinue.classList.remove('btn-disabled');
    } else {
      btnContinue.setAttribute('disabled', 'true');
      btnContinue.classList.add('btn-disabled');
    }
  }

  if (countNotice) {
    countNotice.textContent = `${members.length} member${members.length === 1 ? '' : 's'} added. (Minimum 2 required)`;
  }
}

/**
 * Event Listener Wiring
 */
function bindEventListeners() {
  // Theme Switcher
  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', appState.theme);
      storage.saveData(appState);
    });
  }

  // Welcome Screen actions
  const btnStartCreate = document.getElementById('btn-start-create-group');
  if (btnStartCreate) {
    btnStartCreate.addEventListener('click', () => {
      ui.showScreen('screen-create-group');
    });
  }

  const btnWelcomeContinue = document.getElementById('btn-welcome-continue');
  if (btnWelcomeContinue) {
    btnWelcomeContinue.addEventListener('click', () => {
      navigateInitialScreen();
    });
  }

  // Group Creation Form
  const formCreateGroup = document.getElementById('form-create-group');
  if (formCreateGroup) {
    formCreateGroup.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('input-group-name');
      ui.clearFieldError(input);

      const res = expense.createGroup(appState, input.value);
      if (!res.success) {
        ui.showFieldError(input, res.error);
        return;
      }

      input.value = '';
      ui.showScreen('screen-members-setup');
      renderMembersSetupScreen();
      ui.showToast('Group created successfully!', 'success');
    });
  }

  // Member Setup Form
  const formAddMember = document.getElementById('form-add-member');
  if (formAddMember) {
    formAddMember.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('input-member-name');
      ui.clearFieldError(input);

      const res = expense.addMember(appState, input.value);
      if (!res.success) {
        ui.showFieldError(input, res.error);
        return;
      }

      input.value = '';
      renderSetupMembersList();
      ui.showToast('Member added', 'info');
    });
  }

  // Setup Member Remove Chip
  const chipsList = document.getElementById('setup-members-chips');
  if (chipsList) {
    chipsList.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-setup-member')) {
        const id = e.target.getAttribute('data-id');
        expense.removeMember(appState, id);
        renderSetupMembersList();
      }
    });
  }

  // Finish Setup Button
  const btnFinishSetup = document.getElementById('btn-finish-setup');
  if (btnFinishSetup) {
    btnFinishSetup.addEventListener('click', () => {
      if (appState.members.length < 2) return;
      ui.showScreen('screen-dashboard');
      renderFullDashboard();
      ui.showToast('Dashboard ready!', 'success');
    });
  }

  // Open Add Expense Modal
  const btnAddExpense = document.getElementById('btn-open-add-expense');
  if (btnAddExpense) {
    btnAddExpense.addEventListener('click', () => {
      editingExpenseId = null;
      openExpenseModal();
    });
  }

  // Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      const targetTab = e.target.getAttribute('data-tab');
      const tabs = ['tab-expenses', 'tab-members', 'tab-settlements', 'tab-stats'];
      tabs.forEach(t => {
        const el = document.getElementById(t);
        if (el) {
          if (t === `tab-${targetTab}`) {
            el.classList.remove('hidden');
          } else {
            el.classList.add('hidden');
          }
        }
      });
    });
  });

  // Category Filter
  const filterCatSelect = document.getElementById('select-filter-category');
  if (filterCatSelect) {
    filterCatSelect.addEventListener('change', (e) => {
      currentFilterCategory = e.target.value;
      ui.renderExpenseList(appState, currentFilterCategory, currentSearchQuery, currentSortBy);
    });
  }

  // Search Input (Debounced)
  const searchInput = document.getElementById('input-search-expense');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentSearchQuery = e.target.value;
        ui.renderExpenseList(appState, currentFilterCategory, currentSearchQuery, currentSortBy);
      }, 300);
    });
  }

  // Sort Selection
  const sortSelect = document.getElementById('select-sort-expense');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      ui.renderExpenseList(appState, currentFilterCategory, currentSearchQuery, currentSortBy);
    });
  }

  // Expense List Actions (Edit / Delete) via event delegation
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-edit-expense')) {
      const id = e.target.getAttribute('data-id');
      editingExpenseId = id;
      openExpenseModal(id);
    } else if (e.target.classList.contains('btn-delete-expense')) {
      const id = e.target.getAttribute('data-id');
      deletingExpenseId = id;
      ui.openModal('modal-confirm-delete');
    } else if (e.target.classList.contains('btn-remove-member')) {
      const id = e.target.getAttribute('data-id');
      const res = expense.removeMember(appState, id);
      if (res.success) {
        renderFullDashboard();
        ui.showToast('Member removed', 'info');
      } else {
        ui.showToast(res.error, 'danger');
      }
    } else if (e.target.classList.contains('btn-set-current-user')) {
      const id = e.target.getAttribute('data-id');
      if (appState.group) {
        appState.group.currentUserId = id;
        storage.saveData(appState);
        renderFullDashboard();
        ui.showToast('Updated your personal balance view', 'info');
      }
    } else if (e.target.classList.contains('btn-toggle-settlement')) {
      const id = e.target.getAttribute('data-id');
      const res = expense.toggleSettlementStatus(appState, id);
      if (res.success) {
        renderFullDashboard();
        ui.showToast(`Settlement marked as ${res.settlement.status}`, 'success');
      }
    }
  });

  // Modal Delete Confirm Button
  const btnConfirmDelete = document.getElementById('btn-confirm-delete-expense');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
      if (deletingExpenseId) {
        expense.deleteExpense(appState, deletingExpenseId);
        deletingExpenseId = null;
        ui.closeModal('modal-confirm-delete');
        renderFullDashboard();
        ui.showToast('Expense deleted', 'info');
      }
    });
  }

  // Modal Cancel/Close buttons
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) {
        ui.closeModal(modal.id);
      }
    });
  });

  // Expense Form Submit
  const formExpense = document.getElementById('form-expense');
  if (formExpense) {
    formExpense.addEventListener('submit', (e) => {
      e.preventDefault();
      handleExpenseFormSubmit();
    });
  }

  // Split Type toggle buttons inside Modal
  const btnSplitEqual = document.getElementById('btn-split-equal');
  const btnSplitCustom = document.getElementById('btn-split-custom');
  if (btnSplitEqual && btnSplitCustom) {
    btnSplitEqual.addEventListener('click', () => {
      btnSplitEqual.classList.add('active');
      btnSplitCustom.classList.remove('active');
      document.getElementById('custom-shares-container').classList.add('hidden');
    });

    btnSplitCustom.addEventListener('click', () => {
      btnSplitCustom.classList.add('active');
      btnSplitEqual.classList.remove('active');
      document.getElementById('custom-shares-container').classList.remove('hidden');
      renderCustomSharesInputs();
    });
  }

  // Export CSV
  const btnExportCSV = document.getElementById('btn-export-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      const csvStr = storage.exportToCSV(appState.expenses, appState.members);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `expense_summary_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      ui.showToast('Exported CSV file', 'success');
    });
  }

  // Print Summary
  const btnPrint = document.getElementById('btn-print-summary');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Reset Data Modal & Confirm
  const btnResetData = document.getElementById('btn-reset-data');
  if (btnResetData) {
    btnResetData.addEventListener('click', () => {
      ui.openModal('modal-reset-data');
    });
  }

  const btnConfirmReset = document.getElementById('btn-confirm-reset-data');
  if (btnConfirmReset) {
    btnConfirmReset.addEventListener('click', () => {
      storage.clearAllData();
      appState = storage.getInitialData();
      ui.closeModal('modal-reset-data');
      ui.showScreen('screen-welcome');
      renderWelcomeScreen();
      ui.showToast('All app data has been reset', 'info');
    });
  }
}

/**
 * Prepares and opens Add/Edit Expense modal
 */
function openExpenseModal(editId = null) {
  const modalTitle = document.getElementById('modal-expense-title');
  const inputTitle = document.getElementById('input-expense-title');
  const inputAmount = document.getElementById('input-expense-amount');
  const selectPaidBy = document.getElementById('select-expense-paid-by');
  const selectCategory = document.getElementById('select-expense-category');
  const inputDate = document.getElementById('input-expense-date');
  const participantsContainer = document.getElementById('participants-checkboxes');
  const btnEqual = document.getElementById('btn-split-equal');
  const btnCustom = document.getElementById('btn-split-custom');
  const customContainer = document.getElementById('custom-shares-container');

  if (!selectPaidBy || !participantsContainer) return;

  // Clear validation errors
  ui.clearFieldError(inputTitle);
  ui.clearFieldError(inputAmount);

  // Populate Paid By dropdown
  selectPaidBy.innerHTML = appState.members.map(m => `
    <option value="${m.id}">${ui.escapeHtml(m.name)}</option>
  `).join('');

  const targetExp = editId ? appState.expenses.find(e => e.id === editId) : null;

  if (targetExp) {
    if (modalTitle) modalTitle.textContent = 'Edit Expense';
    if (inputTitle) inputTitle.value = targetExp.title;
    if (inputAmount) inputAmount.value = targetExp.amount;
    if (selectPaidBy) selectPaidBy.value = targetExp.paidBy;
    if (selectCategory) selectCategory.value = targetExp.category || 'Other';
    if (inputDate) inputDate.value = targetExp.date || new Date().toISOString().split('T')[0];

    if (targetExp.splitType === 'custom') {
      btnCustom.classList.add('active');
      btnEqual.classList.remove('active');
      customContainer.classList.remove('hidden');
    } else {
      btnEqual.classList.add('active');
      btnCustom.classList.remove('active');
      customContainer.classList.add('hidden');
    }
  } else {
    if (modalTitle) modalTitle.textContent = 'Add Expense';
    if (inputTitle) inputTitle.value = '';
    if (inputAmount) inputAmount.value = '';
    if (selectCategory) selectCategory.value = 'Food';
    if (inputDate) inputDate.value = new Date().toISOString().split('T')[0];

    btnEqual.classList.add('active');
    btnCustom.classList.remove('active');
    customContainer.classList.add('hidden');
  }

  // Populate Participants Checkboxes
  const selectedParticipants = targetExp ? targetExp.participants : appState.members.map(m => m.id);

  participantsContainer.innerHTML = appState.members.map(m => {
    const isChecked = selectedParticipants.includes(m.id);
    return `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" class="chk-participant" value="${m.id}" ${isChecked ? 'checked' : ''}>
        <span>${ui.escapeHtml(m.name)}</span>
      </label>
    `;
  }).join('');

  if (targetExp && targetExp.splitType === 'custom') {
    renderCustomSharesInputs(targetExp.customShares);
  }

  // Listen to participant checkbox toggles to update custom shares live
  participantsContainer.querySelectorAll('.chk-participant').forEach(chk => {
    chk.addEventListener('change', () => {
      if (btnCustom.classList.contains('active')) {
        renderCustomSharesInputs();
      }
    });
  });

  ui.openModal('modal-expense');
}

/**
 * Dynamically renders custom shares inputs for checked participants
 */
function renderCustomSharesInputs(existingShares = {}) {
  const container = document.getElementById('custom-shares-inputs-list');
  const amountInput = document.getElementById('input-expense-amount');
  const statusNotice = document.getElementById('custom-shares-status');
  if (!container) return;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-participant:checked'));
  const checkedIds = checkedCheckboxes.map(c => c.value);

  const memberMap = {};
  appState.members.forEach(m => { memberMap[m.id] = m.name; });

  container.innerHTML = checkedIds.map(id => {
    const val = existingShares[id] !== undefined ? existingShares[id] : '';
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
        <span style="font-size: 0.9rem; font-weight: 500;">${ui.escapeHtml(memberMap[id] || id)}</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span>₹</span>
          <input type="number" step="0.01" min="0" class="form-control input-custom-share" data-id="${id}" value="${val}" style="width: 100px; text-align: right;">
        </div>
      </div>
    `;
  }).join('');

  function updateCustomValidationStatus() {
    const totalAmount = parseFloat(amountInput.value) || 0;
    const shareInputs = Array.from(container.querySelectorAll('.input-custom-share'));

    const sharesMap = {};
    shareInputs.forEach(inp => {
      const id = inp.getAttribute('data-id');
      sharesMap[id] = parseFloat(inp.value) || 0;
    });

    const res = calcLogic.calculateCustomSplit(totalAmount, sharesMap);
    if (!statusNotice) return;

    if (res.isValid) {
      statusNotice.textContent = `✓ Allocated exact ₹${totalAmount.toFixed(2)}`;
      statusNotice.style.color = 'var(--color-success-text)';
    } else {
      const rem = res.remaining;
      if (rem > 0) {
        statusNotice.textContent = `Allocated ₹${res.sum.toFixed(2)} / ₹${totalAmount.toFixed(2)} — ₹${rem.toFixed(2)} remaining`;
      } else {
        statusNotice.textContent = `Allocated ₹${res.sum.toFixed(2)} / ₹${totalAmount.toFixed(2)} — Over-allocated by ₹${Math.abs(rem).toFixed(2)}`;
      }
      statusNotice.style.color = 'var(--color-danger-text)';
    }
  }

  container.querySelectorAll('.input-custom-share').forEach(inp => {
    inp.addEventListener('input', updateCustomValidationStatus);
  });
  amountInput.addEventListener('input', updateCustomValidationStatus);
  updateCustomValidationStatus();
}

/**
 * Handles Add/Edit Expense form submission
 */
function handleExpenseFormSubmit() {
  const inputTitle = document.getElementById('input-expense-title');
  const inputAmount = document.getElementById('input-expense-amount');
  const selectPaidBy = document.getElementById('select-expense-paid-by');
  const selectCategory = document.getElementById('select-expense-category');
  const inputDate = document.getElementById('input-expense-date');
  const btnCustom = document.getElementById('btn-split-custom');
  const customContainer = document.getElementById('custom-shares-container');

  ui.clearFieldError(inputTitle);
  ui.clearFieldError(inputAmount);

  const title = inputTitle.value;
  const amount = inputAmount.value;
  const paidBy = selectPaidBy.value;
  const category = selectCategory.value;
  const date = inputDate.value;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-participant:checked'));
  const participants = checkedCheckboxes.map(c => c.value);

  const splitType = btnCustom.classList.contains('active') ? 'custom' : 'equal';
  const customShares = {};

  if (splitType === 'custom' && customContainer) {
    customContainer.querySelectorAll('.input-custom-share').forEach(inp => {
      const id = inp.getAttribute('data-id');
      customShares[id] = parseFloat(inp.value) || 0;
    });
  }

  const payload = {
    title,
    amount,
    category,
    paidBy,
    splitType,
    participants,
    customShares,
    date
  };

  let res;
  if (editingExpenseId) {
    res = expense.editExpense(appState, editingExpenseId, payload);
  } else {
    res = expense.addExpense(appState, payload);
  }

  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  editingExpenseId = null;
  ui.closeModal('modal-expense');
  renderFullDashboard();
  ui.showToast(`Expense ${editingExpenseId ? 'updated' : 'added'} successfully`, 'success');
}
