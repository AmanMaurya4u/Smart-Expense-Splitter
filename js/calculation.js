/**
 * Smart Expense Splitter - Pure Calculation Logic Module
 * Works in both Browser and Node.js environments.
 */

const CURRENCY_SYMBOL = '₹';

/**
 * Calculates equal splits with paisa-safe rounding.
 * Any remainder paise are allocated to the first N participants array-wise.
 * 
 * @param {number} amount - Total expense amount
 * @param {string[]} participantIds - Array of participant member IDs
 * @returns {Record<string, number>} Object mapping memberId -> share amount
 */
function calculateEqualSplit(amount, participantIds) {
  if (!participantIds || participantIds.length === 0 || amount <= 0) {
    return {};
  }

  const count = participantIds.length;
  const totalCents = Math.round(amount * 100);
  const baseCentsPerPerson = Math.floor(totalCents / count);
  let remainderCents = totalCents - (baseCentsPerPerson * count);

  const shares = {};
  participantIds.forEach((id, index) => {
    let personCents = baseCentsPerPerson;
    if (remainderCents > 0) {
      personCents += 1;
      remainderCents -= 1;
    }
    shares[id] = personCents / 100;
  });

  return shares;
}

/**
 * Validates and calculates custom split allocations.
 * 
 * @param {number} amount - Total expense amount
 * @param {Record<string, number>} customSharesMap - Object mapping memberId -> allocated share
 * @returns {{ isValid: boolean, sum: number, remaining: number }}
 */
function calculateCustomSplit(amount, customSharesMap) {
  if (!customSharesMap) {
    return { isValid: false, sum: 0, remaining: amount };
  }

  const sumCents = Object.values(customSharesMap).reduce((acc, val) => {
    const num = parseFloat(val) || 0;
    return acc + Math.round(num * 100);
  }, 0);

  const targetCents = Math.round(amount * 100);
  const diffCents = targetCents - sumCents;

  const sum = sumCents / 100;
  const remaining = diffCents / 100;
  const isValid = Math.abs(diffCents) <= 1; // 1 paisa tolerance for float representation

  return {
    isValid,
    sum,
    remaining
  };
}

/**
 * Computes net balances for all members based on expenses.
 * Paid(m) = sum of expense amounts where paidBy == m
 * Share(m) = sum of member's share across all expenses where m is a participant
 * Balance(m) = Paid(m) - Share(m)
 * 
 * @param {Array<{id: string, name: string}>} members 
 * @param {Array<Object>} expenses 
 * @returns {Record<string, { memberId: string, name: string, paid: number, share: number, balance: number }>}
 */
function calculateBalances(members, expenses) {
  const balances = {};

  // Initialize members map
  members.forEach(member => {
    balances[member.id] = {
      memberId: member.id,
      name: member.name,
      paid: 0,
      share: 0,
      balance: 0
    };
  });

  // Accumulate paid and share for each expense
  expenses.forEach(expense => {
    const expenseAmount = parseFloat(expense.amount) || 0;
    const paidById = expense.paidBy;

    // Accumulate paid
    if (balances[paidById]) {
      balances[paidById].paid += expenseAmount;
    }

    // Determine shares
    let shares = {};
    if (expense.splitType === 'equal') {
      shares = calculateEqualSplit(expenseAmount, expense.participants || []);
    } else if (expense.splitType === 'custom') {
      shares = expense.customShares || {};
    }

    // Accumulate shares
    Object.keys(shares).forEach(memberId => {
      if (balances[memberId]) {
        balances[memberId].share += (parseFloat(shares[memberId]) || 0);
      }
    });
  });

  // Calculate final net balance with 2-decimal precision
  Object.keys(balances).forEach(id => {
    const m = balances[id];
    m.paid = Math.round(m.paid * 100) / 100;
    m.share = Math.round(m.share * 100) / 100;
    m.balance = Math.round((m.paid - m.share) * 100) / 100;
  });

  return balances;
}

/**
 * Greedy debt-simplification algorithm to calculate minimal settlement transactions.
 * Matches largest creditor with largest debtor.
 * 
 * @param {Record<string, { memberId: string, name: string, balance: number }>} balancesMap 
 * @returns {Array<{ id: string, from: string, to: string, amount: number, status: string, paidAt: string|null }>}
 */
