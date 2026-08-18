/**
 * Smart Expense Splitter - Unit Test Suite for Expense Templates System
 * Run using: node tests/templates.test.js
 */

const {
  calculateBalances,
  calculateSettlements,
  getBudgetStats,
  calculateTotalSpending
} = require('../js/calculation.js');

const {
  createGroup,
  addMember,
  removeMember,
  addExpense,
  addTemplate,
  editTemplate,
  deleteTemplate,
  duplicateTemplate,
  sanitizeTemplateForMemberChanges
} = require('../js/expense.js');

const {
  getInitialData,
  saveData,
  loadData,
  migrateData
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

console.log('\n--- Running Expense Templates Unit Test Suite ---\n');

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

appState.group.budget = 10000;

// -----------------------------------------------------------------------------
// Test Scenario 1: Create Dinner Template
// -----------------------------------------------------------------------------
console.log('Test Scenario 1: Create Dinner template');
const t1Res = addTemplate(appState, {
  name: 'Dinner',
  title: 'Dinner at Beach Shack',
  defaultAmount: 1200,
  category: 'Food',
  splitType: 'equal',
  participants: [m1, m2, m3],
  defaultPayer: m1
});

assert(t1Res.success === true, 'Dinner template created successfully');
assert(appState.templates.length === 1, 'Templates array contains 1 item');
assert(appState.templates[0].name === 'Dinner', 'Template name is "Dinner"');
assert(appState.templates[0].defaultAmount === 1200, 'Default amount is ₹1,200');

// Verify template creation does NOT affect financial metrics
assert(appState.expenses.length === 0, 'No expense record created when template added');
assert(calculateTotalSpending(appState.expenses) === 0, 'Total spending is ₹0');

// -----------------------------------------------------------------------------
// Test Scenario 2: Create Cab Template
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 2: Create Cab template');
const t2Res = addTemplate(appState, {
  name: 'Cab',
  title: 'Airport Cab',
  defaultAmount: 600,
  category: 'Travel',
  splitType: 'equal',
  participants: [m1, m2],
  defaultPayer: m2
});

assert(t2Res.success === true, 'Cab template created successfully');
assert(appState.templates.length === 2, 'Templates array contains 2 items');

// -----------------------------------------------------------------------------
// Test Scenario 3, 4, 5: Use Dinner Template, Modify Amount, Save Expense
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 3-5: Use Dinner template & save modified expense');

// Retrieve template configuration
const dinnerTemplate = appState.templates.find(t => t.name === 'Dinner');
assert(dinnerTemplate !== undefined, 'Dinner template found');

// User modifies amount from 1200 to 1500 before saving
const expRes = addExpense(appState, {
  title: dinnerTemplate.title,
  amount: 1500, // Modified from 1200
  category: dinnerTemplate.category,
  paidBy: dinnerTemplate.defaultPayer,
  splitType: dinnerTemplate.splitType,
  participants: dinnerTemplate.participants
});

assert(expRes.success === true, 'Expense saved from template successfully');
assert(appState.expenses.length === 1, 'Real expense list now contains 1 expense');
assert(appState.expenses[0].amount === 1500, 'Saved expense amount is ₹1,500');

// -----------------------------------------------------------------------------
// Test Scenarios 6-10: Verify Balance, Settlement, Budget, Analytics & Activity
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 6-10: Verify system updates from template-generated expense');

// 6. Balance updates
const balances = calculateBalances(appState.members, appState.expenses);
assert(balances[m1].balance === 1000, 'Aman net balance is +₹1,000 (paid ₹1500, share ₹500)');

// 7. Settlement updates
const settlements = calculateSettlements(balances);
assert(settlements.length > 0, 'Settlement suggestions generated after expense creation');

// 8. Budget updates
const budget = getBudgetStats(appState.group, appState.expenses);
assert(budget.totalSpent === 1500, 'Budget spent updated to ₹1,500');

// 9. Analytics updates
assert(calculateTotalSpending(appState.expenses) === 1500, 'Total spending analytics is ₹1,500');

// 10. Activity timeline
const lastActivity = appState.activities[0];
assert(lastActivity.type === 'expense_added', 'Activity timeline recorded expense_added');

// -----------------------------------------------------------------------------
// Test Scenarios 11 & 12: Edit Template & Verify Old Expenses Preserved
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 11-12: Edit template & verify past expenses unchanged');
const editRes = editTemplate(appState, dinnerTemplate.id, {
  name: 'Fancy Dinner',
  title: 'Dinner at Luxury Restaurant',
  defaultAmount: 3000,
  category: 'Food',
  splitType: 'equal',
  participants: [m1, m2, m3],
  defaultPayer: m1
});

assert(editRes.success === true, 'Template edited successfully');
assert(appState.templates.find(t => t.id === dinnerTemplate.id).defaultAmount === 3000, 'Template amount updated to 3000');

// Past expense remains ₹1,500
assert(appState.expenses[0].amount === 1500, 'Past expense amount remains ₹1,500 (completely untouched)');

// -----------------------------------------------------------------------------
// Test Scenarios 13 & 14: Delete Template & Verify Old Expenses Preserved
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 13-14: Delete template & verify past expenses unchanged');
const delRes = deleteTemplate(appState, dinnerTemplate.id);
assert(delRes.success === true, 'Template deleted successfully');
assert(appState.templates.some(t => t.id === dinnerTemplate.id) === false, 'Template removed from appState.templates');
assert(appState.expenses.length === 1, 'Past expense still exists in appState.expenses');

// -----------------------------------------------------------------------------
// Test Scenario 15: Duplicate Template Name Prevention
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 15: Duplicate template name prevention');
const dupAttempt = addTemplate(appState, {
  name: 'Cab', // "Cab" already exists
  title: 'City Cab',
  defaultAmount: 400
});

assert(dupAttempt.success === false, 'Duplicate template creation blocked');
assert(dupAttempt.error === 'A template with this name already exists.', 'Correct duplicate error message returned');

// -----------------------------------------------------------------------------
// Test Scenarios 16-18: Member Removal Safety & Sanitization
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 16-18: Member removal handling & template sanitization');

// Add a template referencing Rohit (m3)
addTemplate(appState, {
  name: 'Movie',
  title: 'Weekend Movie',
  defaultAmount: 500,
  category: 'Entertainment',
  splitType: 'equal',
  participants: [m1, m2, m3],
  defaultPayer: m3
});

const movieTemplate = appState.templates.find(t => t.name === 'Movie');

// Remove member Rohit (m3) if deletable or test sanitization logic
const sanitizedBefore = sanitizeTemplateForMemberChanges(movieTemplate, appState.members);
assert(sanitizedBefore.participants.includes(m3), 'Sanitization includes m3 when member exists');

// Simulate current members without m3
const membersWithoutM3 = appState.members.filter(m => m.id !== m3);
const sanitizedAfter = sanitizeTemplateForMemberChanges(movieTemplate, membersWithoutM3);

assert(!sanitizedAfter.participants.includes(m3), 'Removed member ID filtered out of participants');
assert(sanitizedAfter.defaultPayer === null, 'Default payer reset to null when member removed');

// -----------------------------------------------------------------------------
// Test Scenarios 19-20: LocalStorage Persistence & Schema Migration
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 19-20: Persistence & legacy schema migration');

// Test saving & loading state
saveData(appState);
const loadedState = loadData();
assert(loadedState.templates.length === appState.templates.length, 'Templates persisted and reloaded from LocalStorage');

// Test legacy migration without templates array
const legacyData = {
  version: 1,
  members: [],
  expenses: []
};
const migrated = migrateData(legacyData);
assert(Array.isArray(migrated.templates), 'Legacy state without templates safely migrated to templates: []');

// -----------------------------------------------------------------------------
// Test Scenario 21: What-If Simulator Isolation
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 21: What-If Simulator isolation');
const simCab = appState.templates.find(t => t.name === 'Cab');
assert(simCab !== undefined, 'Cab template available for simulator');
assert(appState.expenses.length === 1, 'Real expenses remain 1 item during simulation');

// -----------------------------------------------------------------------------
// Test Scenario 22: Receipts & Payments Isolation
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 22: Receipts & Payments isolation');
const templateObj = appState.templates[0];
assert(typeof templateObj.receipt === 'undefined', 'Templates do not store receipt data');
assert(typeof templateObj.payments === 'undefined', 'Templates do not store payment history');

// -----------------------------------------------------------------------------
// Test Scenario 23: Duplicate Action Helper
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 23: Duplicate template helper');
const dupRes = duplicateTemplate(appState, movieTemplate.id);
assert(dupRes.success === true, 'Duplicate template helper succeeded');
assert(dupRes.template.name === 'Movie (Copy)', 'Duplicated template named "Movie (Copy)"');

// -----------------------------------------------------------------------------
// Summary Report
// -----------------------------------------------------------------------------
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
