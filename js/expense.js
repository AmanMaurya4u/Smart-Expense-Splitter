/**
 * Smart Expense Splitter - Expense & Member Business Logic Manager
 * Connects CRUD operations with pure calculation functions and storage persistence.
 */

// Universal import fallback for calculation and storage if running in Node.js
let calcModule = typeof window !== 'undefined' ? window : {};
let storeModule = typeof window !== 'undefined' ? window : {};

if (typeof module !== 'undefined' && module.exports) {
  calcModule = require('./calculation.js');
  storeModule = require('./storage.js');
}

/**
 * Appends a new activity record to the timeline ring buffer (max 100 items).
 * 
 * @param {Object} appState 
 * @param {Object} activityData - { type, category, message, actor, amount, relatedEntityId }
 */
function logActivity(appState, activityData) {
  if (!Array.isArray(appState.activities)) {
    appState.activities = [];
  }

  const activityRecord = {
    id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type: activityData.type || 'info',
    category: activityData.category || 'all',
    message: activityData.message || '',
    actor: activityData.actor || null,
    amount: typeof activityData.amount === 'number' ? activityData.amount : null,
    relatedEntityId: activityData.relatedEntityId || null,
    timestamp: new Date().toISOString()
  };

  appState.activities.unshift(activityRecord);

  // Maintain ring-buffer limit of 100 items
  if (appState.activities.length > 100) {
    appState.activities = appState.activities.slice(0, 100);
  }
}

/**
 * Clears activity timeline records without deleting group expenses or members.
 * 
 * @param {Object} appState 
 * @returns {{ success: boolean }}
 */
function clearActivityHistory(appState) {
  appState.activities = [];
  storeModule.saveData(appState);
  return { success: true };
}

/**
 * Creates a new group.
 * @param {Object} appState 
 * @param {string} name 
 * @returns {{ success: boolean, error?: string, group?: Object }}
 */
function createGroup(appState, name) {
  const trimmedName = (name || '').trim();
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 50) {
    return { success: false, error: 'Group name must be between 2 and 50 characters.' };
  }

  appState.group = {
    id: `group_${Date.now()}`,
    name: trimmedName,
    budget: null,
    currentUserId: null,
    createdAt: new Date().toISOString()
  };

  logActivity(appState, {
    type: 'group_created',
    category: 'all',
    message: `Group "${trimmedName}" was created`
  });

  storeModule.saveData(appState);
  return { success: true, group: appState.group };
}

/**
 * Adds a new member to the current group.
 * @param {Object} appState 
 * @param {string} name 
 * @param {string} contact 
 * @returns {{ success: boolean, error?: string, member?: Object }}
 */
