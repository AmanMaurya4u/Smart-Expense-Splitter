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

/**
 * Calculates total spending sum across all actual expenses.
 * 
 * @param {Array<Object>} expenses 
 * @returns {number}
 */
function calculateTotalSpending(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return 0;
  const totalCents = expenses.reduce((acc, exp) => {
    return acc + Math.round((parseFloat(exp.amount) || 0) * 100);
  }, 0);
  return totalCents / 100;
}

/**
 * Calculates average expense amount.
 * 
 * @param {Array<Object>} expenses 
 * @returns {number}
 */
function calculateAverageExpense(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return 0;
  const total = calculateTotalSpending(expenses);
  return Math.round((total / expenses.length) * 100) / 100;
}

/**
 * Finds the highest recorded expense item.
 * 
 * @param {Array<Object>} expenses 
 * @returns {Object|null}
 */
function findHighestExpense(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return null;
  let highest = expenses[0];
  let maxAmt = parseFloat(highest.amount) || 0;
  for (let i = 1; i < expenses.length; i++) {
    const amt = parseFloat(expenses[i].amount) || 0;
    if (amt > maxAmt) {
      maxAmt = amt;
      highest = expenses[i];
    }
  }
  return highest;
}

/**
 * Finds the lowest recorded expense item.
 * 
 * @param {Array<Object>} expenses 
 * @returns {Object|null}
 */
function findLowestExpense(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return null;
  let lowest = expenses[0];
  let minAmt = parseFloat(lowest.amount) || 0;
  for (let i = 1; i < expenses.length; i++) {
    const amt = parseFloat(expenses[i].amount) || 0;
    if (amt < minAmt) {
      minAmt = amt;
      lowest = expenses[i];
    }
  }
  return lowest;
}

/**
 * Calculates breakdown of spending by category.
 * 
 * @param {Array<Object>} expenses 
 * @returns {{ categories: Array<{category: string, totalAmount: number, count: number, percentage: number}>, highestCategory: Object|null, lowestCategory: Object|null }}
 */
function calculateCategorySpending(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    return { categories: [], highestCategory: null, lowestCategory: null };
  }

  const categoryTotals = {};
  const categoryCounts = {};
  let totalSpendCents = 0;

  expenses.forEach(e => {
    const cat = e.category || 'Other';
    const cents = Math.round((parseFloat(e.amount) || 0) * 100);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + cents;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    totalSpendCents += cents;
  });

  const categories = Object.keys(categoryTotals).map(cat => {
    const totalAmount = categoryTotals[cat] / 100;
    const count = categoryCounts[cat];
    const percentage = totalSpendCents > 0 ? Math.round((categoryTotals[cat] / totalSpendCents) * 1000) / 10 : 0;
    return {
      category: cat,
      totalAmount,
      count,
      percentage
    };
  });

  categories.sort((a, b) => b.totalAmount - a.totalAmount);

  const highestCategory = categories.length > 0 ? categories[0] : null;
  const lowestCategory = categories.length > 0 ? categories[categories.length - 1] : null;

  return {
    categories,
    highestCategory,
    lowestCategory
  };
}

/**
 * Calculates total paid contributions per member.
 * 
 * @param {Array<Object>} members 
 * @param {Array<Object>} expenses 
 * @returns {{ memberPayments: Array<{memberId: string, name: string, totalPaid: number, count: number}>, highestPayer: Object|null, lowestPayer: Object|null }}
 */
