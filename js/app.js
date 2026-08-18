/**
 * Smart Expense Splitter - Main Application Entry Point
 * Orchestrates event wiring, modal management, DOM interactions, and state flow.
 */

// Universal dependencies resolution
const storage = typeof window !== 'undefined' && window.loadData ? window : (typeof require !== 'undefined' ? require('./storage.js') : {});
const expense = typeof window !== 'undefined' && window.addExpense ? window : (typeof require !== 'undefined' ? require('./expense.js') : {});
const ui = typeof window !== 'undefined' && window.showScreen ? window : (typeof require !== 'undefined' ? require('./ui.js') : {});
const calcLogic = typeof window !== 'undefined' && window.calculateCustomSplit ? window : (typeof require !== 'undefined' ? require('./calculation.js') : {});
const historyManager = typeof window !== 'undefined' && window.pushUndoSnapshot ? window : (typeof require !== 'undefined' ? require('./history.js') : {});

// Global State Instance
let appState = {
  version: 1,
  theme: 'light',
  group: null,
  members: [],
  expenses: [],
  settlements: []
};

// Simulation Sandbox State Instance
let simulationState = null;

// State for active edit/delete operations
let editingExpenseId = null;
let deletingExpenseId = null;
let editingRecurringId = null;
let deletingRecurringId = null;
let editingTemplateId = null;
let deletingTemplateId = null;
let renamingGroupId = null;
let deletingGroupId = null;

// Receipt upload transient state
let currentExpenseReceipt = null;

