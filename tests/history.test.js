/**
 * Smart Expense Splitter - Unit Test Suite for History & Undo/Redo System
 * Run using: node tests/history.test.js
 */

const {
  createSnapshot,
  pushUndoSnapshot,
  performUndo,
  performRedo,
  getHistoryInfo,
  resetHistory,
  MAX_HISTORY_SIZE
} = require('../js/history.js');

const {
  addExpense,
  deleteExpense,
  addMember,
  removeMember,
  setGroupBudget,
  addRecurringExpense,
  deleteRecurringExpense,
  addTemplate,
  deleteTemplate,
  initSimulationState,
  simulateAddExpense,
  applySimulationToAppState
} = require('../js/expense.js');

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

console.log('\n--- Running Smart Expense Splitter Undo/Redo History Tests ---\n');

// Reset history before starting
resetHistory();

// Initial Mock AppState
let appState = {
  version: 1,
  theme: 'light',
  group: { id: 'g1', name: 'Goa Trip 2026', budget: null },
  members: [
    { id: 'm1', name: 'Aman' },
    { id: 'm2', name: 'Rahul' }
  ],
  expenses: [],
  settlements: [],
  activities: [],
  recurringExpenses: [],
  templates: []
};

// -----------------------------------------------------------------------------
// Test 1: Initial Empty History State
// -----------------------------------------------------------------------------
console.log('Test Suite 1: Initial Empty Stack State');
let info = getHistoryInfo();
assert(info.canUndo === false, 'canUndo is false when history is empty');
assert(info.canRedo === false, 'canRedo is false when redo stack is empty');
assert(info.undoCount === 0, 'undoCount is 0 initially');
assert(info.redoCount === 0, 'redoCount is 0 initially');

// -----------------------------------------------------------------------------
// Test 2: Single Action Undo & Redo (Add Expense)
// -----------------------------------------------------------------------------
console.log('\nTest Suite 2: Single Action Undo & Redo');
pushUndoSnapshot(appState, 'Add "Dinner"');
addExpense(appState, {
  title: 'Dinner',
  amount: 1200,
  paidBy: 'm1',
  participants: ['m1', 'm2']
});

assert(appState.expenses.length === 1, 'Expense "Dinner" added to real state');
info = getHistoryInfo();
assert(info.canUndo === true, 'canUndo is true after action');
assert(info.undoActionName === 'Add "Dinner"', 'undoActionName matches recorded label');

// Perform Undo
let undoRes = performUndo(appState);
assert(undoRes.success === true, 'Undo call succeeded');
appState = undoRes.restoredState;

assert(appState.expenses.length === 0, 'State restored: expenses count is back to 0');
info = getHistoryInfo();
assert(info.canUndo === false, 'canUndo is false after undoing single action');
assert(info.canRedo === true, 'canRedo is true after undoing');
assert(info.redoActionName === 'Add "Dinner"', 'redoActionName matches');

// Perform Redo
let redoRes = performRedo(appState);
assert(redoRes.success === true, 'Redo call succeeded');
appState = redoRes.restoredState;

assert(appState.expenses.length === 1, 'State restored via Redo: expense count is 1');
assert(appState.expenses[0].title === 'Dinner', 'Expense title is "Dinner"');
info = getHistoryInfo();
assert(info.canUndo === true, 'canUndo is true after redo');
assert(info.canRedo === false, 'canRedo is false after redo');

// -----------------------------------------------------------------------------
// Test 3: Multi-Step Undo and Redo Pipeline
// -----------------------------------------------------------------------------
console.log('\nTest Suite 3: Multi-Step Undo and Redo');
// Action 2: Set Budget
pushUndoSnapshot(appState, 'Set Budget ₹10000');
setGroupBudget(appState, 10000);

// Action 3: Add Member Rohit
pushUndoSnapshot(appState, 'Add Member "Rohit"');
addMember(appState, 'Rohit');

assert(appState.members.length === 3, '3 members in current state');
assert(appState.group.budget === 10000, 'Budget is 10000');

// Undo Action 3 (Add Member Rohit)
undoRes = performUndo(appState);
appState = undoRes.restoredState;
assert(appState.members.length === 2, 'Undo 1: Members count restored to 2');
assert(undoRes.actionName === 'Add Member "Rohit"', 'Undo 1 actionName correct');

// Undo Action 2 (Set Budget)
undoRes = performUndo(appState);
appState = undoRes.restoredState;
assert(appState.group.budget === null, 'Undo 2: Budget restored to null');
assert(undoRes.actionName === 'Set Budget ₹10000', 'Undo 2 actionName correct');

// Redo Action 2 (Set Budget)
redoRes = performRedo(appState);
appState = redoRes.restoredState;
assert(appState.group.budget === 10000, 'Redo 1: Budget restored to 10000');