function calculateMemberSpending(members, expenses) {
  if (!Array.isArray(members) || members.length === 0) {
    return { memberPayments: [], highestPayer: null, lowestPayer: null };
  }

  const memberMap = {};
  members.forEach(m => {
    memberMap[m.id] = {
      memberId: m.id,
      name: m.name,
      totalPaid: 0,
      count: 0
    };
  });

  (expenses || []).forEach(e => {
    const paidById = e.paidBy;
    const cents = Math.round((parseFloat(e.amount) || 0) * 100);
    if (memberMap[paidById]) {
      memberMap[paidById].totalPaid += cents / 100;
      memberMap[paidById].count += 1;
    }
  });

  const memberPayments = Object.values(memberMap);
  memberPayments.sort((a, b) => b.totalPaid - a.totalPaid);

  let highestPayer = null;
  let lowestPayer = null;

  const paidMembers = memberPayments.filter(m => m.totalPaid > 0);
  if (paidMembers.length > 0) {
    highestPayer = paidMembers[0];
    lowestPayer = paidMembers[paidMembers.length - 1];
  } else if (memberPayments.length > 0) {
    highestPayer = memberPayments[0];
    lowestPayer = memberPayments[memberPayments.length - 1];
  }

  return {
    memberPayments,
    highestPayer,
    lowestPayer
  };
}

/**
 * Calculates time-based spending totals (today, this week, this month, previous month).
 * 
 * @param {Array<Object>} expenses 
 * @param {string} [referenceDateStr] - Reference ISO date YYYY-MM-DD
 * @returns {{ today: number, thisWeek: number, thisMonth: number, previousMonth: number }}
 */
function calculatePeriodSpending(expenses, referenceDateStr) {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    return { today: 0, thisWeek: 0, thisMonth: 0, previousMonth: 0 };
  }

  const refStr = referenceDateStr || new Date().toISOString().split('T')[0];
  const parts = refStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return { today: 0, thisWeek: 0, thisMonth: 0, previousMonth: 0 };
  }

  const [refY, refM, refD] = parts;
  const todayStr = refStr;
  const currentMonthPrefix = `${refY}-${String(refM).padStart(2, '0')}`;

  let prevY = refY;
  let prevM = refM - 1;
  if (prevM < 1) {
    prevY -= 1;
    prevM = 12;
  }
  const prevMonthPrefix = `${prevY}-${String(prevM).padStart(2, '0')}`;

  // Week bounds (Monday to Sunday)
  const refDate = new Date(refY, refM - 1, refD);
  const dayOfWeek = refDate.getDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeekDate = new Date(refY, refM - 1, refD - distanceToMonday);
  const endOfWeekDate = new Date(startOfWeekDate);
  endOfWeekDate.setDate(endOfWeekDate.getDate() + 6);

  const startOfWeekStr = `${startOfWeekDate.getFullYear()}-${String(startOfWeekDate.getMonth() + 1).padStart(2, '0')}-${String(startOfWeekDate.getDate()).padStart(2, '0')}`;
  const endOfWeekStr = `${endOfWeekDate.getFullYear()}-${String(endOfWeekDate.getMonth() + 1).padStart(2, '0')}-${String(endOfWeekDate.getDate()).padStart(2, '0')}`;

  let todayCents = 0;
  let thisWeekCents = 0;
  let thisMonthCents = 0;
  let previousMonthCents = 0;

  expenses.forEach(e => {
    const expDateStr = e.date || '';
    const cents = Math.round((parseFloat(e.amount) || 0) * 100);

    if (expDateStr === todayStr) {
      todayCents += cents;
    }

    if (expDateStr >= startOfWeekStr && expDateStr <= endOfWeekStr) {
      thisWeekCents += cents;
    }

    if (expDateStr.startsWith(currentMonthPrefix)) {
      thisMonthCents += cents;
    }

    if (expDateStr.startsWith(prevMonthPrefix)) {
      previousMonthCents += cents;
    }
  });

  return {
    today: todayCents / 100,
    thisWeek: thisWeekCents / 100,
    thisMonth: thisMonthCents / 100,
    previousMonth: previousMonthCents / 100
  };
}

/**
 * Calculates Month-over-Month spending comparison percentage and message.
 * 
 * @param {Array<Object>} expenses 
 * @param {string} [referenceDateStr] 
 * @returns {{ currentMonthSpent: number, previousMonthSpent: number, percentageChange: number, direction: 'increase'|'decrease'|'equal'|'no_history', hasHistoricalData: boolean, formattedMessage: string }}
 */