function addMember(appState, name, contact = '') {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    return { success: false, error: 'Please enter a member name.' };
  }

  const isDuplicate = appState.members.some(
    m => m.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (isDuplicate) {
    return { success: false, error: 'This member already exists in the group.' };
  }

  const newMember = {
    id: `member_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: trimmedName,
    contact: contact.trim(),
    createdAt: new Date().toISOString()
  };

  appState.members.push(newMember);

  // Set default current user if none selected
  if (appState.group && !appState.group.currentUserId) {
    appState.group.currentUserId = newMember.id;
  }

  logActivity(appState, {
    type: 'member_added',
    category: 'members',
    message: `${trimmedName} joined the group`,
    actor: trimmedName,
    relatedEntityId: newMember.id
  });

  recalculateGroupSettlements(appState);
  storeModule.saveData(appState);

  return { success: true, member: newMember };
}

/**
 * Checks if a member can be safely removed (has zero expense history).
 * @param {Object} appState 
 * @param {string} memberId 
 * @returns {boolean}
 */
function isMemberDeletable(appState, memberId) {
  return !appState.expenses.some(
    exp => exp.paidBy === memberId || (exp.participants && exp.participants.includes(memberId))
  );
}

/**
 * Removes a member if not linked to any expense.
 * @param {Object} appState 
 * @param {string} memberId 
 * @returns {{ success: boolean, error?: string }}
 */
function removeMember(appState, memberId) {
  if (!isMemberDeletable(appState, memberId)) {
    return { success: false, error: 'Cannot remove — member has expense history.' };
  }

  const memberObj = appState.members.find(m => m.id === memberId);
  const memberName = memberObj ? memberObj.name : 'Member';

  appState.members = appState.members.filter(m => m.id !== memberId);

  // Re-assign current user reference if deleted
  if (appState.group && appState.group.currentUserId === memberId) {
    appState.group.currentUserId = appState.members.length > 0 ? appState.members[0].id : null;
  }

  logActivity(appState, {
    type: 'member_removed',
    category: 'members',
    message: `${memberName} was removed from the group`,
    actor: memberName,
    relatedEntityId: memberId
  });

  recalculateGroupSettlements(appState);
  storeModule.saveData(appState);

  return { success: true };
}

/**
 * Adds a new expense and updates balances/settlements.
 * @param {Object} appState 
 * @param {Object} expenseData 
 * @returns {{ success: boolean, error?: string, expense?: Object }}
 */
function addExpense(appState, expenseData) {
  const { title, amount, category, paidBy, splitType, participants, customShares, date } = expenseData;

  // Validations
  if (!title || title.trim().length === 0 || title.length > 50) {
    return { success: false, error: 'Please enter a title (max 50 chars).' };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, error: 'Please enter a valid amount greater than 0.' };
  }

  if (!paidBy || !appState.members.some(m => m.id === paidBy)) {
    return { success: false, error: 'Please select a valid member who paid.' };
  }

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return { success: false, error: 'Please select at least one participant.' };
  }

  if (splitType === 'custom') {
    const customValidation = calcModule.calculateCustomSplit(numAmount, customShares);
    if (!customValidation.isValid) {
      return {
        success: false,
        error: `Custom shares sum (₹${customValidation.sum}) must equal total expense amount (₹${numAmount}).`
      };
    }
  }

  const payerObj = appState.members.find(m => m.id === paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';

  const newExpense = {
    id: `expense_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title: title.trim(),
    amount: Math.round(numAmount * 100) / 100,
    category: category || 'Other',
    paidBy,
    splitType: splitType || 'equal',
    participants: [...participants],
    customShares: splitType === 'custom' ? { ...customShares } : {},
    date: date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  appState.expenses.unshift(newExpense); // Newest first

  logActivity(appState, {
    type: 'expense_added',
    category: 'expenses',
    message: `${paidByName} added "${newExpense.title}"`,
    actor: paidByName,
    amount: newExpense.amount,
    relatedEntityId: newExpense.id
  });

  recalculateGroupSettlements(appState);
  storeModule.saveData(appState);

  return { success: true, expense: newExpense };
}

/**
 * Edits an existing expense.
 * @param {Object} appState 
 * @param {string} expenseId 
 * @param {Object} updatedData 
 * @returns {{ success: boolean, error?: string, expense?: Object }}
 */
function editExpense(appState, expenseId, updatedData) {
  const index = appState.expenses.findIndex(e => e.id === expenseId);
  if (index === -1) {
    return { success: false, error: 'Expense not found.' };
  }

  const { title, amount, category, paidBy, splitType, participants, customShares, date } = updatedData;

  // Validations
  if (!title || title.trim().length === 0 || title.length > 50) {
    return { success: false, error: 'Please enter a title (max 50 chars).' };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, error: 'Please enter a valid amount greater than 0.' };
  }

  if (!paidBy || !appState.members.some(m => m.id === paidBy)) {
    return { success: false, error: 'Please select a valid member who paid.' };
  }

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return { success: false, error: 'Please select at least one participant.' };
  }

  if (splitType === 'custom') {
    const customValidation = calcModule.calculateCustomSplit(numAmount, customShares);
    if (!customValidation.isValid) {
      return {
        success: false,
        error: `Custom shares sum (₹${customValidation.sum}) must equal total expense amount (₹${numAmount}).`
      };
    }
  }

  const payerObj = appState.members.find(m => m.id === paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';

  appState.expenses[index] = {
    ...appState.expenses[index],
    title: title.trim(),
    amount: Math.round(numAmount * 100) / 100,
    category: category || 'Other',
    paidBy,
    splitType: splitType || 'equal',
    participants: [...participants],
    customShares: splitType === 'custom' ? { ...customShares } : {},
    date: date || new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString()
  };

  logActivity(appState, {
    type: 'expense_edited',
    category: 'expenses',
    message: `${paidByName} edited "${title.trim()}"`,
    actor: paidByName,
    amount: Math.round(numAmount * 100) / 100,
    relatedEntityId: expenseId
  });

  recalculateGroupSettlements(appState);
  storeModule.saveData(appState);

  return { success: true, expense: appState.expenses[index] };
}

