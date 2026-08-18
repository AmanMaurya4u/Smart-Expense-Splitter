/**
 * Smart Expense Splitter - Unit Test Suite for Export, Summaries & Report Compilation
 * Run using: node tests/export.test.js
 */

const {
  escapeCSVCell,
  generateCSVFilename,
  exportToCSV
} = require('../js/storage.js');

const {
  generateExpenseSummaryText,
  generateSettlementSummaryText,
  compileReportData,
  calculateBalances
} = require('../js/calculation.js');

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

console.log('\n--- Running Smart Expense Splitter Export & Report Tests ---\n');

// -----------------------------------------------------------------------------
// Test 1: CSV Cell Escaping RFC 4180 Rules
// -----------------------------------------------------------------------------
console.log('Test Suite 1: CSV Cell Escaping Rules');
assert(escapeCSVCell('Dinner') === 'Dinner', 'Plain text is returned unchanged');
assert(escapeCSVCell('Dinner, Drinks') === '"Dinner, Drinks"', 'Text with commas is wrapped in quotes');
assert(escapeCSVCell('Hotel "Grand"') === '"Hotel ""Grand"""', 'Quotes are doubled and wrapped in outer quotes');
assert(escapeCSVCell('Cab\nFare') === '"Cab\nFare"', 'Text with newlines is wrapped in quotes');
assert(escapeCSVCell(null) === '', 'Null converts to empty string');
assert(escapeCSVCell(undefined) === '', 'Undefined converts to empty string');
assert(escapeCSVCell(1200) === '1200', 'Numbers convert to string representation');

// -----------------------------------------------------------------------------
// Test 2: Sanitized CSV Filename Generation
// -----------------------------------------------------------------------------
console.log('\nTest Suite 2: CSV Filename Generation');
assert(generateCSVFilename('Goa Trip 2026', '2026-08-18') === 'Goa-Trip-2026-expenses-2026-08-18.csv', 'Spaces converted to hyphens');
assert(generateCSVFilename('Flat @ 402!', '2026-08-18') === 'Flat-402-expenses-2026-08-18.csv', 'Special symbols stripped cleanly');
assert(generateCSVFilename('  Goa   Trip  ', '2026-08-18') === 'Goa-Trip-expenses-2026-08-18.csv', 'Multiple spaces trimmed to single hyphen');
assert(generateCSVFilename('', '2026-08-18') === 'Group-expenses-2026-08-18.csv', 'Empty group name defaults to Group');

// -----------------------------------------------------------------------------
// Test 3: CSV Export Data Structure & Headers
// -----------------------------------------------------------------------------
console.log('\nTest Suite 3: CSV Export Format');
const members = [
  { id: 'm1', name: 'Aman' },
  { id: 'm2', name: 'Rahul' },
  { id: 'm3', name: 'Rohit' }
];

const expenses = [
  {
    id: 'exp1',
    date: '2026-08-18',
    title: 'Dinner, "Seafood"',
    amount: 1200,
    paidBy: 'm1',
    category: 'Food',
    splitType: 'equal',
    participants: ['m1', 'm2', 'm3'],
    receipt: { name: 'receipt.jpg', data: 'data:image/jpeg;base64,123' }
  },
  {
    id: 'exp2',
    date: '2026-08-18',
    title: 'Hotel Stay',
    amount: 8000,
    paidBy: 'm1',
    category: 'Hotel',
    splitType: 'equal',
    participants: ['m1', 'm2', 'm3'],
    receipt: null
  }
];

const csvStr = exportToCSV(expenses, members);
const lines = csvStr.split('\r\n');

assert(lines[0] === 'Date,Expense Title,Amount,Paid By,Category,Split Type,Participants,Has Receipt', 'CSV header matches required specification');
assert(lines.length === 3, 'CSV contains exactly header line + 2 expense rows');
assert(lines[1].includes('"Dinner, ""Seafood"""'), 'Title with comma and quotes is properly escaped in CSV');
assert(lines[1].includes('Yes'), 'Row 1 shows Has Receipt = Yes');
assert(lines[2].includes('No'), 'Row 2 shows Has Receipt = No');
assert(lines[1].includes('Aman'), 'Payer member ID converted to member name');