// Redo Action 3 (Add Member Rohit)
redoRes = performRedo(appState);
appState = redoRes.restoredState;
assert(appState.members.length === 3, 'Redo 2: Members count restored to 3');

// -----------------------------------------------------------------------------
// Test 4: Redo Stack Cleared on New Action Branch
// -----------------------------------------------------------------------------
console.log('\nTest Suite 4: Redo Stack Clearing on New Action Branch');
// Undo last action (Add Member Rohit)
undoRes = performUndo(appState);
appState = undoRes.restoredState;

info = getHistoryInfo();
assert(info.canRedo === true, 'canRedo is true after undo');

// Perform NEW action instead of redo
pushUndoSnapshot(appState, 'Add Member "Vikas"');
addMember(appState, 'Vikas');

info = getHistoryInfo();
assert(info.canRedo === false, 'redoStack is cleared when a new action occurs');
assert(info.undoActionName === 'Add Member "Vikas"', 'Latest undo action is Vikas');

// -----------------------------------------------------------------------------
// Test 5: History Depth Limit (Max 50 items)
// -----------------------------------------------------------------------------
console.log('\nTest Suite 5: Maximum History Size Limit (50 entries)');
resetHistory();
let tempState = JSON.parse(JSON.stringify(appState));

// Push 60 actions
for (let i = 1; i <= 60; i++) {
  pushUndoSnapshot(tempState, `Action ${i}`);
  tempState.expenses.push({ id: `e_${i}`, title: `Exp ${i}`, amount: i * 10 });
}

info = getHistoryInfo();
assert(info.undoCount === 50, 'undoCount is capped at MAX_HISTORY_SIZE (50)');
assert(info.undoActionName === 'Action 60', 'Latest action is Action 60');

// Perform Undo 50 times
let undoCountAchieved = 0;
while (getHistoryInfo().canUndo) {
  let res = performUndo(tempState);
  tempState = res.restoredState;
  undoCountAchieved++;
}
assert(undoCountAchieved === 50, 'Popped exactly 50 items from history');
assert(getHistoryInfo().canUndo === false, 'Undo stack now empty');

// -----------------------------------------------------------------------------
// Test 6: Deep Copy Immutability Verification
// -----------------------------------------------------------------------------
console.log('\nTest Suite 6: Snapshot Deep Copy Immutability');
resetHistory();
let stateBase = {
  group: { name: 'Trip' },
  members: [{ id: 'm1', name: 'Aman' }],
  expenses: [{ id: 'e1', title: 'Cab', amount: 500 }]
};

pushUndoSnapshot(stateBase, 'Add "Cab"');

// Mutate stateBase directly after pushing snapshot
stateBase.expenses[0].title = 'MUTATED CAB TITLE';
stateBase.expenses[0].amount = 99999;
stateBase.members.push({ id: 'm2', name: 'Hacker' });

// Undo to snapshot
let restoreRes = performUndo(stateBase);
let restored = restoreRes.restoredState;

assert(restored.expenses[0].title === 'Cab', 'Snapshot title preserved original "Cab"');
assert(restored.expenses[0].amount === 500, 'Snapshot amount preserved original 500');
assert(restored.members.length === 1, 'Snapshot members preserved length 1');

// -----------------------------------------------------------------------------
// Test 7: What-If Simulator Action Isolation
// -----------------------------------------------------------------------------
console.log('\nTest Suite 7: What-If Simulator History Isolation');
resetHistory();
let realState = JSON.parse(JSON.stringify(appState));

// Create simulation state
let simState = initSimulationState(realState);

// Simulate operations inside simulator tab (should NOT call pushUndoSnapshot)
simulateAddExpense(simState, { title: 'Simulated Taxi', amount: 400, paidBy: 'm1' });

info = getHistoryInfo();
assert(info.canUndo === false, 'Actions inside What-If simulator do NOT add to real Undo stack');

// Now apply simulation to real appState (SHOULD record Undo snapshot)
pushUndoSnapshot(realState, 'Apply What-If Simulation');
applySimulationToAppState(realState, simState);

info = getHistoryInfo();
assert(info.canUndo === true, 'Applying What-If simulation records an Undo snapshot');
assert(info.undoActionName === 'Apply What-If Simulation', 'Undo action name is "Apply What-If Simulation"');

// -----------------------------------------------------------------------------
// Test 8: Read-Only Actions Isolation
// -----------------------------------------------------------------------------
console.log('\nTest Suite 8: Read-Only Actions Isolation');
resetHistory();
// Read-only actions (filtering, searching, viewing report) do NOT call pushUndoSnapshot
info = getHistoryInfo();
assert(info.canUndo === false, 'Read-only actions leave Undo stack empty');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