/**
 * Deletes an expense by ID.
 * @param {Object} appState 
 * @param {string} expenseId 
 * @returns {{ success: boolean }}
 */
function deleteExpense(appState, expenseId) {
  const targetExp = appState.expenses.find(e => e.id === expenseId);
  const title = targetExp ? targetExp.title : 'Expense';
  const amt = targetExp ? targetExp.amount : null;

  appState.expenses = appState.expenses.filter(e => e.id !== expenseId);

  logActivity(appState, {
    type: 'expense_deleted',
    category: 'expenses',
    message: `Expense "${title}" was deleted`,
    amount: amt,
    relatedEntityId: expenseId
  });

  recalculateGroupSettlements(appState);
  storeModule.saveData(appState);

  return { success: true };
}

/**
 * Recalculates net balances and settlement transactions for the group state.
 * Preserves payment history for identical settlement pairs if applicable.
 * @param {Object} appState 
 */
function recalculateGroupSettlements(appState) {
  if (!appState.members || appState.members.length === 0) {
    appState.settlements = [];
    return;
  }

  const balancesMap = calcModule.calculateBalances(appState.members, appState.expenses);
  const newSettlements = calcModule.calculateSettlements(balancesMap);

  // Preserve payments history for settlements matching from and to member pair
  const existingPaymentsMap = new Map();
  (appState.settlements || []).forEach(s => {
    const key = `${s.from}_${s.to}`;
    if (Array.isArray(s.payments) && s.payments.length > 0) {
      existingPaymentsMap.set(key, s.payments);
    }
  });

  newSettlements.forEach(s => {
    const key = `${s.from}_${s.to}`;
    if (existingPaymentsMap.has(key)) {
      s.payments = [...existingPaymentsMap.get(key)];
      // Re-evaluates status based on payments vs new total amount due
      const stats = calcModule.getSettlementPaymentStats(s);
      s.status = stats.status;
      s.paidAt = stats.status === 'paid' ? (s.paidAt || new Date().toISOString()) : null;
    } else {
      s.payments = [];
      s.status = 'pending';
      s.paidAt = null;
    }
  });

  appState.settlements = newSettlements;
}

/**
 * Records a new partial payment towards a settlement.
 * 
 * @param {Object} appState 
 * @param {string} settlementId 
 * @param {Object} paymentData - { amount, paymentMethod, note, date }
 * @returns {{ success: boolean, error?: string, settlement?: Object, payment?: Object }}
 */