// Comprehensive Filter state object
let currentFilterState = {
  searchQuery: '',
  category: 'ALL',
  paidBy: 'ALL',
  dateRange: 'ALL',
  startDate: null,
  endDate: null,
  minAmount: null,
  maxAmount: null,
  splitType: 'ALL',
  receipt: 'ALL',
  sortBy: 'newest'
};
let currentActivityFilterCategory = 'ALL';
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
  ui.renderRecurringDueWidget(appState);
  ui.renderBudgetWidget(appState);
  ui.renderSummaryCards(appState);
  ui.renderExpenseList(appState, currentFilterState);
  ui.renderRecurringExpensesList(appState);
  ui.renderTemplatesList(appState);
  ui.renderMembersList(appState);
  ui.renderSettlementsList(appState);
  ui.renderStatistics(appState);
  ui.renderActivityTimeline(appState, currentActivityFilterCategory);

  if (simulationState) {
    ui.renderSimulatorTab(appState, simulationState);
  }
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
  // Undo & Redo Handlers
  function handleUndoAction() {
    const res = historyManager.performUndo ? historyManager.performUndo(appState) : { success: false };
    if (!res.success) {
      ui.showToast(res.error || 'Nothing to undo.', 'info');
      return;
    }

    appState = res.restoredState;
    storage.saveData(appState);
    renderFullDashboard();
    ui.showToast(`Undone: ${res.actionName}`, 'info');
  }

  function handleRedoAction() {
    const res = historyManager.performRedo ? historyManager.performRedo(appState) : { success: false };
    if (!res.success) {
      ui.showToast(res.error || 'Nothing to redo.', 'info');
      return;
    }

    appState = res.restoredState;
    storage.saveData(appState);
    renderFullDashboard();
    ui.showToast(`Redone: ${res.actionName}`, 'info');
  }

  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) {
    btnUndo.addEventListener('click', () => handleUndoAction());
  }

  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) {
    btnRedo.addEventListener('click', () => handleRedoAction());
  }

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
      if (isEditable) return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;
    const key = (e.key || '').toLowerCase();

    if (isCtrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndoAction();
    } else if (isCtrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      handleRedoAction();
    }
  });

  // Theme Switcher
  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
      ui.renderHeader(appState);
      storage.saveData(appState);
      ui.showToast(`Switched to ${appState.theme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
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

      if (historyManager.pushUndoSnapshot && input.value.trim()) {
        historyManager.pushUndoSnapshot(appState, `Create Group "${input.value.trim()}"`);
      }

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

      if (historyManager.pushUndoSnapshot && input.value.trim()) {
        historyManager.pushUndoSnapshot(appState, `Add Member "${input.value.trim()}"`);
      }

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

  // Open Add Recurring Expense Modal
  const btnAddRecurring = document.getElementById('btn-open-add-recurring');
  if (btnAddRecurring) {
    btnAddRecurring.addEventListener('click', () => {
      editingRecurringId = null;
      openRecurringModal();
    });
  }

  // Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      const targetTab = e.target.getAttribute('data-tab');
      const tabs = ['tab-expenses', 'tab-recurring', 'tab-templates', 'tab-members', 'tab-settlements', 'tab-stats', 'tab-activity', 'tab-simulator'];
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

      if (targetTab === 'simulator') {
        if (!simulationState) {
          simulationState = expense.initSimulationState(appState);
        }
        ui.renderSimulatorTab(appState, simulationState);
      }
    });
  });

  // Activity Timeline Category Filters
  const activityFilterBtns = document.querySelectorAll('.activity-filter-btn');
  activityFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      activityFilterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentActivityFilterCategory = e.target.getAttribute('data-filter');
      ui.renderActivityTimeline(appState, currentActivityFilterCategory);
    });
  });

  // Clear Activity History Trigger & Confirm
  const btnOpenClearActivities = document.getElementById('btn-open-clear-activities');
  if (btnOpenClearActivities) {
    btnOpenClearActivities.addEventListener('click', () => {
      ui.openModal('modal-confirm-clear-activities');
    });
  }

  const btnConfirmClearActivities = document.getElementById('btn-confirm-clear-activities');
  if (btnConfirmClearActivities) {
    btnConfirmClearActivities.addEventListener('click', () => {
      expense.clearActivityHistory(appState);
      ui.closeModal('modal-confirm-clear-activities');
      renderFullDashboard();
      ui.showToast('Activity history cleared', 'info');
    });
  }

  // Category Filter
  // Filter & Search Controls Wiring
  const filterCatSelect = document.getElementById('select-filter-category');
  if (filterCatSelect) {
    filterCatSelect.addEventListener('change', (e) => {
      currentFilterState.category = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterPaidBySelect = document.getElementById('select-filter-paid-by');
  if (filterPaidBySelect) {
    filterPaidBySelect.addEventListener('change', (e) => {
      currentFilterState.paidBy = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterDateSelect = document.getElementById('select-filter-date');
  if (filterDateSelect) {
    filterDateSelect.addEventListener('change', (e) => {
      currentFilterState.dateRange = e.target.value;
      const customContainer = document.getElementById('custom-date-range-container');
      if (customContainer) {
        if (e.target.value === 'CUSTOM') {
          customContainer.classList.remove('hidden');
        } else {
          customContainer.classList.add('hidden');
        }
      }
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterStartDateInput = document.getElementById('input-filter-start-date');
  if (filterStartDateInput) {
    filterStartDateInput.addEventListener('change', (e) => {
      currentFilterState.startDate = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterEndDateInput = document.getElementById('input-filter-end-date');
  if (filterEndDateInput) {
    filterEndDateInput.addEventListener('change', (e) => {
      currentFilterState.endDate = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterMinAmountInput = document.getElementById('input-filter-min-amount');
  if (filterMinAmountInput) {
    filterMinAmountInput.addEventListener('input', (e) => {
      currentFilterState.minAmount = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterMaxAmountInput = document.getElementById('input-filter-max-amount');
  if (filterMaxAmountInput) {
    filterMaxAmountInput.addEventListener('input', (e) => {
      currentFilterState.maxAmount = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterSplitTypeSelect = document.getElementById('select-filter-split-type');
  if (filterSplitTypeSelect) {
    filterSplitTypeSelect.addEventListener('change', (e) => {
      currentFilterState.splitType = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  const filterReceiptSelect = document.getElementById('select-filter-receipt');
  if (filterReceiptSelect) {
    filterReceiptSelect.addEventListener('change', (e) => {
      currentFilterState.receipt = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
    });
  }

  // Toggle Advanced Filters Collapsible Panel
  const btnToggleAdvFilters = document.getElementById('btn-toggle-advanced-filters');
  if (btnToggleAdvFilters) {
    btnToggleAdvFilters.addEventListener('click', () => {
      const panel = document.getElementById('advanced-filters-panel');
      if (panel) panel.classList.toggle('hidden');
    });
  }

  // Clear Filters Action Button
  const btnClearFilters = document.getElementById('btn-clear-filters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => resetAllFilters());
  }

  // Search Input (Debounced)
  const searchInput = document.getElementById('input-search-expense');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentFilterState.searchQuery = e.target.value;
        ui.renderExpenseList(appState, currentFilterState);
      }, 250);
    });
  }

  // Sort Selection
  const sortSelect = document.getElementById('select-sort-expense');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentFilterState.sortBy = e.target.value;
      ui.renderExpenseList(appState, currentFilterState);
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
      const targetMember = (appState.members || []).find(m => m.id === id);
      if (historyManager.pushUndoSnapshot && expense.isMemberDeletable(appState, id)) {
        historyManager.pushUndoSnapshot(appState, `Remove Member "${targetMember ? targetMember.name : 'Member'}"`);
      }
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
      if (historyManager.pushUndoSnapshot) {
        historyManager.pushUndoSnapshot(appState, `Toggle Settlement`);
      }
      const res = expense.toggleSettlementStatus(appState, id);
      if (res.success) {
        renderFullDashboard();
        ui.showToast(`Settlement marked as ${res.settlement.status}`, 'success');
      }
    } else if (e.target.classList.contains('btn-open-make-payment')) {
      const id = e.target.getAttribute('data-id');
      openMakePaymentModal(id);
    } else if (e.target.classList.contains('btn-delete-payment')) {
      const settlementId = e.target.getAttribute('data-settlement-id');
      const paymentId = e.target.getAttribute('data-payment-id');
      if (historyManager.pushUndoSnapshot) {
        historyManager.pushUndoSnapshot(appState, `Delete Payment`);
      }
      const res = expense.deletePartialPayment(appState, settlementId, paymentId);
      if (res.success) {
        renderFullDashboard();
        ui.showToast('Payment record removed', 'info');
      }
    } else if (e.target.classList.contains('btn-open-set-budget')) {
      openSetBudgetModal();
    } else if (e.target.classList.contains('btn-convert-recurring')) {
      const id = e.target.getAttribute('data-id');
      const targetRec = (appState.recurringExpenses || []).find(r => r.id === id);
      if (historyManager.pushUndoSnapshot) {
        historyManager.pushUndoSnapshot(appState, `Add Expense from Recurring "${targetRec ? targetRec.title : 'Recurring'}"`);
      }
      const res = expense.convertRecurringToExpense(appState, id);
      if (res.success) {
        renderFullDashboard();
        ui.showToast(`Added ${res.expense.title} — ₹${res.expense.amount.toFixed(2)}`, 'success');
      } else {
        ui.showToast(res.error, 'danger');
      }
    } else if (e.target.classList.contains('btn-toggle-pause-recurring')) {
      const id = e.target.getAttribute('data-id');
      const targetRec = (appState.recurringExpenses || []).find(r => r.id === id);
      if (historyManager.pushUndoSnapshot && targetRec) {
        historyManager.pushUndoSnapshot(appState, `${targetRec.status === 'paused' ? 'Resume' : 'Pause'} Recurring "${targetRec.title}"`);
      }
      const res = expense.togglePauseRecurringExpense(appState, id);
      if (res.success) {
        renderFullDashboard();
        ui.showToast(`Recurring expense ${res.recurring.status === 'paused' ? 'paused' : 'resumed'}`, 'info');
      }
    } else if (e.target.classList.contains('btn-edit-recurring')) {
      const id = e.target.getAttribute('data-id');
      editingRecurringId = id;
      openRecurringModal(id);
    } else if (e.target.classList.contains('btn-delete-recurring')) {
      const id = e.target.getAttribute('data-id');
      deletingRecurringId = id;
      ui.openModal('modal-confirm-delete-recurring');
    } else if (e.target.classList.contains('btn-view-receipt')) {
      const id = e.target.getAttribute('data-id');
      const targetExp = appState.expenses.find(exp => exp.id === id);
      if (targetExp && targetExp.receipt && targetExp.receipt.data) {
        ui.openReceiptLightboxModal(targetExp.receipt, targetExp.title);
      }
    } else if (e.target.classList.contains('btn-remove-filter-chip')) {
      const key = e.target.getAttribute('data-key');
      removeSingleFilter(key);
    } else if (e.target.classList.contains('btn-use-template')) {
      const id = e.target.getAttribute('data-id');
      handleUseTemplateAction(id);
    } else if (e.target.classList.contains('btn-duplicate-template')) {
      const id = e.target.getAttribute('data-id');
      handleDuplicateTemplateAction(id);
    } else if (e.target.classList.contains('btn-edit-template')) {
      const id = e.target.getAttribute('data-id');
      openEditTemplateModal(id);
    } else if (e.target.classList.contains('btn-delete-template')) {
      const id = e.target.getAttribute('data-id');
      openDeleteTemplateModal(id);
    } else if (e.target.classList.contains('btn-remove-sim-change')) {
      const changeId = e.target.getAttribute('data-id');
      if (simulationState) {
        simulationState = expense.removeSimulationChange(simulationState, appState, changeId);
        ui.renderSimulatorTab(appState, simulationState);
        ui.showToast('Simulation change removed', 'info');
      }
    }
  });

  // What-If Simulator Action Triggers
  const btnOpenSimPayment = document.getElementById('btn-open-sim-payment');
  if (btnOpenSimPayment) {
    btnOpenSimPayment.addEventListener('click', () => openSimulatePaymentModal());
  }

  const btnOpenSimExpense = document.getElementById('btn-open-sim-expense');
  if (btnOpenSimExpense) {
    btnOpenSimExpense.addEventListener('click', () => openSimulateExpenseModal());
  }

  const btnOpenSimEditAmount = document.getElementById('btn-open-sim-edit-amount');
  if (btnOpenSimEditAmount) {
    btnOpenSimEditAmount.addEventListener('click', () => openSimulateEditAmountModal());
  }

  const btnOpenSimRemoveExpense = document.getElementById('btn-open-sim-remove-expense');
  if (btnOpenSimRemoveExpense) {
    btnOpenSimRemoveExpense.addEventListener('click', () => openSimulateRemoveExpenseModal());
  }

  const btnResetSim = document.getElementById('btn-reset-simulation');
  if (btnResetSim) {
    btnResetSim.addEventListener('click', () => {
      simulationState = expense.resetSimulationState(appState);
      ui.renderSimulatorTab(appState, simulationState);
      ui.showToast('Simulation reset to current group state', 'info');
    });
  }

  const btnOpenApplySim = document.getElementById('btn-open-apply-simulation');
  if (btnOpenApplySim) {
    btnOpenApplySim.addEventListener('click', () => {
      if (!simulationState || !simulationState.changes || simulationState.changes.length === 0) {
        ui.showToast('No hypothetical changes to apply.', 'info');
        return;
      }
      ui.openModal('modal-confirm-apply-simulation');
    });
  }

  const btnConfirmApplySim = document.getElementById('btn-confirm-apply-simulation');
  if (btnConfirmApplySim) {
    btnConfirmApplySim.addEventListener('click', () => {
      if (simulationState) {
        if (historyManager.pushUndoSnapshot) {
          historyManager.pushUndoSnapshot(appState, `Apply What-If Simulation`);
        }
        const res = expense.applySimulationToAppState(appState, simulationState);
        simulationState = expense.initSimulationState(appState);
        ui.closeModal('modal-confirm-apply-simulation');
        renderFullDashboard();
        ui.showToast(`Applied ${res.appliedCount} simulated change(s) to your group!`, 'success');
      }
    });
  }

  // Template Action Triggers
  const btnOpenAddTemplate = document.getElementById('btn-open-add-template');
  if (btnOpenAddTemplate) {
    btnOpenAddTemplate.addEventListener('click', () => openAddTemplateModal());
  }

  const btnOpenAddTemplateEmpty = document.getElementById('btn-open-add-template-empty');
  if (btnOpenAddTemplateEmpty) {
    btnOpenAddTemplateEmpty.addEventListener('click', () => openAddTemplateModal());
  }

  const btnConfirmDeleteTemplate = document.getElementById('btn-confirm-delete-template');
  if (btnConfirmDeleteTemplate) {
    btnConfirmDeleteTemplate.addEventListener('click', () => handleDeleteTemplateSubmit());
  }

  // Receipt File Attachment & Preview Triggers
  const btnTriggerUpload = document.getElementById('btn-trigger-upload-receipt');
  const btnReplaceReceipt = document.getElementById('btn-replace-receipt');
  const inputReceiptFile = document.getElementById('input-expense-receipt');
  
  if (btnTriggerUpload && inputReceiptFile) {
    btnTriggerUpload.addEventListener('click', () => inputReceiptFile.click());
  }
  if (btnReplaceReceipt && inputReceiptFile) {
    btnReplaceReceipt.addEventListener('click', () => inputReceiptFile.click());
  }

  if (inputReceiptFile) {
    inputReceiptFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const validation = calcLogic.validateReceiptFile(file);
      if (!validation.isValid) {
        ui.showToast(validation.error, 'danger');
        e.target.value = '';
        return;
      }

      calcLogic.compressReceiptImage(file, 1600, 0.75).then(compressedObj => {
        currentExpenseReceipt = compressedObj;
        ui.renderReceiptPreview(currentExpenseReceipt);
        ui.showToast('Receipt attached', 'info');
        e.target.value = '';
      }).catch(err => {
        ui.showToast(err.message || 'Failed to process receipt image.', 'danger');
        e.target.value = '';
      });
    });
  }

  const btnViewPreviewReceipt = document.getElementById('btn-view-preview-receipt');
  if (btnViewPreviewReceipt) {
    btnViewPreviewReceipt.addEventListener('click', () => {
      if (currentExpenseReceipt && currentExpenseReceipt.data) {
        const titleVal = (document.getElementById('input-expense-title') || {}).value || 'Preview';
        ui.openReceiptLightboxModal(currentExpenseReceipt, titleVal);
      }
    });
  }

  const btnRemoveReceiptForm = document.getElementById('btn-remove-receipt-form');
  if (btnRemoveReceiptForm) {
    btnRemoveReceiptForm.addEventListener('click', () => {
      ui.openModal('modal-confirm-remove-receipt');
    });
  }

  const btnConfirmRemoveReceipt = document.getElementById('btn-confirm-remove-receipt');
  if (btnConfirmRemoveReceipt) {
    btnConfirmRemoveReceipt.addEventListener('click', () => {
      currentExpenseReceipt = null;
      ui.renderReceiptPreview(null);
      ui.closeModal('modal-confirm-remove-receipt');
      ui.showToast('Receipt removed', 'info');
    });
  }

  const btnZoomReceipt = document.getElementById('btn-zoom-receipt');
  if (btnZoomReceipt) {
    btnZoomReceipt.addEventListener('click', () => {
      const img = document.getElementById('lightbox-receipt-image');
      if (!img) return;
      if (img.style.maxHeight === 'none') {
        img.style.maxHeight = '60vh';
        btnZoomReceipt.textContent = 'Toggle Full Size';
      } else {
        img.style.maxHeight = 'none';
        btnZoomReceipt.textContent = 'Fit to Screen';
      }
    });
  }

  // Set Budget Form Submission
  const formSetBudget = document.getElementById('form-set-budget');
  if (formSetBudget) {
    formSetBudget.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSetBudgetSubmit();
    });
  }

  // Remove Budget Button
  const btnRemoveBudget = document.getElementById('btn-remove-budget');
  if (btnRemoveBudget) {
    btnRemoveBudget.addEventListener('click', () => {
      if (historyManager.pushUndoSnapshot) {
        historyManager.pushUndoSnapshot(appState, `Remove Group Budget`);
      }
      expense.removeGroupBudget(appState);
      ui.closeModal('modal-set-budget');
      renderFullDashboard();
      ui.showToast('Group budget removed', 'info');
    });
  }

  // Make Payment Form Submission
  const formMakePayment = document.getElementById('form-make-payment');
  if (formMakePayment) {
    formMakePayment.addEventListener('submit', (e) => {
      e.preventDefault();
      handleMakePaymentSubmit();
    });
  }

  // Modal Delete Confirm Button
  const btnConfirmDelete = document.getElementById('btn-confirm-delete-expense');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => {
      if (deletingExpenseId) {
        const targetExp = (appState.expenses || []).find(e => e.id === deletingExpenseId);
        if (historyManager.pushUndoSnapshot) {
          historyManager.pushUndoSnapshot(appState, `Delete "${targetExp ? targetExp.title : 'Expense'}"`);
        }
        expense.deleteExpense(appState, deletingExpenseId);
        deletingExpenseId = null;
        ui.closeModal('modal-confirm-delete');
        renderFullDashboard();
        ui.showToast('Expense deleted', 'info');
      }
    });
  }

  // Modal Confirm Delete Recurring Expense
  const btnConfirmDeleteRecurring = document.getElementById('btn-confirm-delete-recurring');
  if (btnConfirmDeleteRecurring) {
    btnConfirmDeleteRecurring.addEventListener('click', () => {
      if (deletingRecurringId) {
        const targetRec = (appState.recurringExpenses || []).find(r => r.id === deletingRecurringId);
        if (historyManager.pushUndoSnapshot) {
          historyManager.pushUndoSnapshot(appState, `Delete Recurring "${targetRec ? targetRec.title : 'Recurring'}"`);
        }
        expense.deleteRecurringExpense(appState, deletingRecurringId);
        deletingRecurringId = null;
        ui.closeModal('modal-confirm-delete-recurring');
        renderFullDashboard();
        ui.showToast('Recurring expense deleted', 'info');
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

  // Recurring Expense Form Submit
  const formRecurring = document.getElementById('form-recurring-expense');
  if (formRecurring) {
    formRecurring.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRecurringExpenseFormSubmit();
    });
  }

  // Simulation Form Submits
  const formSimPayment = document.getElementById('form-sim-payment');
  if (formSimPayment) {
    formSimPayment.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSimPaymentSubmit();
    });
  }

  const formSimExpense = document.getElementById('form-sim-expense');
  if (formSimExpense) {
    formSimExpense.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSimExpenseSubmit();
    });
  }

  const formSimEditAmount = document.getElementById('form-sim-edit-amount');
  if (formSimEditAmount) {
    formSimEditAmount.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSimEditAmountSubmit();
    });
  }

  const formSimRemoveExpense = document.getElementById('form-sim-remove-expense');
  if (formSimRemoveExpense) {
    formSimRemoveExpense.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSimRemoveExpenseSubmit();
    });
  }

  // Template Form Submit
  const formTemplate = document.getElementById('form-template');
  if (formTemplate) {
    formTemplate.addEventListener('submit', (e) => {
      e.preventDefault();
      handleTemplateFormSubmit();
    });
  }

  // Split Type toggle buttons inside Template Modal
  const btnTemplateSplitEqual = document.getElementById('btn-template-split-equal');
  const btnTemplateSplitCustom = document.getElementById('btn-template-split-custom');
  if (btnTemplateSplitEqual && btnTemplateSplitCustom) {
    btnTemplateSplitEqual.addEventListener('click', () => {
      btnTemplateSplitEqual.classList.add('active');
      btnTemplateSplitCustom.classList.remove('active');
      document.getElementById('template-custom-shares-container').classList.add('hidden');
    });

    btnTemplateSplitCustom.addEventListener('click', () => {
      btnTemplateSplitCustom.classList.add('active');
      btnTemplateSplitEqual.classList.remove('active');
      document.getElementById('template-custom-shares-container').classList.remove('hidden');
      renderTemplateCustomSharesInputs();
    });
  }

  // Split Type toggle buttons inside Simulate Expense Modal
  const btnSimSplitEqual = document.getElementById('btn-sim-split-equal');
  const btnSimSplitCustom = document.getElementById('btn-sim-split-custom');
  if (btnSimSplitEqual && btnSimSplitCustom) {
    btnSimSplitEqual.addEventListener('click', () => {
      btnSimSplitEqual.classList.add('active');
      btnSimSplitCustom.classList.remove('active');
      document.getElementById('sim-custom-shares-container').classList.add('hidden');
    });

    btnSimSplitCustom.addEventListener('click', () => {
      btnSimSplitCustom.classList.add('active');
      btnSimSplitEqual.classList.remove('active');
      document.getElementById('sim-custom-shares-container').classList.remove('hidden');
      renderSimCustomSharesInputs();
    });
  }

  // Split Type toggle buttons inside Expense Modal
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

  // Split Type toggle buttons inside Recurring Expense Modal
  const btnRecSplitEqual = document.getElementById('btn-recurring-split-equal');
  const btnRecSplitCustom = document.getElementById('btn-recurring-split-custom');
  if (btnRecSplitEqual && btnRecSplitCustom) {
    btnRecSplitEqual.addEventListener('click', () => {
      btnRecSplitEqual.classList.add('active');
      btnRecSplitCustom.classList.remove('active');
      document.getElementById('recurring-custom-shares-container').classList.add('hidden');
    });

    btnRecSplitCustom.addEventListener('click', () => {
      btnRecSplitCustom.classList.add('active');
      btnRecSplitEqual.classList.remove('active');
      document.getElementById('recurring-custom-shares-container').classList.remove('hidden');
      renderRecurringCustomSharesInputs();
    });
  }

  // Helper to determine active export scope (All vs Filtered)
  function getSelectedExpensesForExport() {
    const checkedRadio = document.querySelector('input[name="export-scope"]:checked');
    const isFilteredScope = checkedRadio && checkedRadio.value === 'FILTERED';
    let expensesToExport = appState.expenses || [];
    let scopeLabel = 'All Expenses';

    if (isFilteredScope) {
      const res = calcLogic.filterAndSortExpenses
        ? calcLogic.filterAndSortExpenses(appState.expenses || [], appState.members || [], currentFilterState)
        : { filtered: appState.expenses || [] };
      expensesToExport = res.filtered || [];
      scopeLabel = 'Filtered Expenses';
    }

    return { expensesToExport, isFilteredScope, scopeLabel };
  }

  // Open Export / Report Modal Triggers
  const openExportModalHandler = () => {
    ui.renderExportReportModal(appState, currentFilterState);
    ui.openModal('modal-export-report');
  };

  const btnOpenExport = document.getElementById('btn-open-export-report');
  if (btnOpenExport) {
    btnOpenExport.addEventListener('click', openExportModalHandler);
  }

  const btnExportCSVHeader = document.getElementById('btn-export-csv');
  if (btnExportCSVHeader) {
    btnExportCSVHeader.addEventListener('click', openExportModalHandler);
  }

  const btnPrintHeader = document.getElementById('btn-print-summary');
  if (btnPrintHeader) {
    btnPrintHeader.addEventListener('click', openExportModalHandler);
  }

  // Modal Action 1: Download CSV
  const btnDoExportCSV = document.getElementById('btn-do-export-csv');
  if (btnDoExportCSV) {
    btnDoExportCSV.addEventListener('click', () => {
      const { expensesToExport, scopeLabel } = getSelectedExpensesForExport();

      if (expensesToExport.length === 0) {
        ui.showToast('No expenses available to export.', 'info');
        return;
      }

      const csvStr = storage.exportToCSV(expensesToExport, appState.members);
      const groupName = appState.group ? appState.group.name : 'Group';
      const fileName = storage.generateCSVFilename
        ? storage.generateCSVFilename(groupName, new Date().toISOString().split('T')[0])
        : `expenses_${Date.now()}.csv`;

      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Log optional activity record
      if (expense.logActivity) {
        expense.logActivity(appState, {
          type: 'report_exported',
          category: 'all',
          message: `Expense report exported as CSV (${scopeLabel})`
        });
        storage.saveData(appState);
      }

      ui.showToast(`Exported ${expensesToExport.length} expense(s) to ${fileName}`, 'success');
      ui.closeModal('modal-export-report');
    });
  }

  // Modal Action 2: Print Report
  const btnDoPrintReport = document.getElementById('btn-do-print-report');
  if (btnDoPrintReport) {
    btnDoPrintReport.addEventListener('click', () => {
      const { expensesToExport, scopeLabel } = getSelectedExpensesForExport();
      ui.renderPrintReport(appState, expensesToExport, scopeLabel);
      ui.closeModal('modal-export-report');
      window.print();
    });
  }

  // Modal Action 3: Copy Expense Summary
  const btnDoCopyExpenseSummary = document.getElementById('btn-do-copy-expense-summary');
  if (btnDoCopyExpenseSummary) {
    btnDoCopyExpenseSummary.addEventListener('click', () => {
      const { expensesToExport } = getSelectedExpensesForExport();

      if (expensesToExport.length === 0) {
        ui.showToast('No expenses available to export.', 'info');
        return;
      }

      const summaryText = calcLogic.generateExpenseSummaryText
        ? calcLogic.generateExpenseSummaryText(appState.group, expensesToExport, appState.members)
        : '';

      if (!summaryText) {
        ui.showToast('Unable to copy summary. Please try again.', 'danger');
        return;
      }

      ui.copyToClipboard(summaryText).then(success => {
        if (success) {
          if (expense.logActivity) {
            expense.logActivity(appState, {
              type: 'report_exported',
              category: 'all',
              message: 'Expense summary copied to clipboard'
            });
            storage.saveData(appState);
          }
          ui.showToast('Summary copied to clipboard.', 'success');
        } else {
          ui.showToast('Unable to copy summary. Please try again.', 'danger');
        }
      }).catch(() => {
        ui.showToast('Unable to copy summary. Please try again.', 'danger');
      });

      ui.closeModal('modal-export-report');
    });
  }

  // Modal Action 4: Copy Settlement Summary
  const btnDoCopySettlementSummary = document.getElementById('btn-do-copy-settlement-summary');
  if (btnDoCopySettlementSummary) {
    btnDoCopySettlementSummary.addEventListener('click', () => {
      const { expensesToExport } = getSelectedExpensesForExport();
      const settlementText = calcLogic.generateSettlementSummaryText
        ? calcLogic.generateSettlementSummaryText(appState.group, appState.members, expensesToExport, appState.settlements)
        : '';

      if (!settlementText) {
        ui.showToast('Unable to copy settlement summary. Please try again.', 'danger');
        return;
      }

      ui.copyToClipboard(settlementText).then(success => {
        if (success) {
          ui.showToast('Settlement summary copied.', 'success');
        } else {
          ui.showToast('Unable to copy settlement summary. Please try again.', 'danger');
        }
      }).catch(() => {
        ui.showToast('Unable to copy settlement summary. Please try again.', 'danger');
      });

      ui.closeModal('modal-export-report');
    });
  }

  // Modal Action 5: Native Web Share API
  const btnDoShareSettlement = document.getElementById('btn-do-share-settlement');
  if (btnDoShareSettlement) {
    btnDoShareSettlement.addEventListener('click', () => {
      const { expensesToExport } = getSelectedExpensesForExport();
      const groupTitle = (appState.group && appState.group.name) ? appState.group.name : 'Group';
      const settlementText = calcLogic.generateSettlementSummaryText
        ? calcLogic.generateSettlementSummaryText(appState.group, appState.members, expensesToExport, appState.settlements)
        : '';

      if (!settlementText) {
        ui.showToast('Unable to prepare settlement summary.', 'danger');
        return;
      }

      if (navigator.share) {
        navigator.share({
          title: `${groupTitle} - Settlement`,
          text: settlementText
        }).then(() => {
          ui.showToast('Settlement shared successfully.', 'success');
        }).catch(err => {
          if (err && err.name !== 'AbortError') {
            ui.showToast('Unable to share. Summary copied instead.', 'info');
            ui.copyToClipboard(settlementText);
          }
        });
      } else {
        // Fallback to Copy Summary
        ui.copyToClipboard(settlementText).then(success => {
          if (success) {
            ui.showToast('Settlement summary copied (Web Share API unavailable).', 'info');
          } else {
            ui.showToast('Unable to share or copy summary. Please try again.', 'danger');
          }
        });
      }

      ui.closeModal('modal-export-report');
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

  if (targetExp && targetExp.receipt && targetExp.receipt.data) {
    currentExpenseReceipt = { ...targetExp.receipt };
  } else {
    currentExpenseReceipt = null;
  }
  ui.renderReceiptPreview(currentExpenseReceipt);

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
    date,
    receipt: currentExpenseReceipt
  };

  const isEditing = !!editingExpenseId;
  if (isEditing) {
    const targetExp = (appState.expenses || []).find(e => e.id === editingExpenseId);
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Edit "${targetExp ? targetExp.title : title.trim()}"`);
    }
  } else {
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Add "${title.trim()}"`);
    }
  }

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

  currentExpenseReceipt = null;
  editingExpenseId = null;
  ui.closeModal('modal-expense');
  renderFullDashboard();
  ui.showToast(`Expense ${isEditing ? 'updated' : 'added'} successfully`, 'success');
}

// Active state for partial payment modal
let activePaymentSettlementId = null;

/**
 * Prepares and opens Make Payment modal
 */
function openMakePaymentModal(settlementId) {
  activePaymentSettlementId = settlementId;
  const settlement = (appState.settlements || []).find(s => s.id === settlementId);
  if (!settlement) return;

  const memberMap = {};
  (appState.members || []).forEach(m => { memberMap[m.id] = m.name; });

  const fromName = memberMap[settlement.from] || 'Unknown';
  const toName = memberMap[settlement.to] || 'Unknown';

  const stats = calcLogic.getSettlementPaymentStats ? calcLogic.getSettlementPaymentStats(settlement) : {
    totalDue: settlement.amount,
    remainingAmount: settlement.amount
  };

  const flowEl = document.getElementById('payment-modal-flow');
  const dueEl = document.getElementById('payment-modal-total-due');
  const remEl = document.getElementById('payment-modal-remaining');
  const inputAmount = document.getElementById('input-payment-amount');
  const selectMethod = document.getElementById('select-payment-method');
  const inputDate = document.getElementById('input-payment-date');
  const inputNote = document.getElementById('input-payment-note');

  if (flowEl) flowEl.textContent = `${fromName} ➔ pays ➔ ${toName}`;
  if (dueEl) dueEl.textContent = `₹${stats.totalDue.toFixed(2)}`;
  if (remEl) remEl.textContent = `₹${stats.remainingAmount.toFixed(2)}`;

  if (inputAmount) {
    ui.clearFieldError(inputAmount);
    inputAmount.value = '';
    inputAmount.setAttribute('max', stats.remainingAmount);
  }
  if (selectMethod) selectMethod.value = 'UPI';
  if (inputDate) inputDate.value = new Date().toISOString().split('T')[0];
  if (inputNote) inputNote.value = '';

  ui.openModal('modal-make-payment');
}

/**
 * Handles Partial Payment form submission
 */
function handleMakePaymentSubmit() {
  if (!activePaymentSettlementId) return;

  const inputAmount = document.getElementById('input-payment-amount');
  const selectMethod = document.getElementById('select-payment-method');
  const inputDate = document.getElementById('input-payment-date');
  const inputNote = document.getElementById('input-payment-note');

  if (!inputAmount) return;
  ui.clearFieldError(inputAmount);

  const amount = inputAmount.value;
  const paymentMethod = selectMethod ? selectMethod.value : 'UPI';
  const date = inputDate ? inputDate.value : new Date().toISOString().split('T')[0];
  const note = inputNote ? inputNote.value : '';

  if (historyManager.pushUndoSnapshot) {
    historyManager.pushUndoSnapshot(appState, `Make Payment ₹${parseFloat(amount).toFixed(2)}`);
  }

  const res = expense.addPartialPayment(appState, activePaymentSettlementId, {
    amount,
    paymentMethod,
    date,
    note
  });

  if (!res.success) {
    ui.showFieldError(inputAmount, res.error);
    return;
  }

  activePaymentSettlementId = null;
  ui.closeModal('modal-make-payment');
  renderFullDashboard();
  ui.showToast(`Payment of ₹${parseFloat(amount).toFixed(2)} recorded!`, 'success');
}

/**
 * Prepares and opens Set Group Budget modal
 */
function openSetBudgetModal() {
  const modalTitle = document.getElementById('modal-budget-title');
  const inputBudget = document.getElementById('input-group-budget');
  const btnRemove = document.getElementById('btn-remove-budget');

  if (!inputBudget) return;
  ui.clearFieldError(inputBudget);

  const currentBudget = appState.group ? appState.group.budget : null;

  if (currentBudget && currentBudget > 0) {
    if (modalTitle) modalTitle.textContent = 'Edit Group Budget';
    inputBudget.value = currentBudget;
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    if (modalTitle) modalTitle.textContent = 'Set Group Budget';
    inputBudget.value = '';
    if (btnRemove) btnRemove.classList.add('hidden');
  }

  ui.openModal('modal-set-budget');
}

/**
 * Handles Set Group Budget form submission
 */
function handleSetBudgetSubmit() {
  const inputBudget = document.getElementById('input-group-budget');
  if (!inputBudget) return;

  ui.clearFieldError(inputBudget);

  const currentBudget = appState.group ? appState.group.budget : null;
  const isEdit = typeof currentBudget === 'number' && currentBudget > 0;
  if (historyManager.pushUndoSnapshot && !isNaN(parseFloat(inputBudget.value))) {
    historyManager.pushUndoSnapshot(appState, isEdit ? `Update Budget ₹${parseFloat(inputBudget.value).toFixed(2)}` : `Set Budget ₹${parseFloat(inputBudget.value).toFixed(2)}`);
  }

  const res = expense.setGroupBudget(appState, inputBudget.value);
  if (!res.success) {
    ui.showFieldError(inputBudget, res.error);
    return;
  }

  ui.closeModal('modal-set-budget');
  renderFullDashboard();
  ui.showToast(`Group budget set to ₹${res.budget.toFixed(2)}`, 'success');
}

/**
 * Prepares and opens Add/Edit Recurring Expense modal
 */
function openRecurringModal(editId = null) {
  const modalTitle = document.getElementById('modal-recurring-title');
  const inputTitle = document.getElementById('input-recurring-title');
  const inputAmount = document.getElementById('input-recurring-amount');
  const selectPaidBy = document.getElementById('select-recurring-paid-by');
  const selectFrequency = document.getElementById('select-recurring-frequency');
  const selectCategory = document.getElementById('select-recurring-category');
  const inputStartDate = document.getElementById('input-recurring-start-date');
  const inputNextDueDate = document.getElementById('input-recurring-next-due-date');
  const selectStatus = document.getElementById('select-recurring-status');
  const participantsContainer = document.getElementById('recurring-participants-checkboxes');
  const btnEqual = document.getElementById('btn-recurring-split-equal');
  const btnCustom = document.getElementById('btn-recurring-split-custom');
  const customContainer = document.getElementById('recurring-custom-shares-container');

  if (!selectPaidBy || !participantsContainer) return;

  ui.clearFieldError(inputTitle);
  ui.clearFieldError(inputAmount);

  // Populate Paid By dropdown
  selectPaidBy.innerHTML = appState.members.map(m => `
    <option value="${m.id}">${ui.escapeHtml(m.name)}</option>
  `).join('');

  const target = editId ? (appState.recurringExpenses || []).find(r => r.id === editId) : null;
  const todayStr = new Date().toISOString().split('T')[0];

  if (target) {
    if (modalTitle) modalTitle.textContent = 'Edit Recurring Expense';
    if (inputTitle) inputTitle.value = target.title;
    if (inputAmount) inputAmount.value = target.amount;
    if (selectPaidBy) selectPaidBy.value = target.paidBy;
    if (selectFrequency) selectFrequency.value = target.frequency || 'monthly';
    if (selectCategory) selectCategory.value = target.category || 'Other';
    if (inputStartDate) inputStartDate.value = target.startDate || todayStr;
    if (inputNextDueDate) inputNextDueDate.value = target.nextDueDate || todayStr;
    if (selectStatus) selectStatus.value = target.status || 'active';

    if (target.splitType === 'custom') {
      btnCustom.classList.add('active');
      btnEqual.classList.remove('active');
      customContainer.classList.remove('hidden');
    } else {
      btnEqual.classList.add('active');
      btnCustom.classList.remove('active');
      customContainer.classList.add('hidden');
    }
  } else {
    if (modalTitle) modalTitle.textContent = 'Add Recurring Expense';
    if (inputTitle) inputTitle.value = '';
    if (inputAmount) inputAmount.value = '';
    if (selectFrequency) selectFrequency.value = 'monthly';
    if (selectCategory) selectCategory.value = 'Food';
    if (inputStartDate) inputStartDate.value = todayStr;
    if (inputNextDueDate) inputNextDueDate.value = todayStr;
    if (selectStatus) selectStatus.value = 'active';

    btnEqual.classList.add('active');
    btnCustom.classList.remove('active');
    customContainer.classList.add('hidden');
  }

  // Auto calculate next due date when start date or frequency changes for new items
  function updateAutoNextDueDate() {
    if (!editingRecurringId && inputStartDate && inputNextDueDate && selectFrequency) {
      const nextDate = calcLogic.calculateNextDueDate ? calcLogic.calculateNextDueDate(inputStartDate.value, selectFrequency.value) : inputStartDate.value;
      inputNextDueDate.value = nextDate;
    }
  }

  if (inputStartDate) inputStartDate.onchange = updateAutoNextDueDate;
  if (selectFrequency) selectFrequency.onchange = updateAutoNextDueDate;

  // Populate Participants Checkboxes
  const selectedParticipants = target ? target.participants : appState.members.map(m => m.id);

  participantsContainer.innerHTML = appState.members.map(m => {
    const isChecked = selectedParticipants.includes(m.id);
    return `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" class="chk-recurring-participant" value="${m.id}" ${isChecked ? 'checked' : ''}>
        <span>${ui.escapeHtml(m.name)}</span>
      </label>
    `;
  }).join('');

  if (target && target.splitType === 'custom') {
    renderRecurringCustomSharesInputs(target.customShares);
  }

  participantsContainer.querySelectorAll('.chk-recurring-participant').forEach(chk => {
    chk.addEventListener('change', () => {
      if (btnCustom.classList.contains('active')) {
        renderRecurringCustomSharesInputs();
      }
    });
  });

  ui.openModal('modal-recurring-expense');
}

/**
 * Dynamically renders custom shares inputs for checked recurring participants
 */
function renderRecurringCustomSharesInputs(existingShares = {}) {
  const container = document.getElementById('recurring-custom-shares-inputs-list');
  const amountInput = document.getElementById('input-recurring-amount');
  const statusNotice = document.getElementById('recurring-custom-shares-status');
  if (!container) return;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-recurring-participant:checked'));
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
          <input type="number" step="0.01" min="0" class="form-control input-recurring-custom-share" data-id="${id}" value="${val}" style="width: 100px; text-align: right;">
        </div>
      </div>
    `;
  }).join('');

  function updateCustomValidationStatus() {
    const totalAmount = parseFloat(amountInput.value) || 0;
    const shareInputs = Array.from(container.querySelectorAll('.input-recurring-custom-share'));

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

  container.querySelectorAll('.input-recurring-custom-share').forEach(inp => {
    inp.addEventListener('input', updateCustomValidationStatus);
  });
  amountInput.addEventListener('input', updateCustomValidationStatus);
  updateCustomValidationStatus();
}

