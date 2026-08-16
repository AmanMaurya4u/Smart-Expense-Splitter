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

// Universal module export support (Node.js & Browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CURRENCY_SYMBOL,
    calculateEqualSplit,
    calculateCustomSplit,
    calculateBalances,
    calculateSettlements
  };
}
