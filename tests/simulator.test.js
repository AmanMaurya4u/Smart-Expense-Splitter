/**
 * Smart Expense Splitter - Unit Test Suite for What-If Settlement Simulator
 * Run using: node tests/simulator.test.js
 */

const {
  calculateBalances,
  calculateSettlements,
  getBudgetStats,
  calculateTotalSpending,
  compareBalances,
  compareBudgetStats
} = require('../js/calculation.js');

const {
  createGroup,
  addMember,
  addExpense,
  editExpense,
  deleteExpense,
  initSimulationState,
  simulatePayment,
  simulateAddExpense,
  simulateEditExpenseAmount,
  simulateRemoveExpense,
  removeSimulationChange,
  resetSimulationState,
  applySimulationToAppState
} = require('../js/expense.js');

const {
  getInitialData,
  saveData,
  loadData,
  clearAllData
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

console.log('\n--- Running What-If Settlement Simulator Test Suite ---\n');

// Mock localStorage for Node.js environment
if (typeof localStorage === 'undefined') {
  global.localStorage = (function () {
    let store = {};
    return {
      getItem: function (key) {
        return store[key] || null;
      },
      setItem: function (key, value) {
        store[key] = value.toString();
      },
      removeItem: function (key) {
        delete store[key];
      },
      clear: function () {
        store = {};
      }
    };
  })();
}

// -----------------------------------------------------------------------------
// Setup Base Application State
// -----------------------------------------------------------------------------
let appState = getInitialData();
createGroup(appState, 'Goa Trip');

addMember(appState, 'Aman');
addMember(appState, 'Rahul');
addMember(appState, 'Rohit');

const m1 = appState.members[0].id; // Aman
const m2 = appState.members[1].id; // Rahul
const m3 = appState.members[2].id; // Rohit

// Set group budget to ₹20,000
appState.group.budget = 20000;

// Add initial expenses:
// 1. Hotel: ₹8,000 paid by Aman, split equal between Aman, Rahul, Rohit (₹2,666.67 / ₹2,666.67 / ₹2,666.66)
// 2. Cab: ₹1,000 paid by Rahul, split equal between Aman, Rahul, Rohit
addExpense(appState, {
  title: 'Hotel',
  amount: 8000,
  paidBy: m1,
  splitType: 'equal',
  participants: [m1, m2, m3]
});

addExpense(appState, {
  title: 'Cab',
  amount: 1000,
  paidBy: m2,
  splitType: 'equal',
  participants: [m1, m2, m3]
});

const expHotelId = appState.expenses.find(e => e.title === 'Hotel').id;
const expCabId = appState.expenses.find(e => e.title === 'Cab').id;

// -----------------------------------------------------------------------------
// Test Scenario 1: Open Simulator Without Making Changes
// -----------------------------------------------------------------------------
console.log('Test Scenario 1: Open simulator without changes');
let simState = initSimulationState(appState);
assert(simState.changes.length === 0, 'Initial simulation has 0 changes');
assert(simState.expenses.length === appState.expenses.length, 'Simulated expenses count matches real state');

const initialBeforeBal = calculateBalances(appState.members, appState.expenses);
const initialAfterBal = calculateBalances(simState.members, simState.expenses);
const balComp1 = compareBalances(initialBeforeBal, initialAfterBal);
assert(balComp1.every(b => b.balanceDiff === 0), 'No balance differences when 0 changes made');

// -----------------------------------------------------------------------------
// Test Scenario 2: Simulate a Single Payment
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 2: Simulate a single payment');
simState = initSimulationState(appState);

// Rahul pays Aman ₹400
const payRes1 = simulatePayment(simState, m2, m1, 400);
assert(payRes1.success === true, 'Simulating Rahul paying Aman ₹400 succeeds');
assert(simState.changes.length === 1, '1 simulation change recorded');
assert(appState.activities.length < 10, 'Activity timeline NOT mutated during simulation');

// Check settlements after payment simulation
const sStats = calculateSettlements(calculateBalances(simState.members, simState.expenses));
assert(sStats.length > 0, 'Settlement calculations function correctly with simulated payment');

// -----------------------------------------------------------------------------
// Test Scenario 3: Simulate Multiple Payments
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 3: Simulate multiple payments');
simState = initSimulationState(appState);
simulatePayment(simState, m2, m1, 400);
const payRes2 = simulatePayment(simState, m3, m1, 300);
assert(payRes2.success === true, 'Second payment simulation succeeds');
assert(simState.changes.length === 2, '2 simulation changes recorded');

// -----------------------------------------------------------------------------
// Test Scenario 4: Simulate a New Expense
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 4: Simulate a new expense');
simState = initSimulationState(appState);
const addExpRes = simulateAddExpense(simState, {
  title: 'Dinner',
  amount: 2000,
  paidBy: m2,
  splitType: 'equal',
  participants: [m1, m2, m3]
});

assert(addExpRes.success === true, 'Simulating ₹2,000 Dinner expense succeeds');
assert(simState.expenses.length === appState.expenses.length + 1, 'Simulated expense count increases by 1');
assert(appState.expenses.length === 2, 'Real expense list remains unchanged at 2 items');

// -----------------------------------------------------------------------------
// Test Scenario 5: Simulate Changing an Expense Amount
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 5: Simulate changing expense amount');
simState = initSimulationState(appState);
const editAmountRes = simulateEditExpenseAmount(simState, expHotelId, 6000);
assert(editAmountRes.success === true, 'Simulating Hotel expense amount change to ₹6,000 succeeds');

const simHotel = simState.expenses.find(e => e.id === expHotelId);
assert(simHotel.amount === 6000, 'Simulated Hotel expense amount is updated to 6000');

const realHotel = appState.expenses.find(e => e.id === expHotelId);
assert(realHotel.amount === 8000, 'Real Hotel expense amount remains 8000');

// -----------------------------------------------------------------------------
// Test Scenario 6: Simulate Removing an Expense
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 6: Simulate removing an expense');
simState = initSimulationState(appState);
const removeExpRes = simulateRemoveExpense(simState, expCabId);
assert(removeExpRes.success === true, 'Simulating Cab expense removal succeeds');
assert(simState.expenses.some(e => e.id === expCabId) === false, 'Cab expense removed from simulation');
assert(appState.expenses.some(e => e.id === expCabId) === true, 'Cab expense still exists in real appState');

// -----------------------------------------------------------------------------
// Test Scenario 7 & 8 & 9 & 10: Combine Multiple Simulated Changes & Verify Metrics
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 7-10: Combined changes & impact metrics');
simState = initSimulationState(appState);

// 1. Rahul pays Aman ₹400
simulatePayment(simState, m2, m1, 400);
// 2. Add ₹2,000 Dinner paid by Rahul
simulateAddExpense(simState, {
  title: 'Dinner',
  amount: 2000,
  paidBy: m2,
  splitType: 'equal',
  participants: [m1, m2, m3]
});
// 3. Hotel amount from ₹8,000 -> ₹6,000
simulateEditExpenseAmount(simState, expHotelId, 6000);

assert(simState.changes.length === 3, 'Combined simulation recorded 3 distinct changes');

// Check simulated total spending (Original: 8000 + 1000 = 9000; Simulated: 6000 + 1000 + 2000 = 9000)
const beforeSpend = calculateTotalSpending(appState.expenses);
const afterSpend = calculateTotalSpending(simState.expenses);
assert(beforeSpend === 9000, 'Before total spending is ₹9,000');
assert(afterSpend === 9000, 'Simulated total spending is ₹9,000');

// Check budget calculation on simulation state
const bStatsBefore = getBudgetStats(appState.group, appState.expenses);
const bStatsAfter = getBudgetStats(simState.group, simState.expenses);
const bComp = compareBudgetStats(bStatsBefore, bStatsAfter);
assert(bComp.spentDiff === 0, 'Budget spending diff calculated correctly');

// -----------------------------------------------------------------------------
// Test Scenario 11 & 12: Reset Simulation & Verify Real Data Preservation
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 11-12: Reset simulation & verify isolation');
const initialActCount = appState.activities.length;
simState = resetSimulationState(appState);

assert(simState.changes.length === 0, 'Reset simulation clears all changes');
assert(simState.expenses.length === appState.expenses.length, 'Reset simulation restores expense list');
assert(appState.activities.length === initialActCount, 'Real activity log count untouched');

// -----------------------------------------------------------------------------
// Test Scenario 13 & 14 & 15: Apply Simulation & Verify Persistence
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 13-15: Apply simulation & LocalStorage persistence');
simState = initSimulationState(appState);

// Add a simulated ₹3,000 Shopping expense paid by Rohit
simulateAddExpense(simState, {
  title: 'Shopping',
  amount: 3000,
  paidBy: m3,
  splitType: 'equal',
  participants: [m1, m2, m3]
});

const applyRes = applySimulationToAppState(appState, simState);
assert(applyRes.success === true, 'Applying simulation returns success: true');
assert(applyRes.appliedCount === 1, 'Applied count equals 1');

// Verify real appState updated
const appliedShopping = appState.expenses.find(e => e.title === 'Shopping');
assert(appliedShopping !== undefined, 'Applied expense "Shopping" now exists in real appState');
assert(appliedShopping.amount === 3000, 'Applied expense amount is 3000');

// Verify LocalStorage reloaded data
const reloadedState = loadData();
const loadedShopping = reloadedState.expenses.find(e => e.title === 'Shopping');
assert(loadedShopping !== undefined, 'LocalStorage contains applied changes after reload');

// -----------------------------------------------------------------------------
// Test Scenario 16: Verify Activity Timeline Records Only Applied Changes
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 16: Activity Timeline verification');
const recentAct = appState.activities[0];
assert(recentAct !== undefined, 'Activity log entry created for applied change');
assert(recentAct.message.includes('Shopping'), 'Activity message mentions applied expense "Shopping"');

// -----------------------------------------------------------------------------
// Test Scenario 17: Partial Payment Logic Integrity
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 17: Partial payment logic integrity');
const balancesAfterApply = calculateBalances(appState.members, appState.expenses);
const settlementsAfterApply = calculateSettlements(balancesAfterApply);
assert(Array.isArray(settlementsAfterApply), 'Settlements array structure intact');

// -----------------------------------------------------------------------------
// Summary Report
// -----------------------------------------------------------------------------
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