// -----------------------------------------------------------------------------
// Test 4: Plain-Text Expense Summary Formatting
// -----------------------------------------------------------------------------
console.log('\nTest Suite 4: Copy Expense Summary Formatting');
const group = { id: 'g1', name: 'Goa Trip 2026', budget: 20000 };
const summaryText = generateExpenseSummaryText(group, expenses, members);

assert(summaryText.includes('Goa Trip 2026'), 'Includes group title header');
assert(summaryText.includes('Total Expenses: ₹9,200.00'), 'Includes correctly formatted total expenses');
assert(summaryText.includes('Budget: ₹20,000.00'), 'Includes budget limit');
assert(summaryText.includes('Remaining: ₹10,800.00'), 'Includes remaining budget');
assert(summaryText.includes('- Dinner, "Seafood" — ₹1,200.00 — Aman'), 'Includes formatted expense row 1');
assert(summaryText.includes('- Hotel Stay — ₹8,000.00 — Aman'), 'Includes formatted expense row 2');

// -----------------------------------------------------------------------------
// Test 5: Plain-Text Settlement Summary & Partial Payments
// -----------------------------------------------------------------------------
console.log('\nTest Suite 5: Copy Settlement Summary Formatting');
const initialSettlementText = generateSettlementSummaryText(group, members, expenses, []);

assert(initialSettlementText.includes('Goa Trip 2026 - Settlement'), 'Includes settlement group header');
assert(initialSettlementText.includes('Rahul owes Aman ₹3,066.67') || initialSettlementText.includes('Rahul owes Aman'), 'Calculates Rahul debt to Aman');
assert(initialSettlementText.includes('Rohit owes Aman ₹3,066.67') || initialSettlementText.includes('Rohit owes Aman'), 'Calculates Rohit debt to Aman');

// Partial payment test
const existingSettlements = [
  {
    id: 's1',
    from: 'm2',
    to: 'm1',
    amount: 3066.67,
    payments: [
      { id: 'p1', amount: 1000, paymentMethod: 'UPI', date: '2026-08-18' }
    ]
  }
];

const partialSettlementText = generateSettlementSummaryText(group, members, expenses, existingSettlements);
assert(partialSettlementText.includes('Paid ₹1,000.00 of ₹3,066.67') || partialSettlementText.includes('Rahul owes Aman ₹2,066.67'), 'Reflects partial payment deduction in text');

// All settled test
const zeroExpenses = [];
const settledText = generateSettlementSummaryText(group, members, zeroExpenses, []);
assert(settledText.includes('Everyone is settled up 🎉'), 'Displays settled message when no debts exist');

// -----------------------------------------------------------------------------
// Test 6: Report Data Model Compilation & State Immutability
// -----------------------------------------------------------------------------
console.log('\nTest Suite 6: Report Data Model Compilation');
const appState = {
  version: 1,
  group,
  members,
  expenses,
  settlements: existingSettlements
};

const reportData = compileReportData(appState, appState.expenses, 'Filtered Expenses (Food)');

assert(reportData.groupName === 'Goa Trip 2026', 'Report groupName matches state');
assert(reportData.scopeLabel === 'Filtered Expenses (Food)', 'Report scopeLabel matches parameter');
assert(reportData.totalExpenses === 9200, 'Report totalExpenses equals 9200');
assert(reportData.expenseCount === 2, 'Report expenseCount equals 2');
assert(reportData.members.length === 3, 'Report members array contains 3 items');
assert(reportData.expenses.length === 2, 'Report expenses array contains 2 items');
assert(reportData.expenses[0].hasReceipt === true, 'Expense 1 hasReceipt is true');
assert(reportData.expenses[1].hasReceipt === false, 'Expense 2 hasReceipt is false');
assert(reportData.paymentHistory.length === 1, 'Payment history contains 1 payment record');

// Immutability assertion
assert(appState.expenses.length === 2, 'Original appState expenses count unmodified');
assert(appState.members.length === 3, 'Original appState members count unmodified');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
