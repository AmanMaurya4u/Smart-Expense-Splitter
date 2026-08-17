/**
 * Smart Expense Splitter — Unit Test Suite for Smart Expense Insights & Spending Analytics
 * Run using: node tests/insights.test.js
 */

const {
  calculateTotalSpending,
  calculateAverageExpense,
  findHighestExpense,
  findLowestExpense,
  calculateCategorySpending,
  calculateMemberSpending,
  calculatePeriodSpending,
  calculateSpendingChange,
  generateSmartInsights
} = require('../js/calculation.js');

const {
  addExpense,
  editExpense,
  deleteExpense,
  addRecurringExpense,
  convertRecurringToExpense,
  addPartialPayment
} = require('../js/expense.js');

const { migrateData } = require('../js/storage.js');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
    failCount++;
  }
}

console.log('\n--- Running Smart Expense Splitter Insights & Analytics Tests ---\n');

function createMockState() {
  return {
    version: 1,
    theme: 'light',
    group: { id: 'g1', name: 'Analytics Test Group', budget: 20000 },
    members: [
      { id: 'm1', name: 'Aman' },
      { id: 'm2', name: 'Rahul' },
      { id: 'm3', name: 'Rohit' }
    ],
    expenses: [],
    settlements: [],
    activities: [],
    recurringExpenses: []
  };
}

// -----------------------------------------------------------------------------
// Test Case 1: No Expenses
// -----------------------------------------------------------------------------
console.log('Test Case 1: No Expenses');
const state1 = createMockState();
assert(calculateTotalSpending(state1.expenses) === 0, 'Total spending is ₹0');
assert(calculateAverageExpense(state1.expenses) === 0, 'Average expense is ₹0');
assert(findHighestExpense(state1.expenses) === null, 'Highest expense is null');
assert(findLowestExpense(state1.expenses) === null, 'Lowest expense is null');

const catData1 = calculateCategorySpending(state1.expenses);
assert(catData1.categories.length === 0, 'Category breakdown is empty');

const memData1 = calculateMemberSpending(state1.members, state1.expenses);
assert(memData1.memberPayments.every(m => m.totalPaid === 0), 'All members paid ₹0');

const insights1 = generateSmartInsights(state1, '2026-08-17');
assert(insights1.length === 0, 'No insights generated when expenses array is empty');

// -----------------------------------------------------------------------------
// Test Case 2: One Expense
// -----------------------------------------------------------------------------
console.log('\nTest Case 2: One Expense');
addExpense(state1, {
  title: 'Dinner',
  amount: 1200,
  category: 'Food',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-10'
});

assert(calculateTotalSpending(state1.expenses) === 1200, 'Total spending is 1200');
assert(calculateAverageExpense(state1.expenses) === 1200, 'Average expense is 1200');
assert(findHighestExpense(state1.expenses).title === 'Dinner', 'Highest expense is Dinner');
assert(findLowestExpense(state1.expenses).title === 'Dinner', 'Lowest expense is Dinner');

// -----------------------------------------------------------------------------
// Test Case 3: Multiple Expenses
// -----------------------------------------------------------------------------
console.log('\nTest Case 3: Multiple Expenses');
addExpense(state1, {
  title: 'Taxi',
  amount: 800,
  category: 'Travel',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-12'
});

addExpense(state1, {
  title: 'Resort Hotel',
  amount: 8000,
  category: 'Hotel',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-15'
});

// Expenses: 1200 + 800 + 8000 = 10000. Count: 3. Avg: 3333.33
assert(calculateTotalSpending(state1.expenses) === 10000, 'Total spending is 10000');
assert(calculateAverageExpense(state1.expenses) === 3333.33, 'Average expense is 3333.33');
assert(findHighestExpense(state1.expenses).title === 'Resort Hotel', 'Highest expense is Resort Hotel (8000)');
assert(findLowestExpense(state1.expenses).title === 'Taxi', 'Lowest expense is Taxi (800)');

// -----------------------------------------------------------------------------
// Test Case 4: Multiple Categories
// -----------------------------------------------------------------------------
console.log('\nTest Case 4: Multiple Categories');
const catData4 = calculateCategorySpending(state1.expenses);
assert(catData4.categories.length === 3, '3 categories present (Hotel, Food, Travel)');
assert(catData4.highestCategory.category === 'Hotel', 'Highest spending category is Hotel');
assert(catData4.highestCategory.percentage === 80, 'Hotel is 80% of total spend (8000 / 10000)');
assert(catData4.lowestCategory.category === 'Travel', 'Lowest spending category is Travel');