function addPartialPayment(appState, settlementId, paymentData) {
  const settlement = (appState.settlements || []).find(s => s.id === settlementId);
  if (!settlement) {
    return { success: false, error: 'Settlement record not found.' };
  }

  if (!Array.isArray(settlement.payments)) {
    settlement.payments = [];
  }

  const currentStats = calcModule.getSettlementPaymentStats(settlement);
  const validation = calcModule.validatePartialPayment(paymentData.amount, currentStats.remainingAmount);

  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const memberMap = {};
  appState.members.forEach(m => { memberMap[m.id] = m.name; });
  const fromName = memberMap[settlement.from] || 'Payer';
  const toName = memberMap[settlement.to] || 'Receiver';

  const newPayment = {
    id: `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    amount: validation.amount,
    paymentMethod: paymentData.paymentMethod || 'UPI',
    note: (paymentData.note || '').trim(),
    date: paymentData.date || new Date().toISOString().split('T')[0]
  };

  settlement.payments.push(newPayment);

  const updatedStats = calcModule.getSettlementPaymentStats(settlement);
  settlement.status = updatedStats.status;
  settlement.paidAt = updatedStats.status === 'paid' ? new Date().toISOString() : null;

  logActivity(appState, {
    type: updatedStats.status === 'paid' ? 'settlement_fully_paid' : 'partial_payment_made',
    category: 'payments',
    message: updatedStats.status === 'paid' 
      ? `${fromName} fully settled ₹${validation.amount.toFixed(2)} with ${toName}`
      : `${fromName} made a partial payment of ₹${validation.amount.toFixed(2)} to ${toName}`,
    actor: fromName,
    amount: validation.amount,
    relatedEntityId: settlementId
  });

  storeModule.saveData(appState);
  return { success: true, settlement, payment: newPayment };
}

/**
 * Deletes an individual payment entry from a settlement's history.
 * 
 * @param {Object} appState 
 * @param {string} settlementId 
 * @param {string} paymentId 
 * @returns {{ success: boolean, error?: string }}
 */
function deletePartialPayment(appState, settlementId, paymentId) {
  const settlement = (appState.settlements || []).find(s => s.id === settlementId);
  if (!settlement || !Array.isArray(settlement.payments)) {
    return { success: false, error: 'Settlement or payment history not found.' };
  }

  settlement.payments = settlement.payments.filter(p => p.id !== paymentId);

  const updatedStats = calcModule.getSettlementPaymentStats(settlement);
  settlement.status = updatedStats.status;
  settlement.paidAt = updatedStats.status === 'paid' ? new Date().toISOString() : null;

  storeModule.saveData(appState);
  return { success: true };
}

/**
 * Toggles a settlement's status between pending and paid (records or clears full payments).
 * @param {Object} appState 
 * @param {string} settlementId 
 * @returns {{ success: boolean, settlement?: Object }}
 */
function toggleSettlementStatus(appState, settlementId) {
  const settlement = (appState.settlements || []).find(s => s.id === settlementId);
  if (!settlement) {
    return { success: false };
  }

  const memberMap = {};
  appState.members.forEach(m => { memberMap[m.id] = m.name; });
  const fromName = memberMap[settlement.from] || 'Payer';
  const toName = memberMap[settlement.to] || 'Receiver';

  const currentStats = calcModule.getSettlementPaymentStats(settlement);

  if (currentStats.status === 'paid' || currentStats.status === 'partially_paid') {
    // Clear payments and reset to pending
    settlement.payments = [];
    settlement.status = 'pending';
    settlement.paidAt = null;
  } else {
    // Mark as fully paid by creating a single full payment
    settlement.payments = [{
      id: `pay_${Date.now()}_1`,
      amount: settlement.amount,
      paymentMethod: 'Other',
      note: 'Full settlement payment',
      date: new Date().toISOString().split('T')[0]
    }];
    settlement.status = 'paid';
    settlement.paidAt = new Date().toISOString();

    logActivity(appState, {
      type: 'settlement_fully_paid',
      category: 'payments',
      message: `${fromName} fully settled ₹${settlement.amount.toFixed(2)} with ${toName}`,
      actor: fromName,
      amount: settlement.amount,
      relatedEntityId: settlementId
    });
  }

  storeModule.saveData(appState);
  return { success: true, settlement };
}

/**
 * Sets or updates the current group's budget spending limit.
 * 
 * @param {Object} appState 
 * @param {number|string} budgetAmount 
 * @returns {{ success: boolean, error?: string, budget?: number }}
 */
function setGroupBudget(appState, budgetAmount) {
  if (!appState.group) {
    return { success: false, error: 'No active group found.' };
  }

  const isEdit = typeof appState.group.budget === 'number' && appState.group.budget > 0;
  const validation = calcModule.validateBudgetAmount(budgetAmount);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  appState.group.budget = validation.amount;

  logActivity(appState, {
    type: isEdit ? 'budget_updated' : 'budget_created',
    category: 'budget',
    message: isEdit ? `Group budget updated to ₹${validation.amount.toFixed(2)}` : `Group budget set to ₹${validation.amount.toFixed(2)}`,
    amount: validation.amount
  });

  storeModule.saveData(appState);
  return { success: true, budget: validation.amount };
}

/**
 * Removes/disables the budget limit for the current group.
 * 
 * @param {Object} appState 
 * @returns {{ success: boolean }}
 */
function removeGroupBudget(appState) {
  if (appState.group) {
    appState.group.budget = null;

    logActivity(appState, {
      type: 'budget_removed',
      category: 'budget',
      message: `Group budget was removed`
    });

    storeModule.saveData(appState);
  }
  return { success: true };
}

/**
 * Adds a new recurring expense template.
 * 
 * @param {Object} appState 
 * @param {Object} recurringData 
 * @returns {{ success: boolean, error?: string, recurring?: Object }}
 */
function addRecurringExpense(appState, recurringData) {
  if (!Array.isArray(appState.recurringExpenses)) {
    appState.recurringExpenses = [];
  }

  const { title, amount, paidBy, participants, splitType, customShares, category, frequency, startDate, nextDueDate, status } = recurringData;

  if (!title || title.trim().length === 0 || title.length > 50) {
    return { success: false, error: 'Please enter a title (max 50 chars).' };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, error: 'Please enter a valid amount greater than 0.' };
  }

  if (!paidBy || !appState.members.some(m => m.id === paidBy)) {
    return { success: false, error: 'Please select a valid member who paid.' };
  }

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return { success: false, error: 'Please select at least one participant.' };
  }

  if (splitType === 'custom') {
    const customValidation = calcModule.calculateCustomSplit(numAmount, customShares);
    if (!customValidation.isValid) {
      return {
        success: false,
        error: `Custom shares sum (₹${customValidation.sum}) must equal total expense amount (₹${numAmount}).`
      };
    }
  }

  const payerObj = appState.members.find(m => m.id === paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';
  const validFreq = ['weekly', 'monthly', 'yearly'].includes(frequency) ? frequency : 'monthly';
  const start = startDate || new Date().toISOString().split('T')[0];
  const due = nextDueDate || start;

  const newRecurring = {
    id: `recurring_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title: title.trim(),
    amount: Math.round(numAmount * 100) / 100,
    paidBy,
    participants: [...participants],
    splitType: splitType || 'equal',
    customShares: splitType === 'custom' ? { ...customShares } : {},
    category: category || 'Other',
    frequency: validFreq,
    startDate: start,
    nextDueDate: due,
    status: status === 'paused' ? 'paused' : 'active',
    lastGeneratedDate: null,
    createdAt: new Date().toISOString()
  };

  appState.recurringExpenses.unshift(newRecurring);

  const freqLabelMap = { weekly: 'week', monthly: 'month', yearly: 'year' };
  logActivity(appState, {
    type: 'recurring_added',
    category: 'expenses',
    message: `${paidByName} added recurring expense ${newRecurring.title} — ₹${newRecurring.amount.toFixed(2)}/${freqLabelMap[validFreq] || validFreq}`,
    actor: paidByName,
    amount: newRecurring.amount,
    relatedEntityId: newRecurring.id
  });

  storeModule.saveData(appState);
  return { success: true, recurring: newRecurring };
}

