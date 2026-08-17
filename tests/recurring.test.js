/**
 * Smart Expense Splitter — Unit Test Suite for Recurring Expenses System
 * Run using: node tests/recurring.test.js
 */

const {
  calculateNextDueDate,
  getRecurringDueStatus,
  calculateBalances,
  getBudgetStats
} = require('../js/calculation.js');

const {
  addRecurringExpense,
  editRecurringExpense,
  togglePauseRecurringExpense,
  deleteRecurringExpense,
  convertRecurringToExpense,
  logActivity
} = require('../js/expense.js');

const {
  getInitialData,
  migrateData,
  saveData,
  loadData
} = require('../js/storage.js');

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

console.log('\n--- Running Smart Expense Splitter Recurring Expenses Tests ---\n');

// Mock application state
function createMockState() {
  return {
    version: 1,
    theme: 'light',
    group: { id: 'g1', name: 'Apartment 402', budget: 20000 },
    members: [
      { id: 'm1', name: 'Aman' },
      { id: 'm2', name: 'Rahul' }
    ],
    expenses: [],
    settlements: [],
    activities: [],
    recurringExpenses: []
  };
}

// -----------------------------------------------------------------------------
// Scenario 1: Create Weekly Recurring Expense
// -----------------------------------------------------------------------------
console.log('Scenario 1: Create Weekly Recurring Expense');
const state1 = createMockState();
const resWeekly = addRecurringExpense(state1, {
  title: 'Groceries',
  amount: 1400,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'weekly',
  startDate: '2026-08-01',
  nextDueDate: '2026-08-08',
  status: 'active'
});

assert(resWeekly.success === true, 'Weekly recurring expense created successfully');
assert(state1.recurringExpenses.length === 1, 'Recurring expenses array has 1 item');
assert(state1.recurringExpenses[0].frequency === 'weekly', 'Frequency is weekly');
assert(state1.expenses.length === 0, 'No actual expense created on template creation');

// -----------------------------------------------------------------------------
// Scenario 2: Create Monthly Recurring Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 2: Create Monthly Recurring Expense');
const resMonthly = addRecurringExpense(state1, {
  title: 'Rent',
  amount: 8000,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-08-01',
  nextDueDate: '2026-09-01',
  status: 'active'
});

assert(resMonthly.success === true, 'Monthly recurring expense created successfully');
assert(state1.recurringExpenses.length === 2, 'Recurring expenses array has 2 items');
assert(state1.recurringExpenses[0].frequency === 'monthly', 'Newest monthly template is first');

// -----------------------------------------------------------------------------
// Scenario 3: Create Yearly Recurring Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 3: Create Yearly Recurring Expense');
const resYearly = addRecurringExpense(state1, {
  title: 'Insurance',
  amount: 12000,
  paidBy: 'm2',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'yearly',
  startDate: '2026-08-01',
  nextDueDate: '2027-08-01',
  status: 'active'
});

assert(resYearly.success === true, 'Yearly recurring expense created successfully');
assert(state1.recurringExpenses[0].frequency === 'yearly', 'Yearly frequency set correctly');

// -----------------------------------------------------------------------------
// Scenario 4: Edit Recurring Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 4: Edit Recurring Expense');
const rentId = resMonthly.recurring.id;
const resEdit = editRecurringExpense(state1, rentId, {
  title: 'Apartment Rent',
  amount: 8500,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-08-01',
  nextDueDate: '2026-09-01',
  status: 'active'
});

assert(resEdit.success === true, 'Recurring expense edited successfully');
const updatedRent = state1.recurringExpenses.find(r => r.id === rentId);
assert(updatedRent.title === 'Apartment Rent', 'Title updated to Apartment Rent');
assert(updatedRent.amount === 8500, 'Amount updated to 8500');

// -----------------------------------------------------------------------------
// Scenario 5 & 6: Pause and Resume Recurring Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 5 & 6: Pause and Resume Recurring Expense');
const resPause = togglePauseRecurringExpense(state1, rentId);
assert(resPause.success === true, 'Pause call succeeded');
assert(resPause.recurring.status === 'paused', 'Status is now paused');

const statusPaused = getRecurringDueStatus(updatedRent.nextDueDate, updatedRent.status, '2026-09-01');
assert(statusPaused.code === 'PAUSED', 'Due status returns PAUSED for paused template');
assert(statusPaused.isDue === false, 'Paused item returns isDue = false (no due reminders)');