function calculateSettlements(balancesMap) {
  const creditors = [];
  const debtors = [];

  Object.values(balancesMap).forEach(m => {
    const balCents = Math.round(m.balance * 100);
    if (balCents > 0) {
      creditors.push({ id: m.memberId, name: m.name, balanceCents: balCents });
    } else if (balCents < 0) {
      debtors.push({ id: m.memberId, name: m.name, balanceCents: balCents }); // negative value
    }
  });

  // Sort creditors descending by balance (largest first)
  creditors.sort((a, b) => b.balanceCents - a.balanceCents);
  // Sort debtors ascending by balance (most negative first)
  debtors.sort((a, b) => a.balanceCents - b.balanceCents);

  const settlements = [];
  let index = 1;

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0];
    const debtor = debtors[0];

    const settleCents = Math.min(creditor.balanceCents, -debtor.balanceCents);

    settlements.push({
      id: `settlement_${Date.now()}_${index++}`,
      from: debtor.id,
      to: creditor.id,
      amount: settleCents / 100,
      status: 'pending',
      paidAt: null
    });

    creditor.balanceCents -= settleCents;
    debtor.balanceCents += settleCents;

    if (creditor.balanceCents === 0) {
      creditors.shift();
    }
    if (debtor.balanceCents === 0) {
      debtors.shift();
    }
  }

  return settlements;
}

/**
 * Calculates payment stats for a settlement.
 * 
 * @param {Object} settlement - Settlement object with amount and optional payments array
 * @returns {{ totalDue: number, totalPaid: number, remainingAmount: number, status: string, payments: Array }}
 */
function getSettlementPaymentStats(settlement) {
  if (!settlement) {
    return { totalDue: 0, totalPaid: 0, remainingAmount: 0, status: 'pending', payments: [] };
  }

  const totalDue = Math.round((parseFloat(settlement.amount) || 0) * 100) / 100;
  const payments = Array.isArray(settlement.payments) ? settlement.payments : [];

  const totalPaidCents = payments.reduce((acc, p) => {
    return acc + Math.round((parseFloat(p.amount) || 0) * 100);
  }, 0);

  const totalPaid = totalPaidCents / 100;
  const remainingCents = Math.max(0, Math.round(totalDue * 100) - totalPaidCents);
  const remainingAmount = remainingCents / 100;

  let status = 'pending';
  if (remainingCents === 0 || totalPaid >= totalDue) {
    status = 'paid';
  } else if (totalPaidCents > 0) {
    status = 'partially_paid';
  }

  return {
    totalDue,
    totalPaid,
    remainingAmount,
    status,
    payments
  };
}

/**
 * Validates a partial payment amount against remaining balance.
 * 
 * @param {number|string} amount - Proposed payment amount
 * @param {number} remainingAmount - Outstanding remaining amount on settlement
 * @returns {{ isValid: boolean, error?: string, amount?: number }}
 */
function validatePartialPayment(amount, remainingAmount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    return { isValid: false, error: 'Payment amount must be greater than ₹0.' };
  }

  const numCents = Math.round(num * 100);
  const remCents = Math.round((parseFloat(remainingAmount) || 0) * 100);

  if (numCents > remCents) {
    const formattedRem = (remCents / 100).toFixed(2);
    return {
      isValid: false,
      error: `Payment amount cannot be greater than remaining amount (₹${formattedRem}).`
    };
  }

  return {
    isValid: true,
    amount: numCents / 100
  };
}

/**
 * Calculates budget overview statistics for the current group.
 * 
 * @param {Object} group - Group object with optional budget property
 * @param {Array<Object>} expenses - Array of group expense records
 * @returns {{ hasBudget: boolean, totalBudget: number, totalSpent: number, remaining: number, percentage: number, isWarning: boolean, isExceeded: boolean, exceededAmount: number }}
 */
