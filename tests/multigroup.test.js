/**
 * Smart Expense Splitter - Unit Test Suite for Multi-Group Management System
 * Run using: node tests/multigroup.test.js
 */

const {
  migrateData,
  syncActiveGroupProjections,
  getInitialData
} = require('../js/storage.js');

const {
  createGroupWorkspace,
  switchActiveGroup,
  renameGroupWorkspace,
  deleteGroupWorkspace,
  getGroupMetrics,
  addMember,
  addExpense,
  setGroupBudget,
  addRecurringExpense,
  addTemplate
} = require('../js/expense.js');

const {
  pushUndoSnapshot,
  performUndo,
  performRedo,
  getHistoryInfo,
  resetHistory
} = require('../js/history.js');

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

console.log('\n--- Running Smart Expense Splitter Multi-Group Management Tests ---\n');

// -----------------------------------------------------------------------------
// Test 1: Backward-Compatible Legacy LocalStorage Migration
// -----------------------------------------------------------------------------
console.log('Test Suite 1: Single-Group LocalStorage Migration (v1 -> v2)');
const legacyData = {
  version: 1,
  theme: 'dark',
  group: { id: 'g_legacy', name: 'Goa Trip 2026', budget: 15000 },
  members: [
    { id: 'm1', name: 'Aman' },
    { id: 'm2', name: 'Rahul' }
  ],
  expenses: [
    { id: 'exp1', title: 'Dinner', amount: 1200, paidBy: 'm1', participants: ['m1', 'm2'] }
  ],
  settlements: [
    { id: 's1', from: 'm2', to: 'm1', amount: 600, status: 'pending', payments: [] }
  ],
  activities: [],
  recurringExpenses: [],
  templates: []
};

const migrated = migrateData(legacyData);

assert(migrated.version === 2, 'Schema version updated to 2');
assert(Array.isArray(migrated.groups) && migrated.groups.length === 1, 'Single legacy group migrated into groups array');
assert(migrated.activeGroupId === 'g_legacy', 'activeGroupId set to legacy group ID');
assert(migrated.group.name === 'Goa Trip 2026', 'Active group projection matches legacy group name');
assert(migrated.expenses.length === 1, 'Expenses migrated into active workspace projection');
assert(migrated.expenses[0].title === 'Dinner', 'Expense data preserved intact');

// -----------------------------------------------------------------------------
// Test 2: Create Multiple Group Workspaces
// -----------------------------------------------------------------------------
console.log('\nTest Suite 2: Create Multiple Group Workspaces');
let appState = getInitialData();

const group1Res = createGroupWorkspace(appState, 'Goa Trip 2026');
assert(group1Res.success === true, 'Goa Trip group created');
assert(appState.groups.length === 1, 'Total groups count is 1');
assert(appState.activeGroupId === group1Res.group.id, 'Goa Trip is set as active group');

// Add members and expense to Group 1 (Goa Trip)
addMember(appState, 'Aman');
addMember(appState, 'Rahul');
const amanIdG1 = appState.members[0].id;
const rahulIdG1 = appState.members[1].id;
addExpense(appState, { title: 'Hotel Stay', amount: 8000, paidBy: amanIdG1, participants: [amanIdG1, rahulIdG1] });
setGroupBudget(appState, 20000);

const group2Res = createGroupWorkspace(appState, 'Roommates');
assert(group2Res.success === true, 'Roommates group created');
assert(appState.groups.length === 2, 'Total groups count is 2');
assert(appState.activeGroupId === group2Res.group.id, 'Roommates set as active group');
assert(appState.group.name === 'Roommates', 'Active group name updated to Roommates');
assert(appState.members.length === 0, 'New Roommates group initialized with 0 members');
assert(appState.expenses.length === 0, 'New Roommates group initialized with 0 expenses');
assert(appState.group.budget === null, 'New Roommates group budget initialized as null');

// Add members and expense to Group 2 (Roommates)
addMember(appState, 'Aman'); // Same name, independent member ID!
addMember(appState, 'Priya');
const amanIdG2 = appState.members[0].id;
const priyaIdG2 = appState.members[1].id;

assert(amanIdG1 !== amanIdG2, 'Member IDs across different groups are completely unique');

addExpense(appState, { title: 'Apartment Rent', amount: 15000, paidBy: amanIdG2, participants: [amanIdG2, priyaIdG2] });
setGroupBudget(appState, 30000);

// -----------------------------------------------------------------------------
// Test 3: Strict Data Isolation Across Groups
// -----------------------------------------------------------------------------
console.log('\nTest Suite 3: Data Isolation Across Group Workspaces');