/**
 * Handles Add/Edit Recurring Expense form submission
 */
function handleRecurringExpenseFormSubmit() {
  const inputTitle = document.getElementById('input-recurring-title');
  const inputAmount = document.getElementById('input-recurring-amount');
  const selectPaidBy = document.getElementById('select-recurring-paid-by');
  const selectFrequency = document.getElementById('select-recurring-frequency');
  const selectCategory = document.getElementById('select-recurring-category');
  const inputStartDate = document.getElementById('input-recurring-start-date');
  const inputNextDueDate = document.getElementById('input-recurring-next-due-date');
  const selectStatus = document.getElementById('select-recurring-status');
  const btnCustom = document.getElementById('btn-recurring-split-custom');
  const customContainer = document.getElementById('recurring-custom-shares-container');

  ui.clearFieldError(inputTitle);
  ui.clearFieldError(inputAmount);

  const title = inputTitle.value;
  const amount = inputAmount.value;
  const paidBy = selectPaidBy.value;
  const frequency = selectFrequency.value;
  const category = selectCategory.value;
  const startDate = inputStartDate.value;
  const nextDueDate = inputNextDueDate.value;
  const status = selectStatus ? selectStatus.value : 'active';

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-recurring-participant:checked'));
  const participants = checkedCheckboxes.map(c => c.value);

  const splitType = btnCustom.classList.contains('active') ? 'custom' : 'equal';
  const customShares = {};

  if (splitType === 'custom' && customContainer) {
    customContainer.querySelectorAll('.input-recurring-custom-share').forEach(inp => {
      const id = inp.getAttribute('data-id');
      customShares[id] = parseFloat(inp.value) || 0;
    });
  }

  const payload = {
    title,
    amount,
    paidBy,
    participants,
    splitType,
    customShares,
    category,
    frequency,
    startDate,
    nextDueDate,
    status
  };

  const wasEditing = editingRecurringId;
  if (wasEditing) {
    const targetRec = (appState.recurringExpenses || []).find(r => r.id === editingRecurringId);
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Edit Recurring "${targetRec ? targetRec.title : title.trim()}"`);
    }
  } else {
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Add Recurring "${title.trim()}"`);
    }
  }

  let res;
  if (editingRecurringId) {
    res = expense.editRecurringExpense(appState, editingRecurringId, payload);
  } else {
    res = expense.addRecurringExpense(appState, payload);
  }

  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  const wasEditing = editingRecurringId;
  editingRecurringId = null;
  ui.closeModal('modal-recurring-expense');
  renderFullDashboard();
  ui.showToast(`Recurring expense ${wasEditing ? 'updated' : 'added'} successfully`, 'success');
}