// -----------------------------------------------------------------------------
// Test Case 5 & 6: Member Spending & Same Member Paying Multiple Expenses
// -----------------------------------------------------------------------------
console.log('\nTest Case 5 & 6: Member Spending & Accumulation');
const memData5 = calculateMemberSpending(state1.members, state1.expenses);
// Aman paid: 1200 + 8000 = 9200
// Rahul paid: 800
// Rohit paid: 0
const amanPay = memData5.memberPayments.find(m => m.memberId === 'm1');
const rahulPay = memData5.memberPayments.find(m => m.memberId === 'm2');
const rohitPay = memData5.memberPayments.find(m => m.memberId === 'm3');

assert(amanPay.totalPaid === 9200, 'Aman total paid accumulated to 9200');
assert(rahulPay.totalPaid === 800, 'Rahul total paid is 800');
assert(rohitPay.totalPaid === 0, 'Rohit total paid is 0');
assert(memData5.highestPayer.name === 'Aman', 'Highest payer is Aman');

// -----------------------------------------------------------------------------
// Test Case 7: Highest Expense Changes After Edit
// -----------------------------------------------------------------------------
console.log('\nTest Case 7: Highest Expense Changes After Edit');
const hotelExp = state1.expenses.find(e => e.title === 'Resort Hotel');
editExpense(state1, hotelExp.id, {
  title: 'Resort Hotel',
  amount: 500, // Reduced from 8000 to 500
  category: 'Hotel',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-15'
});

assert(findHighestExpense(state1.expenses).title === 'Dinner', 'Highest expense changed to Dinner (1200) after editing Hotel');

// -----------------------------------------------------------------------------
// Test Case 8: Lowest Expense Changes After Delete
// -----------------------------------------------------------------------------
console.log('\nTest Case 8: Lowest Expense Changes After Delete');
// Currently amounts: Dinner (1200), Taxi (800), Resort Hotel (500). Lowest is Resort Hotel (500).
deleteExpense(state1, hotelExp.id);
assert(findLowestExpense(state1.expenses).title === 'Taxi', 'Lowest expense changed to Taxi (800) after deleting Hotel');

// -----------------------------------------------------------------------------
// Test Case 9: Monthly Comparison With Sufficient Data
// -----------------------------------------------------------------------------
console.log('\nTest Case 9: Monthly Comparison With Sufficient Data');
const stateMoM = createMockState();
// Add July 2026 expense (Previous Month relative to Aug 2026)
addExpense(stateMoM, {
  title: 'July Rent',
  amount: 10000,
  category: 'Other',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-07-15'
});

// Add August 2026 expense (Current Month)
addExpense(stateMoM, {
  title: 'August Rent',
  amount: 12500,
  category: 'Other',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-10'
});

const momRes = calculateSpendingChange(stateMoM.expenses, '2026-08-17');
assert(momRes.hasHistoricalData === true, 'hasHistoricalData is true when previous month spending exists');
assert(momRes.currentMonthSpent === 12500, 'Current month spent is 12500');
assert(momRes.previousMonthSpent === 10000, 'Previous month spent is 10000');
assert(momRes.percentageChange === 25, 'Spending increased by 25%');
assert(momRes.direction === 'increase', 'Direction is increase');
assert(momRes.formattedMessage.includes('25%'), 'Formatted message contains 25%');

// -----------------------------------------------------------------------------
// Test Case 10: Monthly Comparison Without Sufficient Data
// -----------------------------------------------------------------------------
console.log('\nTest Case 10: Monthly Comparison Without Sufficient Data');
const stateNoMoM = createMockState();
addExpense(stateNoMoM, {
  title: 'August Rent',
  amount: 12500,
  category: 'Other',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-10'
});

const noMomRes = calculateSpendingChange(stateNoMoM.expenses, '2026-08-17');
assert(noMomRes.hasHistoricalData === false, 'hasHistoricalData is false when previous month spending is 0');
assert(noMomRes.direction === 'no_history', 'Direction is no_history');

