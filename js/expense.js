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
    currentUserId: null,
    createdAt: new Date().toISOString()
  };

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

  appState.members = appState.members.filter(m => m.id !== memberId);

  // Re-assign current user reference if deleted
  if (appState.group && appState.group.currentUserId === memberId) {
    appState.group.currentUserId = appState.members.length > 0 ? appState.members[0].id : null;
  }

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
  appState.expenses = appState.expenses.filter(e => e.id !== expenseId);

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
  }

  storeModule.saveData(appState);
  return { success: true, settlement };
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    toggleSettlementStatus
  };
}