function getBudgetStats(group, expenses) {
  const totalSpentCents = (expenses || []).reduce((acc, exp) => {
    return acc + Math.round((parseFloat(exp.amount) || 0) * 100);
  }, 0);

  const totalSpent = totalSpentCents / 100;

  if (!group || typeof group.budget !== 'number' || group.budget <= 0) {
    return {
      hasBudget: false,
      totalBudget: 0,
      totalSpent,
      remaining: 0,
      percentage: 0,
      isWarning: false,
      isExceeded: false,
      exceededAmount: 0
    };
  }

  const totalBudgetCents = Math.round(group.budget * 100);
  const totalBudget = totalBudgetCents / 100;
  const remainingCents = Math.max(0, totalBudgetCents - totalSpentCents);
  const remaining = remainingCents / 100;

  const percentage = totalBudgetCents > 0 ? Math.round((totalSpentCents / totalBudgetCents) * 1000) / 10 : 0;
  const isExceeded = totalSpentCents > totalBudgetCents;
  const isWarning = percentage >= 80 && !isExceeded;
  const exceededAmount = isExceeded ? (totalSpentCents - totalBudgetCents) / 100 : 0;

  return {
    hasBudget: true,
    totalBudget,
    totalSpent,
    remaining,
    percentage,
    isWarning,
    isExceeded,
    exceededAmount
  };
}

/**
 * Validates group budget input amount.
 * 
 * @param {number|string} amount 
 * @returns {{ isValid: boolean, error?: string, amount?: number }}
 */
function validateBudgetAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    return { isValid: false, error: 'Budget amount must be greater than ₹0.' };
  }

  return {
    isValid: true,
    amount: Math.round(num * 100) / 100
  };
}

/**
 * Advances a date string (YYYY-MM-DD) by one period according to frequency.
 * 
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @param {string} frequency - 'weekly' | 'monthly' | 'yearly'
 * @returns {string} Next due date string YYYY-MM-DD
 */
function calculateNextDueDate(dateStr, frequency) {
  if (!dateStr || typeof dateStr !== 'string') {
    dateStr = new Date().toISOString().split('T')[0];
  }

  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return dateStr;
  }

  const [y, m, d] = parts;

  if (frequency === 'weekly') {
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 7);
    const resY = date.getFullYear();
    const resM = String(date.getMonth() + 1).padStart(2, '0');
    const resD = String(date.getDate()).padStart(2, '0');
    return `${resY}-${resM}-${resD}`;
  }

  if (frequency === 'yearly') {
    let targetYear = y + 1;
    let targetMonth = m;
    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(d, maxDays);
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
  }

  // Default 'monthly'
  let targetYear = y;
  let targetMonth = m + 1;
  if (targetMonth > 12) {
    targetYear += 1;
    targetMonth = 1;
  }
  const maxDays = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(d, maxDays);
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/**
 * Calculates due status info for a recurring expense relative to reference date.
 * 
 * @param {string} nextDueDateStr - Date string YYYY-MM-DD
 * @param {string} status - 'active' | 'paused'
 * @param {string} [refDateStr] - Optional reference date string YYYY-MM-DD (defaults to today)
 * @returns {{ code: 'PAUSED'|'OVERDUE'|'DUE_TODAY'|'UPCOMING', label: string, diffDays: number, isDue: boolean }}
 */
function getRecurringDueStatus(nextDueDateStr, status, refDateStr) {
  if (status === 'paused') {
    return {
      code: 'PAUSED',
      label: 'Paused',
      diffDays: 0,
      isDue: false
    };
  }

  const todayStr = refDateStr || new Date().toISOString().split('T')[0];
  const [refY, refM, refD] = todayStr.split('-').map(Number);
  const [dueY, dueM, dueD] = (nextDueDateStr || todayStr).split('-').map(Number);

  const refTime = Date.UTC(refY, refM - 1, refD);
  const dueTime = Date.UTC(dueY, dueM - 1, dueD);
  const diffDays = Math.round((dueTime - refTime) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      code: 'OVERDUE',
      label: absDays === 1 ? 'Overdue by 1 day' : `Overdue by ${absDays} days`,
      diffDays,
      isDue: true
    };
  }

  if (diffDays === 0) {
    return {
      code: 'DUE_TODAY',
      label: 'Due Today',
      diffDays,
      isDue: true
    };
  }

  return {
    code: 'UPCOMING',
    label: diffDays === 1 ? 'Due in 1 day' : `Due in ${diffDays} days`,
    diffDays,
    isDue: false
  };
}

// Universal module export support (Node.js & Browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CURRENCY_SYMBOL,
    calculateEqualSplit,
    calculateCustomSplit,
    calculateBalances,
    calculateSettlements,
    getSettlementPaymentStats,
    validatePartialPayment,
    getBudgetStats,
    validateBudgetAmount,
    calculateNextDueDate,
    getRecurringDueStatus
  };
}