// -----------------------------------------------------------------------------
// Test Case 11: Budget Below Spending
// -----------------------------------------------------------------------------
console.log('\nTest Case 11: Budget Below Spending');
stateNoMoM.group.budget = 20000;
const insightsBudgetNorm = generateSmartInsights(stateNoMoM, '2026-08-17');
const budgetInsight = insightsBudgetNorm.find(i => i.includes('group budget'));
assert(budgetInsight.includes('62.5%'), 'Calculates 62.5% budget usage insight (12500 / 20000)');

// -----------------------------------------------------------------------------
// Test Case 12: Budget Exceeded
// -----------------------------------------------------------------------------
console.log('\nTest Case 12: Budget Exceeded');
addExpense(stateNoMoM, {
  title: 'Shopping Trip',
  amount: 10000,
  category: 'Shopping',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-12'
}); // Total now 22500 vs 20000 budget

const insightsExceeded = generateSmartInsights(stateNoMoM, '2026-08-17');
const exceedInsight = insightsExceeded.find(i => i.includes('exceeded'));
assert(exceedInsight.includes('2,500') || exceedInsight.includes('2500'), 'Detects budget exceeded by 2,500');

// -----------------------------------------------------------------------------
// Test Case 13: Recurring Expense Scheduled But Not Converted
// -----------------------------------------------------------------------------
console.log('\nTest Case 13: Unconverted Recurring Expense Excluded');
const stateRecTest = createMockState();
addRecurringExpense(stateRecTest, {
  title: 'Scheduled Rent',
  amount: 15000,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-08-01',
  nextDueDate: '2026-08-01',
  status: 'active'
});

assert(calculateTotalSpending(stateRecTest.expenses) === 0, 'Total spending is 0 while recurring expense is unconverted');

// -----------------------------------------------------------------------------
// Test Case 14: Recurring Expense Converted into Actual Expense
// -----------------------------------------------------------------------------
console.log('\nTest Case 14: Converted Recurring Expense Included');
const recTemplate = stateRecTest.recurringExpenses[0];
convertRecurringToExpense(stateRecTest, recTemplate.id);

assert(calculateTotalSpending(stateRecTest.expenses) === 15000, 'Total spending increases to 15000 after conversion');

// -----------------------------------------------------------------------------
// Test Case 15: Settlement Payment Excluded From Expense Spending
// -----------------------------------------------------------------------------
console.log('\nTest Case 15: Settlement Payment Excluded From Expense Spending');
const stateSettlementTest = createMockState();
// Add actual expense
addExpense(stateSettlementTest, {
  title: 'Dinner',
  amount: 3000,
  category: 'Food',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-10'
});

// Settlement generated: Rahul owes Aman 1000. Rahul makes partial payment of 500.
const settlement = stateSettlementTest.settlements[0];
if (settlement) {
  addPartialPayment(stateSettlementTest, settlement.id, {
    amount: 500,
    paymentMethod: 'UPI',
    date: '2026-08-11',
    note: 'Partial settlement'
  });
}

assert(calculateTotalSpending(stateSettlementTest.expenses) === 3000, 'Total spending remains 3000 (settlement payment 500 not added)');
const memberPaySettlement = calculateMemberSpending(stateSettlementTest.members, stateSettlementTest.expenses);
const rahulPaySettlement = memberPaySettlement.memberPayments.find(m => m.memberId === 'm2');
assert(rahulPaySettlement.totalPaid === 0, 'Rahul expense contribution remains 0 (settlement payment not counted as expense)');

// -----------------------------------------------------------------------------
// Test Case 16: Browser Refresh & State Persistence
// -----------------------------------------------------------------------------
console.log('\nTest Case 16: Browser Refresh & State Persistence');
const jsonStr = JSON.stringify(state1);
const reloadedState = migrateData(JSON.parse(jsonStr));

assert(calculateTotalSpending(reloadedState.expenses) === calculateTotalSpending(state1.expenses), 'Total spending matches after JSON roundtrip');

// -----------------------------------------------------------------------------
// Test Case 17: Robustness & Data Integrity Safety
// -----------------------------------------------------------------------------
console.log('\nTest Case 17: Robustness & Data Integrity Safety');
assert(calculateTotalSpending(null) === 0, 'Handles null expenses array safely');
assert(calculateAverageExpense([]) === 0, 'Handles empty array without NaN');
assert(calculateCategorySpending(undefined).categories.length === 0, 'Handles undefined category array safely');
assert(calculateMemberSpending(null, null).memberPayments.length === 0, 'Handles null member/expense parameters safely');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