/**
 * What-If Settlement Simulator Modal Handlers
 */
function openSimulatePaymentModal() {
  if (!simulationState) simulationState = expense.initSimulationState(appState);

  const selectFrom = document.getElementById('select-sim-payment-from');
  const selectTo = document.getElementById('select-sim-payment-to');
  const inputAmount = document.getElementById('input-sim-payment-amount');

  if (!selectFrom || !selectTo) return;

  const members = simulationState.members || [];
  if (members.length < 2) {
    ui.showToast('At least 2 members are required to simulate a payment.', 'warning');
    return;
  }

  selectFrom.innerHTML = members.map(m => `<option value="${m.id}">${ui.escapeHtml(m.name)}</option>`).join('');
  selectTo.innerHTML = members.map(m => `<option value="${m.id}">${ui.escapeHtml(m.name)}</option>`).join('');
  
  if (members.length >= 2) {
    selectTo.value = members[1].id;
  }

  if (inputAmount) inputAmount.value = '';

  ui.openModal('modal-sim-payment');
}

function handleSimPaymentSubmit() {
  const fromId = document.getElementById('select-sim-payment-from').value;
  const toId = document.getElementById('select-sim-payment-to').value;
  const amount = document.getElementById('input-sim-payment-amount').value;

  const res = expense.simulatePayment(simulationState, fromId, toId, amount);
  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  ui.closeModal('modal-sim-payment');
  ui.renderSimulatorTab(appState, simulationState);
  ui.showToast('Simulated payment added', 'info');
}