/**
 * Edits an existing recurring expense template.
 * 
 * @param {Object} appState 
 * @param {string} recurringId 
 * @param {Object} updatedData 
 * @returns {{ success: boolean, error?: string, recurring?: Object }}
 */
function editRecurringExpense(appState, recurringId, updatedData) {
  if (!Array.isArray(appState.recurringExpenses)) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  const index = appState.recurringExpenses.findIndex(r => r.id === recurringId);
  if (index === -1) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  const { title, amount, paidBy, participants, splitType, customShares, category, frequency, startDate, nextDueDate, status } = updatedData;

  if (!title || title.trim().length === 0 || title.length > 50) {
    return { success: false, error: 'Please enter a title (max 50 chars).' };
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, error: 'Please enter a valid amount greater than 0.' };
  }

  if (!paidBy || !appState.members.some(m => m.id === paidBy)) {
    return { success: false, error: 'Please select a valid member who paid.' };
  }

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    return { success: false, error: 'Please select at least one participant.' };
  }

  if (splitType === 'custom') {
    const customValidation = calcModule.calculateCustomSplit(numAmount, customShares);
    if (!customValidation.isValid) {
      return {
        success: false,
        error: `Custom shares sum (₹${customValidation.sum}) must equal total expense amount (₹${numAmount}).`
      };
    }
  }

  const payerObj = appState.members.find(m => m.id === paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';
  const validFreq = ['weekly', 'monthly', 'yearly'].includes(frequency) ? frequency : appState.recurringExpenses[index].frequency;

  const existing = appState.recurringExpenses[index];

  appState.recurringExpenses[index] = {
    ...existing,
    title: title.trim(),
    amount: Math.round(numAmount * 100) / 100,
    paidBy,
    participants: [...participants],
    splitType: splitType || 'equal',
    customShares: splitType === 'custom' ? { ...customShares } : {},
    category: category || 'Other',
    frequency: validFreq,
    startDate: startDate || existing.startDate,
    nextDueDate: nextDueDate || existing.nextDueDate,
    status: status ? (status === 'paused' ? 'paused' : 'active') : existing.status
  };

  logActivity(appState, {
    type: 'recurring_edited',
    category: 'expenses',
    message: `${paidByName} edited recurring expense ${title.trim()}`,
    actor: paidByName,
    amount: Math.round(numAmount * 100) / 100,
    relatedEntityId: recurringId
  });

  storeModule.saveData(appState);
  return { success: true, recurring: appState.recurringExpenses[index] };
}

/**
 * Toggles status of recurring expense between active and paused.
 * 
 * @param {Object} appState 
 * @param {string} recurringId 
 * @returns {{ success: boolean, error?: string, recurring?: Object }}
 */