// Switch back to Group 1 (Goa Trip)
switchActiveGroup(appState, group1Res.group.id);
assert(appState.group.name === 'Goa Trip 2026', 'Switched back to Goa Trip 2026');
assert(appState.expenses.length === 1, 'Goa Trip has 1 expense');
assert(appState.expenses[0].title === 'Hotel Stay', 'Goa Trip expense is Hotel Stay');
assert(appState.group.budget === 20000, 'Goa Trip budget remains ₹20,000');
assert(appState.members.length === 2, 'Goa Trip members count is 2 (Aman, Rahul)');
assert(appState.members[1].name === 'Rahul', 'Goa Trip member 2 is Rahul');

// Switch back to Group 2 (Roommates)
switchActiveGroup(appState, group2Res.group.id);
assert(appState.group.name === 'Roommates', 'Switched back to Roommates');
assert(appState.expenses.length === 1, 'Roommates has 1 expense');
assert(appState.expenses[0].title === 'Apartment Rent', 'Roommates expense is Apartment Rent');
assert(appState.group.budget === 30000, 'Roommates budget remains ₹30,000');
assert(appState.members.length === 2, 'Roommates members count is 2 (Aman, Priya)');
assert(appState.members[1].name === 'Priya', 'Roommates member 2 is Priya');

// -----------------------------------------------------------------------------
// Test 4: Group Rename Operations
// -----------------------------------------------------------------------------
console.log('\nTest Suite 4: Group Workspace Rename');
renameGroupWorkspace(appState, group1Res.group.id, 'Goa Trip Winter 2026');

switchActiveGroup(appState, group1Res.group.id);
assert(appState.group.name === 'Goa Trip Winter 2026', 'Group 1 name updated to Goa Trip Winter 2026');
assert(appState.expenses.length === 1, 'Expenses count unchanged after rename');
assert(appState.expenses[0].title === 'Hotel Stay', 'Expense data intact after rename');

// -----------------------------------------------------------------------------
// Test 5: Metrics Summary Calculation per Group
// -----------------------------------------------------------------------------
console.log('\nTest Suite 5: High-Level Group Metrics');
const metricsG1 = getGroupMetrics(appState.groups[0]);
assert(metricsG1.memberCount === 2, 'Metrics G1 memberCount is 2');
assert(metricsG1.expenseCount === 1, 'Metrics G1 expenseCount is 1');
assert(metricsG1.totalSpent === 8000, 'Metrics G1 totalSpent is 8000');
assert(metricsG1.budget === 20000, 'Metrics G1 budget is 20000');

// -----------------------------------------------------------------------------
// Test 6: Undo/Redo Boundary Safety Across Groups
// -----------------------------------------------------------------------------
console.log('\nTest Suite 6: Undo/Redo Group Boundary Isolation');
resetHistory();

// Perform action in Goa Trip (active group)
pushUndoSnapshot(appState, 'Add "Taxi"');
addExpense(appState, { title: 'Taxi', amount: 500, paidBy: amanIdG1, participants: [amanIdG1, rahulIdG1] });

let undoInfo = getHistoryInfo(appState);
assert(undoInfo.canUndo === true, 'canUndo is true for Goa Trip');

// Switch to Roommates group
switchActiveGroup(appState, group2Res.group.id);

undoInfo = getHistoryInfo(appState);
assert(undoInfo.canUndo === false, 'canUndo is false when active group differs from snapshot groupId');

const undoAttempt = performUndo(appState);
assert(undoAttempt.success === false, 'Undo blocked from executing across group boundary');

// Switch back to Goa Trip
switchActiveGroup(appState, group1Res.group.id);
undoInfo = getHistoryInfo(appState);
assert(undoInfo.canUndo === true, 'canUndo is true when returning to matching group');

const validUndo = performUndo(appState);
assert(validUndo.success === true, 'Undo succeeds for matching active group');
appState = validUndo.restoredState;
assert(appState.expenses.length === 1, 'Expense count restored to 1');

// -----------------------------------------------------------------------------
// Test 7: Group Workspace Deletion & Zero-Group Fallback
// -----------------------------------------------------------------------------
console.log('\nTest Suite 7: Group Workspace Deletion');
const delG1Res = deleteGroupWorkspace(appState, group1Res.group.id);
assert(delG1Res.success === true, 'Goa Trip group deleted');
assert(delG1Res.remainingCount === 1, 'Remaining groups count is 1');
assert(appState.activeGroupId === group2Res.group.id, 'Active group automatically switched to remaining Roommates group');
assert(appState.group.name === 'Roommates', 'Active group name is Roommates');

// Delete final remaining group
const delG2Res = deleteGroupWorkspace(appState, group2Res.group.id);
assert(delG2Res.success === true, 'Roommates group deleted');
assert(delG2Res.remainingCount === 0, 'Remaining groups count is 0');
assert(appState.activeGroupId === null, 'activeGroupId is null when 0 groups remain');
assert(appState.group === null, 'Active group pointer is null when 0 groups remain');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