function openSimulateExpenseModal() {
  if (!simulationState) simulationState = expense.initSimulationState(appState);

  const inputTitle = document.getElementById('input-sim-expense-title');
  const inputAmount = document.getElementById('input-sim-expense-amount');
  const selectPaidBy = document.getElementById('select-sim-expense-paid-by');
  const selectCategory = document.getElementById('select-sim-expense-category');
  const participantsContainer = document.getElementById('sim-participants-checkboxes');
  const btnEqual = document.getElementById('btn-sim-split-equal');
  const btnCustom = document.getElementById('btn-sim-split-custom');
  const customContainer = document.getElementById('sim-custom-shares-container');

  if (!selectPaidBy || !participantsContainer) return;

  if (inputTitle) inputTitle.value = '';
  if (inputAmount) inputAmount.value = '';
  if (selectCategory) selectCategory.value = 'Food';

  selectPaidBy.innerHTML = simulationState.members.map(m => `
    <option value="${m.id}">${ui.escapeHtml(m.name)}</option>
  `).join('');

  participantsContainer.innerHTML = simulationState.members.map(m => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
      <input type="checkbox" class="chk-sim-participant" value="${m.id}" checked>
      <span>${ui.escapeHtml(m.name)}</span>
    </label>
  `).join('');

  if (btnEqual && btnCustom && customContainer) {
    btnEqual.classList.add('active');
    btnCustom.classList.remove('active');
    customContainer.classList.add('hidden');
  }

  ui.openModal('modal-sim-expense');
}

function renderSimCustomSharesInputs() {
  const container = document.getElementById('sim-custom-shares-inputs-list');
  if (!container) return;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-sim-participant:checked'));
  const checkedIds = checkedCheckboxes.map(c => c.value);

  const memberMap = {};
  (simulationState ? simulationState.members : appState.members).forEach(m => { memberMap[m.id] = m.name; });

  container.innerHTML = checkedIds.map(id => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
      <span style="font-size: 0.9rem; font-weight: 500;">${ui.escapeHtml(memberMap[id] || id)}</span>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span>₹</span>
        <input type="number" step="0.01" min="0" class="form-control input-sim-custom-share" data-id="${id}" value="" style="width: 100px; text-align: right;">
      </div>
    </div>
  `).join('');
}

