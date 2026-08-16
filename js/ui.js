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
 * Renders Header & Group Info
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
function renderExpenseList(appState, filterCategory = 'ALL', searchQuery = '', sortBy = 'newest') {
  const tableBody = document.getElementById('expense-table-body');
  const cardsList = document.getElementById('expense-cards-list');
  const emptyState = document.getElementById('expenses-empty-state');
  const tableContainer = document.querySelector('.table-responsive');

  if (!tableBody || !cardsList) return;

  const memberMap = {};
  (appState.members || []).forEach(m => { memberMap[m.id] = m.name; });

  let expenses = [...(appState.expenses || [])];

  // Apply Category Filter
  if (filterCategory !== 'ALL') {
    expenses = expenses.filter(e => e.category === filterCategory);
  }

  // Apply Search Filter
  if (searchQuery && searchQuery.trim() !== '') {
    const query = searchQuery.trim().toLowerCase();
    expenses = expenses.filter(e => e.title.toLowerCase().includes(query));
  }

  // Apply Sorting
  if (sortBy === 'amount') {
    expenses.sort((a, b) => b.amount - a.amount);
  } else if (sortBy === 'category') {
    expenses.sort((a, b) => a.category.localeCompare(b.category));
  } else {
    // Newest first default
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  if (expenses.length === 0) {
    if (tableContainer) tableContainer.classList.add('hidden');
    cardsList.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (tableContainer) tableContainer.classList.remove('hidden');
  cardsList.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  // Desktop Table Rows
  tableBody.innerHTML = expenses.map(exp => {
    const paidByName = memberMap[exp.paidBy] || 'Unknown';
    const participantCount = (exp.participants || []).length;
    return `
      <tr>
        <td><strong>${escapeHtml(exp.title)}</strong></td>
        <td><span class="badge badge-category">${escapeHtml(exp.category || 'Other')}</span></td>
        <td><strong>₹${exp.amount.toFixed(2)}</strong></td>
        <td>${escapeHtml(paidByName)}</td>
        <td>${participantCount} member${participantCount > 1 ? 's' : ''}</td>
        <td>${exp.date || ''}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm btn-edit-expense" data-id="${exp.id}">Edit</button>
            <button class="btn btn-danger btn-sm btn-delete-expense" data-id="${exp.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Mobile Stacked Cards
  cardsList.innerHTML = expenses.map(exp => {
    const paidByName = memberMap[exp.paidBy] || 'Unknown';
    return `
      <div class="expense-card-mobile">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h4 style="font-weight: 600;">${escapeHtml(exp.title)}</h4>
            <span class="badge badge-category" style="margin-top: 4px;">${escapeHtml(exp.category || 'Other')}</span>
          </div>
          <span style="font-size: 1.1rem; font-weight: 700;">₹${exp.amount.toFixed(2)}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-muted); display: flex; justify-content: space-between; margin-top: 8px;">
          <span>Paid by <strong>${escapeHtml(paidByName)}</strong></span>
          <span>${exp.date || ''}</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn btn-secondary btn-sm btn-edit-expense" data-id="${exp.id}" style="flex:1;">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-expense" data-id="${exp.id}" style="flex:1;">Delete</button>
        </div>
      </div>
    `;
  }).join('');
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
 * Renders Spend Statistics section
 */
function renderStatistics(appState) {
  const catListContainer = document.getElementById('stats-categories-list');
  const topSpenderEl = document.getElementById('stat-top-spender');
  const avgSpendEl = document.getElementById('stat-avg-spend');
  if (!catListContainer) return;

  const expenses = appState.expenses || [];
  const members = appState.members || [];

  if (expenses.length === 0) {
    catListContainer.innerHTML = '<div style="color: var(--color-text-muted);">No expense data to analyze yet.</div>';
    if (topSpenderEl) topSpenderEl.textContent = '-';
    if (avgSpendEl) avgSpendEl.textContent = '₹0.00';
    return;
  }

  const categoryTotals = {};
  let totalSpend = 0;

  expenses.forEach(e => {
    const cat = e.category || 'Other';
    const amt = parseFloat(e.amount) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    totalSpend += amt;
  });

  const catColors = {
    'Food': 'var(--cat-food)',
    'Travel': 'var(--cat-travel)',
    'Hotel': 'var(--cat-hotel)',
    'Shopping': 'var(--cat-shopping)',
    'Entertainment': 'var(--cat-entertainment)',
    'Other': 'var(--cat-other)'
  };

  catListContainer.innerHTML = Object.keys(categoryTotals).map(cat => {
    const amt = categoryTotals[cat];
    const pct = totalSpend > 0 ? Math.round((amt / totalSpend) * 100) : 0;
    const color = catColors[cat] || 'var(--cat-other)';
    return `
      <div class="cat-bar-item">
        <div class="cat-bar-label">
          <span>${cat} (${pct}%)</span>
          <strong>₹${amt.toFixed(2)}</strong>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');

  // Top Spender Calculation
  const balancesMap = calc.calculateBalances ? calc.calculateBalances(members, expenses) : {};
  let topSpenderName = '-';
  let maxPaid = 0;

  Object.values(balancesMap).forEach(b => {
    if (b.paid > maxPaid) {
      maxPaid = b.paid;
      topSpenderName = b.name;
    }
  });

  if (topSpenderEl) topSpenderEl.textContent = `${topSpenderName} (₹${maxPaid.toFixed(2)})`;

  // Average Spend Calculation
  const avg = members.length > 0 ? totalSpend / members.length : 0;
  if (avgSpendEl) avgSpendEl.textContent = `₹${avg.toFixed(2)}`;
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

// Utility HTML escape helper to prevent XSS
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    escapeHtml
  };
}