function calculateSpendingChange(expenses, referenceDateStr) {
  const period = calculatePeriodSpending(expenses, referenceDateStr);
  const current = period.thisMonth;
  const previous = period.previousMonth;

  if (previous <= 0) {
    return {
      currentMonthSpent: current,
      previousMonthSpent: previous,
      percentageChange: 0,
      direction: 'no_history',
      hasHistoricalData: false,
      formattedMessage: 'No spending recorded in previous month for comparison.'
    };
  }

  const diff = current - previous;
  const percentageChange = Math.round(((diff) / previous) * 1000) / 10;

  let direction = 'equal';
  let formattedMessage = `Spending remained equal compared with last month.`;

  if (percentageChange > 0) {
    direction = 'increase';
    formattedMessage = `Spending increased by ${percentageChange}% compared with last month.`;
  } else if (percentageChange < 0) {
    direction = 'decrease';
    formattedMessage = `Spending decreased by ${Math.abs(percentageChange)}% compared with last month.`;
  }

  return {
    currentMonthSpent: current,
    previousMonthSpent: previous,
    percentageChange,
    direction,
    hasHistoricalData: true,
    formattedMessage
  };
}

/**
 * Generates rule-based smart insights array from current state.
 * 
 * @param {Object} appState 
 * @param {string} [referenceDateStr] 
 * @returns {Array<string>}
 */
function generateSmartInsights(appState, referenceDateStr) {
  const expenses = appState.expenses || [];
  if (expenses.length === 0) {
    return [];
  }

  const insights = [];

  const total = calculateTotalSpending(expenses);
  const avg = calculateAverageExpense(expenses);
  const count = expenses.length;
  const highestExp = findHighestExpense(expenses);
  const categoryData = calculateCategorySpending(expenses);
  const memberData = calculateMemberSpending(appState.members || [], expenses);
  const momData = calculateSpendingChange(expenses, referenceDateStr);

  // 1. Highest category insight
  if (categoryData.highestCategory) {
    insights.push(`${categoryData.highestCategory.category} is your highest spending category (${categoryData.highestCategory.percentage}% of total spend).`);
  }

  // 2. Highest payer insight
  if (memberData.highestPayer && memberData.highestPayer.totalPaid > 0) {
    insights.push(`${memberData.highestPayer.name} paid the most overall (₹${memberData.highestPayer.totalPaid.toFixed(2)}).`);
  }

  // 3. Month-over-Month comparison insight
  if (momData.hasHistoricalData) {
    if (momData.direction === 'increase') {
      insights.push(`Your group spent ${momData.percentageChange}% more this month than last month.`);
    } else if (momData.direction === 'decrease') {
      insights.push(`Your group spent ${Math.abs(momData.percentageChange)}% less this month than last month.`);
    } else {
      insights.push(`Your group spending this month is equal to last month.`);
    }
  }

  // 4. Largest expense insight
  if (highestExp) {
    insights.push(`Your largest expense is "${highestExp.title}" at ₹${parseFloat(highestExp.amount).toFixed(2)}.`);
  }

  // 5. Total count & average insight
  insights.push(`You have recorded ${count} expense${count > 1 ? 's' : ''} with an average expense of ₹${avg.toFixed(2)}.`);

  // 6. Group Budget insight if configured
  if (appState.group && typeof appState.group.budget === 'number' && appState.group.budget > 0) {
    const budgetStats = getBudgetStats(appState.group, expenses);
    if (budgetStats.isExceeded) {
      insights.push(`Your group has exceeded the budget by ₹${budgetStats.exceededAmount.toFixed(2)}.`);
    } else {
      insights.push(`You have used ${budgetStats.percentage}% of your group budget (₹${budgetStats.totalSpent.toFixed(2)} of ₹${budgetStats.totalBudget.toFixed(2)}).`);
    }
  }

  return insights;
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
    getRecurringDueStatus,
    calculateTotalSpending,
    calculateAverageExpense,
    findHighestExpense,
    findLowestExpense,
    calculateCategorySpending,
    calculateMemberSpending,
    calculatePeriodSpending,
    calculateSpendingChange,
    generateSmartInsights
  };
}