function handleSimExpenseSubmit() {
  const title = document.getElementById('input-sim-expense-title').value;
  const amount = document.getElementById('input-sim-expense-amount').value;
  const paidBy = document.getElementById('select-sim-expense-paid-by').value;
  const category = document.getElementById('select-sim-expense-category').value;
  const btnCustom = document.getElementById('btn-sim-split-custom');
  const customContainer = document.getElementById('sim-custom-shares-container');

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-sim-participant:checked'));
  const participants = checkedCheckboxes.map(c => c.value);

  const splitType = btnCustom.classList.contains('active') ? 'custom' : 'equal';
  const customShares = {};

  if (splitType === 'custom' && customContainer) {
    customContainer.querySelectorAll('.input-sim-custom-share').forEach(inp => {
      const id = inp.getAttribute('data-id');
      customShares[id] = parseFloat(inp.value) || 0;
    });
  }

  const res = expense.simulateAddExpense(simulationState, {
    title,
    amount,
    paidBy,
    category,
    splitType,
    participants,
    customShares
  });

  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  ui.closeModal('modal-sim-expense');
  ui.renderSimulatorTab(appState, simulationState);
  ui.showToast('Simulated expense added', 'info');
}

function openSimulateEditAmountModal() {
  if (!simulationState) simulationState = expense.initSimulationState(appState);

  const selectExpense = document.getElementById('select-sim-edit-expense');
  const inputAmount = document.getElementById('input-sim-edit-amount');

  if (!selectExpense) return;

  const expenses = simulationState.expenses || [];
  if (expenses.length === 0) {
    ui.showToast('No expenses available in simulation to modify.', 'warning');
    return;
  }

  selectExpense.innerHTML = expenses.map(e => `
    <option value="${e.id}">${ui.escapeHtml(e.title)} (Current: ₹${parseFloat(e.amount).toFixed(2)})</option>
  `).join('');

  if (inputAmount) {
    inputAmount.value = expenses[0] ? parseFloat(expenses[0].amount).toFixed(2) : '';
  }

  selectExpense.onchange = () => {
    const selected = expenses.find(e => e.id === selectExpense.value);
    if (selected && inputAmount) {
      inputAmount.value = parseFloat(selected.amount).toFixed(2);
    }
  };

  ui.openModal('modal-sim-edit-amount');
}