const resResume = togglePauseRecurringExpense(state1, rentId);
assert(resResume.recurring.status === 'active', 'Status resumed back to active');

// -----------------------------------------------------------------------------
// Scenario 7: Delete Recurring Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 7: Delete Recurring Expense');
const insId = resYearly.recurring.id;
const resDelete = deleteRecurringExpense(state1, insId);
assert(resDelete.success === true, 'Delete call succeeded');
assert(state1.recurringExpenses.some(r => r.id === insId) === false, 'Insurance template removed');

// -----------------------------------------------------------------------------
// Scenario 8: Display Upcoming Due Date
// -----------------------------------------------------------------------------
console.log('\nScenario 8: Display Upcoming Due Date');
const statusUpcoming = getRecurringDueStatus('2026-08-20', 'active', '2026-08-17');
assert(statusUpcoming.code === 'UPCOMING', 'Status code is UPCOMING');
assert(statusUpcoming.label === 'Due in 3 days', 'Label is "Due in 3 days"');
assert(statusUpcoming.isDue === false, 'isDue is false for upcoming date');

// -----------------------------------------------------------------------------
// Scenario 9: Display Due Today
// -----------------------------------------------------------------------------
console.log('\nScenario 9: Display Due Today');
const statusToday = getRecurringDueStatus('2026-08-17', 'active', '2026-08-17');
assert(statusToday.code === 'DUE_TODAY', 'Status code is DUE_TODAY');
assert(statusToday.label === 'Due Today', 'Label is "Due Today"');
assert(statusToday.isDue === true, 'isDue is true for due today date');

// -----------------------------------------------------------------------------
// Scenario 10: Display Overdue Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 10: Display Overdue Expense');
const statusOverdue = getRecurringDueStatus('2026-08-15', 'active', '2026-08-17');
assert(statusOverdue.code === 'OVERDUE', 'Status code is OVERDUE');
assert(statusOverdue.label === 'Overdue by 2 days', 'Label is "Overdue by 2 days"');
assert(statusOverdue.isDue === true, 'isDue is true for overdue date');

// -----------------------------------------------------------------------------
// Scenario 11: Convert Recurring Expense into Actual Expense
// -----------------------------------------------------------------------------
console.log('\nScenario 11: Convert Recurring Expense into Actual Expense');
assert(state1.expenses.length === 0, 'Initial expenses list is empty');
const resConvert = convertRecurringToExpense(state1, rentId);
assert(resConvert.success === true, 'Conversion succeeded');
assert(state1.expenses.length === 1, 'Actual expenses array now has 1 expense');
assert(state1.expenses[0].title === 'Apartment Rent', 'Expense title matches template');
assert(state1.expenses[0].amount === 8500, 'Expense amount matches template');
assert(state1.expenses[0].date === '2026-09-01', 'Expense date matches due date 2026-09-01');

// Check that next due date advanced by 1 month
assert(resConvert.recurring.lastGeneratedDate === '2026-09-01', 'lastGeneratedDate updated to 2026-09-01');
assert(resConvert.recurring.nextDueDate === '2026-10-01', 'nextDueDate advanced to 2026-10-01');

// -----------------------------------------------------------------------------
// Scenario 12: Verify Budget Updates Only After Conversion
// -----------------------------------------------------------------------------
console.log('\nScenario 12: Verify Budget Updates Only After Conversion');
const stateBudgetTest = createMockState();
addRecurringExpense(stateBudgetTest, {
  title: 'Scheduled Rent',
  amount: 8000,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-08-01',
  nextDueDate: '2026-09-01',
  status: 'active'
});

let bStats = getBudgetStats(stateBudgetTest.group, stateBudgetTest.expenses);
assert(bStats.totalSpent === 0, 'Budget spending is ₹0 when recurring expense is only scheduled');

const recItem = stateBudgetTest.recurringExpenses[0];
convertRecurringToExpense(stateBudgetTest, recItem.id);

bStats = getBudgetStats(stateBudgetTest.group, stateBudgetTest.expenses);
assert(bStats.totalSpent === 8000, 'Budget spending increases to ₹8,000 only after conversion');