function togglePauseRecurringExpense(appState, recurringId) {
  if (!Array.isArray(appState.recurringExpenses)) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  const target = appState.recurringExpenses.find(r => r.id === recurringId);
  if (!target) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  const payerObj = appState.members.find(m => m.id === target.paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';

  if (target.status === 'paused') {
    target.status = 'active';
    logActivity(appState, {
      type: 'recurring_resumed',
      category: 'expenses',
      message: `${paidByName} resumed recurring expense ${target.title}`,
      actor: paidByName,
      relatedEntityId: recurringId
    });
  } else {
    target.status = 'paused';
    logActivity(appState, {
      type: 'recurring_paused',
      category: 'expenses',
      message: `${paidByName} paused recurring expense ${target.title}`,
      actor: paidByName,
      relatedEntityId: recurringId
    });
  }

  storeModule.saveData(appState);
  return { success: true, recurring: target };
}

/**
 * Deletes a recurring expense template.
 * 
 * @param {Object} appState 
 * @param {string} recurringId 
 * @returns {{ success: boolean }}
 */
function deleteRecurringExpense(appState, recurringId) {
  if (!Array.isArray(appState.recurringExpenses)) {
    return { success: true };
  }

  const target = appState.recurringExpenses.find(r => r.id === recurringId);
  const title = target ? target.title : 'Recurring Expense';
  const payerObj = target ? appState.members.find(m => m.id === target.paidBy) : null;
  const paidByName = payerObj ? payerObj.name : 'Someone';

  appState.recurringExpenses = appState.recurringExpenses.filter(r => r.id !== recurringId);

  logActivity(appState, {
    type: 'recurring_deleted',
    category: 'expenses',
    message: `${paidByName} deleted recurring expense ${title}`,
    actor: paidByName,
    relatedEntityId: recurringId
  });

  storeModule.saveData(appState);
  return { success: true };
}

/**
 * Converts a recurring expense occurrence into a real expense.
 * Enforces duplicate protection so the same due date occurrence cannot be converted twice.
 * 
 * @param {Object} appState 
 * @param {string} recurringId 
 * @returns {{ success: boolean, error?: string, expense?: Object, recurring?: Object }}
 */
function convertRecurringToExpense(appState, recurringId) {
  if (!Array.isArray(appState.recurringExpenses)) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  const item = appState.recurringExpenses.find(r => r.id === recurringId);
  if (!item) {
    return { success: false, error: 'Recurring expense not found.' };
  }

  // Duplicate Protection: Do not allow the same occurrence date to be added twice
  if (item.lastGeneratedDate === item.nextDueDate) {
    return { success: false, error: `The occurrence for ${item.nextDueDate} has already been added as an actual expense.` };
  }

  const currentDueDate = item.nextDueDate;

  // Add actual expense using existing addExpense logic
  const expRes = addExpense(appState, {
    title: item.title,
    amount: item.amount,
    category: item.category || 'Other',
    paidBy: item.paidBy,
    splitType: item.splitType,
    participants: item.participants,
    customShares: item.customShares,
    date: currentDueDate
  });

  if (!expRes.success) {
    return expRes;
  }

  // Update recurring expense tracking and advance due date
  item.lastGeneratedDate = currentDueDate;
  item.nextDueDate = calcModule.calculateNextDueDate(currentDueDate, item.frequency);

  const payerObj = appState.members.find(m => m.id === item.paidBy);
  const paidByName = payerObj ? payerObj.name : 'Someone';

  logActivity(appState, {
    type: 'recurring_converted',
    category: 'expenses',
    message: `${paidByName} added ${item.title} — ₹${item.amount.toFixed(2)}`,
    actor: paidByName,
    amount: item.amount,
    relatedEntityId: expRes.expense.id
  });

  storeModule.saveData(appState);
  return { success: true, expense: expRes.expense, recurring: item };
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    logActivity,
    clearActivityHistory,
    createGroup,
    addMember,
    isMemberDeletable,
    removeMember,
    addExpense,
    editExpense,
    deleteExpense,
    recalculateGroupSettlements,
    addPartialPayment,
    deletePartialPayment,
    toggleSettlementStatus,
    setGroupBudget,
    removeGroupBudget,
    addRecurringExpense,
    editRecurringExpense,
    togglePauseRecurringExpense,
    deleteRecurringExpense,
    convertRecurringToExpense
  };
}