function handleSimEditAmountSubmit() {
  const expenseId = document.getElementById('select-sim-edit-expense').value;
  const newAmount = document.getElementById('input-sim-edit-amount').value;

  const res = expense.simulateEditExpenseAmount(simulationState, expenseId, newAmount);
  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  ui.closeModal('modal-sim-edit-amount');
  ui.renderSimulatorTab(appState, simulationState);
  ui.showToast('Simulated expense amount modified', 'info');
}

function openSimulateRemoveExpenseModal() {
  if (!simulationState) simulationState = expense.initSimulationState(appState);

  const selectExpense = document.getElementById('select-sim-remove-expense');
  if (!selectExpense) return;

  const expenses = simulationState.expenses || [];
  if (expenses.length === 0) {
    ui.showToast('No expenses available in simulation to remove.', 'warning');
    return;
  }

  selectExpense.innerHTML = expenses.map(e => `
    <option value="${e.id}">${ui.escapeHtml(e.title)} — ₹${parseFloat(e.amount).toFixed(2)}</option>
  `).join('');

  ui.openModal('modal-sim-remove-expense');
}

function handleSimRemoveExpenseSubmit() {
  const expenseId = document.getElementById('select-sim-remove-expense').value;

  const res = expense.simulateRemoveExpense(simulationState, expenseId);
  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  ui.closeModal('modal-sim-remove-expense');
  ui.renderSimulatorTab(appState, simulationState);
  ui.showToast('Simulated expense removal added', 'info');
}

/**
 * Expense Template Modal Handlers & Actions
 */
function openAddTemplateModal() {
  editingTemplateId = null;
  document.getElementById('modal-template-title').textContent = 'Create Expense Template';

  const inputName = document.getElementById('input-template-name');
  const inputTitle = document.getElementById('input-template-title');
  const inputAmount = document.getElementById('input-template-amount');
  const selectCategory = document.getElementById('select-template-category');
  const selectPaidBy = document.getElementById('select-template-paid-by');
  const participantsContainer = document.getElementById('template-participants-checkboxes');
  const btnEqual = document.getElementById('btn-template-split-equal');
  const btnCustom = document.getElementById('btn-template-split-custom');
  const customContainer = document.getElementById('template-custom-shares-container');

  if (inputName) inputName.value = '';
  if (inputTitle) inputTitle.value = '';
  if (inputAmount) inputAmount.value = '';
  if (selectCategory) selectCategory.value = 'Food';

  if (selectPaidBy) {
    selectPaidBy.innerHTML = '<option value="">(Optional Default Payer)</option>' +
      appState.members.map(m => `<option value="${m.id}">${ui.escapeHtml(m.name)}</option>`).join('');
  }

  if (participantsContainer) {
    participantsContainer.innerHTML = appState.members.map(m => `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" class="chk-template-participant" value="${m.id}" checked>
        <span>${ui.escapeHtml(m.name)}</span>
      </label>
    `).join('');
  }

  if (btnEqual && btnCustom && customContainer) {
    btnEqual.classList.add('active');
    btnCustom.classList.remove('active');
    customContainer.classList.add('hidden');
  }

  ui.openModal('modal-template');
}

function openEditTemplateModal(templateId) {
  const target = (appState.templates || []).find(t => t.id === templateId);
  if (!target) return;

  editingTemplateId = templateId;
  document.getElementById('modal-template-title').textContent = 'Edit Expense Template';

  const inputName = document.getElementById('input-template-name');
  const inputTitle = document.getElementById('input-template-title');
  const inputAmount = document.getElementById('input-template-amount');
  const selectCategory = document.getElementById('select-template-category');
  const selectPaidBy = document.getElementById('select-template-paid-by');
  const participantsContainer = document.getElementById('template-participants-checkboxes');
  const btnEqual = document.getElementById('btn-template-split-equal');
  const btnCustom = document.getElementById('btn-template-split-custom');
  const customContainer = document.getElementById('template-custom-shares-container');

  if (inputName) inputName.value = target.name || '';
  if (inputTitle) inputTitle.value = target.title || '';
  if (inputAmount) inputAmount.value = target.defaultAmount ? target.defaultAmount : '';
  if (selectCategory) selectCategory.value = target.category || 'Food';

  if (selectPaidBy) {
    selectPaidBy.innerHTML = '<option value="">(Optional Default Payer)</option>' +
      appState.members.map(m => `<option value="${m.id}">${ui.escapeHtml(m.name)}</option>`).join('');
    selectPaidBy.value = target.defaultPayer || '';
  }

  if (participantsContainer) {
    const selectedSet = new Set(target.participants || []);
    participantsContainer.innerHTML = appState.members.map(m => `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" class="chk-template-participant" value="${m.id}" ${selectedSet.has(m.id) ? 'checked' : ''}>
        <span>${ui.escapeHtml(m.name)}</span>
      </label>
    `).join('');
  }

  if (btnEqual && btnCustom && customContainer) {
    if (target.splitType === 'custom') {
      btnCustom.classList.add('active');
      btnEqual.classList.remove('active');
      customContainer.classList.remove('hidden');
      renderTemplateCustomSharesInputs(target.customShares || {});
    } else {
      btnEqual.classList.add('active');
      btnCustom.classList.remove('active');
      customContainer.classList.add('hidden');
    }
  }

  ui.openModal('modal-template');
}