// -----------------------------------------------------------------------------
// Scenario 13 & 14: Verify Balances and Settlements Update Only After Conversion
// -----------------------------------------------------------------------------
console.log('\nScenario 13 & 14: Verify Balances & Settlements Update Only After Conversion');
const stateCalcTest = createMockState();
addRecurringExpense(stateCalcTest, {
  title: 'Scheduled Rent',
  amount: 8000,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-08-01',
  nextDueDate: '2026-09-01',
  status: 'active'
});

let balancesBefore = calculateBalances(stateCalcTest.members, stateCalcTest.expenses);
assert(balancesBefore['m1'].paid === 0 && balancesBefore['m1'].balance === 0, 'Balances are 0 before conversion');
assert(stateCalcTest.settlements.length === 0, 'Settlements are empty before conversion');

convertRecurringToExpense(stateCalcTest, stateCalcTest.recurringExpenses[0].id);

let balancesAfter = calculateBalances(stateCalcTest.members, stateCalcTest.expenses);
assert(balancesAfter['m1'].paid === 8000, 'Aman paid is 8000 after conversion');
assert(balancesAfter['m1'].balance === 4000, 'Aman balance is +4000 after conversion');
assert(balancesAfter['m2'].balance === -4000, 'Rahul balance is -4000 after conversion');
assert(stateCalcTest.settlements.length === 1, 'Settlement created after conversion');
assert(stateCalcTest.settlements[0].from === 'm2' && stateCalcTest.settlements[0].amount === 4000, 'Rahul owes Aman 4000');

// -----------------------------------------------------------------------------
// Scenario 15: Storage Schema Persistence & Migration
// -----------------------------------------------------------------------------
console.log('\nScenario 15: LocalStorage Persistence & Schema Migration');
const legacyDataWithoutRecurring = {
  version: 1,
  theme: 'light',
  group: { id: 'g1', name: 'Legacy' },
  members: [{ id: 'm1', name: 'Aman' }],
  expenses: [],
  settlements: [],
  activities: []
};

const migrated = migrateData(legacyDataWithoutRecurring);
assert(Array.isArray(migrated.recurringExpenses), 'migrateData safely initializes recurringExpenses array');

// -----------------------------------------------------------------------------
// Scenario 16: Duplicate Protection
// -----------------------------------------------------------------------------
console.log('\nScenario 16: Duplicate Protection');
const stateDupTest = createMockState();
const resDupAdd = addRecurringExpense(stateDupTest, {
  title: 'Wi-Fi',
  amount: 1000,
  paidBy: 'm1',
  participants: ['m1', 'm2'],
  splitType: 'equal',
  frequency: 'monthly',
  startDate: '2026-09-01',
  nextDueDate: '2026-09-01',
  status: 'active'
});

const targetDupRec = stateDupTest.recurringExpenses[0];

// First conversion succeeds
const resConvert1 = convertRecurringToExpense(stateDupTest, targetDupRec.id);
assert(resConvert1.success === true, 'First occurrence conversion succeeds');

// Manually simulate attempting to add the same occurrence date again
targetDupRec.nextDueDate = '2026-09-01'; // reset nextDueDate to match lastGeneratedDate

const resConvert2 = convertRecurringToExpense(stateDupTest, targetDupRec.id);
assert(resConvert2.success === false, 'Duplicate conversion attempt for same date is blocked');
assert(resConvert2.error.includes('already been added'), 'Error message informs user of duplicate prevention');

// -----------------------------------------------------------------------------
// Scenario 17: Date Cycle Advance Verification (Weekly, Monthly, Yearly)
// -----------------------------------------------------------------------------
console.log('\nScenario 17: Date Math & Frequency Advancements');
assert(calculateNextDueDate('2026-08-01', 'weekly') === '2026-08-08', 'Weekly date advance (2026-08-01 + 7d -> 2026-08-08)');
assert(calculateNextDueDate('2026-08-01', 'monthly') === '2026-09-01', 'Monthly date advance (2026-08-01 + 1m -> 2026-09-01)');
assert(calculateNextDueDate('2026-08-31', 'monthly') === '2026-09-30', 'Month end date advance (2026-08-31 + 1m -> 2026-09-30)');
assert(calculateNextDueDate('2026-08-01', 'yearly') === '2027-08-01', 'Yearly date advance (2026-08-01 + 1y -> 2027-08-01)');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