function handleTemplateFormSubmit() {
  const name = document.getElementById('input-template-name').value;
  const title = document.getElementById('input-template-title').value;
  const defaultAmount = document.getElementById('input-template-amount').value;
  const category = document.getElementById('select-template-category').value;
  const defaultPayer = document.getElementById('select-template-paid-by').value;
  const btnCustom = document.getElementById('btn-template-split-custom');

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-template-participant:checked'));
  const participants = checkedCheckboxes.map(c => c.value);

  const splitType = btnCustom.classList.contains('active') ? 'custom' : 'equal';
  const customShares = {};

  if (splitType === 'custom') {
    document.querySelectorAll('.input-template-custom-share').forEach(inp => {
      const id = inp.getAttribute('data-id');
      customShares[id] = parseFloat(inp.value) || 0;
    });
  }

  const templateData = {
    name,
    title,
    defaultAmount,
    category,
    splitType,
    participants,
    customShares,
    defaultPayer
  };

  const wasEditing = editingTemplateId;
  if (wasEditing) {
    const targetTpl = (appState.templates || []).find(t => t.id === editingTemplateId);
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Edit Template "${targetTpl ? targetTpl.name : name.trim()}"`);
    }
  } else {
    if (historyManager.pushUndoSnapshot) {
      historyManager.pushUndoSnapshot(appState, `Create Template "${name.trim()}"`);
    }
  }

  let res;
  if (editingTemplateId) {
    res = expense.editTemplate(appState, editingTemplateId, templateData);
  } else {
    res = expense.addTemplate(appState, templateData);
  }

  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  const wasEditing = editingTemplateId;
  editingTemplateId = null;
  ui.closeModal('modal-template');
  renderFullDashboard();
  ui.showToast(`Template "${res.template.name}" ${wasEditing ? 'updated' : 'created'} successfully`, 'success');
}

function handleDuplicateTemplateAction(templateId) {
  const targetTpl = (appState.templates || []).find(t => t.id === templateId);
  if (historyManager.pushUndoSnapshot) {
    historyManager.pushUndoSnapshot(appState, `Duplicate Template "${targetTpl ? targetTpl.name : 'Template'}"`);
  }

  const res = expense.duplicateTemplate(appState, templateId);
  if (!res.success) {
    ui.showToast(res.error, 'danger');
    return;
  }

  renderFullDashboard();
  ui.showToast(`Duplicated as "${res.template.name}"`, 'success');
}

function openDeleteTemplateModal(templateId) {
  deletingTemplateId = templateId;
  ui.openModal('modal-confirm-delete-template');
}

function handleDeleteTemplateSubmit() {
  if (!deletingTemplateId) return;

  const targetTpl = (appState.templates || []).find(t => t.id === deletingTemplateId);
  if (historyManager.pushUndoSnapshot) {
    historyManager.pushUndoSnapshot(appState, `Delete Template "${targetTpl ? targetTpl.name : 'Template'}"`);
  }

  const res = expense.deleteTemplate(appState, deletingTemplateId);
  deletingTemplateId = null;

  ui.closeModal('modal-confirm-delete-template');
  renderFullDashboard();
  ui.showToast('Template deleted', 'info');
}

/**
 * Use Template Action: Pre-fills the regular Add Expense modal with template configuration.
 * Does NOT immediately save the expense.
 * 
 * @param {string} templateId 
 */
function handleUseTemplateAction(templateId) {
  const target = (appState.templates || []).find(t => t.id === templateId);
  if (!target) return;

  const sanitized = expense.sanitizeTemplateForMemberChanges(target, appState.members);

  editingExpenseId = null;
  currentExpenseReceipt = null;

  const titleInput = document.getElementById('input-expense-title');
  const amountInput = document.getElementById('input-expense-amount');
  const categorySelect = document.getElementById('select-expense-category');
  const paidBySelect = document.getElementById('select-expense-paid-by');
  const btnEqual = document.getElementById('btn-split-equal');
  const btnCustom = document.getElementById('btn-split-custom');
  const customContainer = document.getElementById('custom-shares-container');
  const modalTitle = document.getElementById('modal-expense-title');

  if (modalTitle) modalTitle.textContent = 'Add Expense';

  if (titleInput) titleInput.value = sanitized.title || '';
  if (amountInput) amountInput.value = sanitized.defaultAmount ? sanitized.defaultAmount.toString() : '';
  if (categorySelect) categorySelect.value = sanitized.category || 'Food';

  if (paidBySelect) {
    paidBySelect.innerHTML = appState.members.map(m => `
      <option value="${m.id}">${ui.escapeHtml(m.name)}</option>
    `).join('');
    if (sanitized.defaultPayer) {
      paidBySelect.value = sanitized.defaultPayer;
    }
  }

  const participantsContainer = document.getElementById('participants-checkboxes');
  if (participantsContainer) {
    const selectedSet = new Set(sanitized.participants || []);
    participantsContainer.innerHTML = appState.members.map(m => `
      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
        <input type="checkbox" class="chk-participant" value="${m.id}" ${selectedSet.has(m.id) ? 'checked' : ''}>
        <span>${ui.escapeHtml(m.name)}</span>
      </label>
    `).join('');
  }

  if (btnEqual && btnCustom && customContainer) {
    if (sanitized.splitType === 'custom') {
      btnCustom.classList.add('active');
      btnEqual.classList.remove('active');
      customContainer.classList.remove('hidden');
      renderCustomSharesInputsWithValues(sanitized.customShares || {});
    } else {
      btnEqual.classList.add('active');
      btnCustom.classList.remove('active');
      customContainer.classList.add('hidden');
    }
  }

  ui.renderReceiptPreview(null);
  ui.openModal('modal-expense');
  ui.showToast(`Pre-filled expense form from "${sanitized.name}" template`, 'info');
}

function renderTemplateCustomSharesInputs(existingShares = {}) {
  const container = document.getElementById('template-custom-shares-inputs-list');
  if (!container) return;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-template-participant:checked'));
  const checkedIds = checkedCheckboxes.map(c => c.value);

  const memberMap = {};
  appState.members.forEach(m => { memberMap[m.id] = m.name; });

  container.innerHTML = checkedIds.map(id => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
      <span style="font-size: 0.9rem; font-weight: 500;">${ui.escapeHtml(memberMap[id] || id)}</span>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span>₹</span>
        <input type="number" step="0.01" min="0" class="form-control input-template-custom-share" data-id="${id}" value="${existingShares[id] || ''}" style="width: 100px; text-align: right;">
      </div>
    </div>
  `).join('');
}

function renderCustomSharesInputsWithValues(existingShares = {}) {
  const container = document.getElementById('custom-shares-inputs-list');
  if (!container) return;

  const checkedCheckboxes = Array.from(document.querySelectorAll('.chk-participant:checked'));
  const checkedIds = checkedCheckboxes.map(c => c.value);

  const memberMap = {};
  appState.members.forEach(m => { memberMap[m.id] = m.name; });

  container.innerHTML = checkedIds.map(id => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
      <span style="font-size: 0.9rem; font-weight: 500;">${ui.escapeHtml(memberMap[id] || id)}</span>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span>₹</span>
        <input type="number" step="0.01" min="0" class="form-control input-custom-share" data-id="${id}" value="${existingShares[id] || ''}" style="width: 100px; text-align: right;">
      </div>
    </div>
  `).join('');
}

function resetAllFilters() {
  currentFilterState = {
    searchQuery: '',
    category: 'ALL',
    paidBy: 'ALL',
    dateRange: 'ALL',
    startDate: null,
    endDate: null,
    minAmount: null,
    maxAmount: null,
    splitType: 'ALL',
    receipt: 'ALL',
    sortBy: 'newest'
  };

  const inputs = {
    'input-search-expense': '',
    'select-filter-category': 'ALL',
    'select-filter-paid-by': 'ALL',
    'select-filter-date': 'ALL',
    'input-filter-start-date': '',
    'input-filter-end-date': '',
    'input-filter-min-amount': '',
    'input-filter-max-amount': '',
    'select-filter-split-type': 'ALL',
    'select-filter-receipt': 'ALL',
    'select-sort-expense': 'newest'
  };

  Object.entries(inputs).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  const customDateContainer = document.getElementById('custom-date-range-container');
  if (customDateContainer) customDateContainer.classList.add('hidden');

  ui.renderExpenseList(appState, currentFilterState);
  ui.showToast('All search & filter criteria cleared', 'info');
}

function removeSingleFilter(key) {
  if (key === 'searchQuery') {
    currentFilterState.searchQuery = '';
    const el = document.getElementById('input-search-expense');
    if (el) el.value = '';
  } else if (key === 'category') {
    currentFilterState.category = 'ALL';
    const el = document.getElementById('select-filter-category');
    if (el) el.value = 'ALL';
  } else if (key === 'paidBy') {
    currentFilterState.paidBy = 'ALL';
    const el = document.getElementById('select-filter-paid-by');
    if (el) el.value = 'ALL';
  } else if (key === 'dateRange') {
    currentFilterState.dateRange = 'ALL';
    currentFilterState.startDate = null;
    currentFilterState.endDate = null;
    const el = document.getElementById('select-filter-date');
    if (el) el.value = 'ALL';
    const customDateContainer = document.getElementById('custom-date-range-container');
    if (customDateContainer) customDateContainer.classList.add('hidden');
  } else if (key === 'amountRange') {
    currentFilterState.minAmount = null;
    currentFilterState.maxAmount = null;
    const minEl = document.getElementById('input-filter-min-amount');
    const maxEl = document.getElementById('input-filter-max-amount');
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  } else if (key === 'splitType') {
    currentFilterState.splitType = 'ALL';
    const el = document.getElementById('select-filter-split-type');
    if (el) el.value = 'ALL';
  } else if (key === 'receipt') {
    currentFilterState.receipt = 'ALL';
    const el = document.getElementById('select-filter-receipt');
    if (el) el.value = 'ALL';
  }

  ui.renderExpenseList(appState, currentFilterState);
}
