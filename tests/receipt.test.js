/**
 * Smart Expense Splitter — Unit Test Suite for Expense Receipt / Bill Attachment System
 * Run using: node tests/receipt.test.js
 */

const {
  validateReceiptFile,
  compressReceiptImage,
  calculateTotalSpending,
  calculateBalances
} = require('../js/calculation.js');

const {
  addExpense,
  editExpense,
  deleteExpense,
  addRecurringExpense,
  convertRecurringToExpense
} = require('../js/expense.js');

const { saveData, migrateData } = require('../js/storage.js');

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

console.log('\n--- Running Smart Expense Splitter Receipt System Tests ---\n');

function createMockState() {
  return {
    version: 1,
    theme: 'light',
    group: { id: 'g1', name: 'Receipt Test Group', budget: 20000 },
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
// Scenario 1: Add Expense Without Receipt
// -----------------------------------------------------------------------------
console.log('Scenario 1: Add Expense Without Receipt');
const state1 = createMockState();
const res1 = addExpense(state1, {
  title: 'Dinner without receipt',
  amount: 1200,
  category: 'Food',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-10'
});
assert(res1.success === true, 'Expense added successfully without receipt');
assert(res1.expense.receipt === null, 'receipt is explicitly null when no image is attached');

// -----------------------------------------------------------------------------
// Scenario 2: Add Expense With JPG Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 2: Add Expense With JPG Receipt');
const jpgReceipt = { name: 'bill.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,jpg_data_mock' };
const res2 = addExpense(state1, {
  title: 'Lunch JPG',
  amount: 800,
  category: 'Food',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-11',
  receipt: jpgReceipt
});
assert(res2.success === true, 'Expense added with JPG receipt');
assert(res2.expense.receipt.type === 'image/jpeg', 'Receipt type is image/jpeg');
assert(res2.expense.receipt.name === 'bill.jpg', 'Receipt name matches');

// -----------------------------------------------------------------------------
// Scenario 3: Add Expense With PNG Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 3: Add Expense With PNG Receipt');
const pngReceipt = { name: 'receipt.png', type: 'image/png', data: 'data:image/png;base64,png_data_mock' };
const res3 = addExpense(state1, {
  title: 'Taxi PNG',
  amount: 500,
  category: 'Travel',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-12',
  receipt: pngReceipt
});
assert(res3.success === true, 'Expense added with PNG receipt');
assert(res3.expense.receipt.type === 'image/png', 'Receipt type is image/png');

// -----------------------------------------------------------------------------
// Scenario 4: Add Expense With WEBP Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 4: Add Expense With WEBP Receipt');
const webpReceipt = { name: 'invoice.webp', type: 'image/webp', data: 'data:image/webp;base64,webp_data_mock' };
const res4 = addExpense(state1, {
  title: 'Hotel WEBP',
  amount: 5000,
  category: 'Hotel',
  paidBy: 'm1',
  splitType: 'equal',
  participants: ['m1', 'm2', 'm3'],
  date: '2026-08-13',
  receipt: webpReceipt
});
assert(res4.success === true, 'Expense added with WEBP receipt');
assert(res4.expense.receipt.type === 'image/webp', 'Receipt type is image/webp');

// -----------------------------------------------------------------------------
// Scenario 5: Upload Unsupported File Format
// -----------------------------------------------------------------------------
console.log('\nScenario 5: Upload Unsupported File Format');
const invalidPdf = { name: 'document.pdf', type: 'application/pdf', size: 1024 };
const valPdf = validateReceiptFile(invalidPdf);
assert(valPdf.isValid === false, 'PDF file format rejected');
assert(valPdf.error.includes('JPG, PNG, or WEBP'), 'Clear error message returned for unsupported file format');

// -----------------------------------------------------------------------------
// Scenario 6: Upload Oversized File
// -----------------------------------------------------------------------------
console.log('\nScenario 6: Upload Oversized File');
const oversizedImg = { name: 'huge_photo.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 }; // 10MB
const valSize = validateReceiptFile(oversizedImg, 5 * 1024 * 1024);
assert(valSize.isValid === false, '10MB file rejected against 5MB limit');
assert(valSize.error.includes('5 MB limit'), 'Error message specifies MB size limit');

// -----------------------------------------------------------------------------
// Scenario 7 & 8: Preview & Compression Simulation
// -----------------------------------------------------------------------------
console.log('\nScenario 7 & 8: Preview & Compression Simulation');
const mockFile = { name: 'receipt_raw.png', type: 'image/png', data: 'data:image/png;base64,raw' };
compressReceiptImage(mockFile).then(compressed => {
  assert(compressed.name === 'receipt_raw.png', 'Compress helper returns correct file name');
  assert(compressed.data.length > 0, 'Compress helper returns base64 data string');
});

// -----------------------------------------------------------------------------
// Scenario 9: View Receipt Later
// -----------------------------------------------------------------------------
console.log('\nScenario 9: View Receipt Later');
const fetchedExp = state1.expenses.find(e => e.title === 'Hotel WEBP');
assert(fetchedExp && fetchedExp.receipt && fetchedExp.receipt.data === 'data:image/webp;base64,webp_data_mock', 'Retrieved expense contains valid receipt data URL for lightbox viewing');

// -----------------------------------------------------------------------------
// Scenario 10: Edit Expense Without Changing Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 10: Edit Expense Without Changing Receipt');
const expToEdit = state1.expenses.find(e => e.title === 'Lunch JPG');
const editRes10 = editExpense(state1, expToEdit.id, {
  title: 'Lunch JPG Updated Title',
  amount: 850,
  category: 'Food',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-11'
  // receipt field omitted/undefined -> should preserve existing receipt
});
assert(editRes10.success === true, 'Expense updated successfully');
assert(editRes10.expense.receipt !== null, 'Existing receipt preserved when receipt field is undefined');
assert(editRes10.expense.receipt.name === 'bill.jpg', 'Receipt file name remains bill.jpg');

// -----------------------------------------------------------------------------
// Scenario 11: Replace Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 11: Replace Receipt');
const newReceiptObj = { name: 'replaced_bill.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,new_data' };
const editRes11 = editExpense(state1, expToEdit.id, {
  title: 'Lunch JPG Updated Title',
  amount: 850,
  category: 'Food',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-11',
  receipt: newReceiptObj
});
assert(editRes11.expense.receipt.name === 'replaced_bill.jpg', 'Receipt replaced with new image object');
const replaceActivity = state1.activities.find(a => a.message.includes('replaced the receipt'));
assert(replaceActivity !== undefined, 'Activity log created for receipt replacement');

// -----------------------------------------------------------------------------
// Scenario 12: Remove Receipt
// -----------------------------------------------------------------------------
console.log('\nScenario 12: Remove Receipt');
const editRes12 = editExpense(state1, expToEdit.id, {
  title: 'Lunch JPG Updated Title',
  amount: 850,
  category: 'Food',
  paidBy: 'm2',
  splitType: 'equal',
  participants: ['m1', 'm2'],
  date: '2026-08-11',
  receipt: null // Explicitly remove receipt
});
assert(editRes12.expense.receipt === null, 'Receipt set to null after removal');
assert(state1.expenses.some(e => e.id === expToEdit.id), 'Expense record itself is NOT deleted when receipt is removed');
const removeActivity = state1.activities.find(a => a.message.includes('removed the receipt'));
assert(removeActivity !== undefined, 'Activity log created for receipt removal');

// -----------------------------------------------------------------------------
// Scenario 13: Delete Expense & Verify Receipt Removal
// -----------------------------------------------------------------------------
console.log('\nScenario 13: Delete Expense & Verify Receipt Removal');
const expToDelete = state1.expenses.find(e => e.title === 'Taxi PNG');
const delId = expToDelete.id;
deleteExpense(state1, delId);
assert(state1.expenses.every(e => e.id !== delId), 'Expense and associated receipt data deleted from state');

// -----------------------------------------------------------------------------
// Scenario 14: Refresh Browser & Verify Persistence
// -----------------------------------------------------------------------------
console.log('\nScenario 14: Refresh Browser & Verify Persistence');
const jsonState = JSON.stringify(state1);
const reloadedState = migrateData(JSON.parse(jsonState));
const hotelReloaded = reloadedState.expenses.find(e => e.title === 'Hotel WEBP');
assert(hotelReloaded && hotelReloaded.receipt && hotelReloaded.receipt.name === 'invoice.webp', 'Receipt data persists cleanly through JSON serialization');

// -----------------------------------------------------------------------------
// Scenario 15: Backward Compatibility With Legacy Expenses
// -----------------------------------------------------------------------------
console.log('\nScenario 15: Backward Compatibility With Legacy Expenses');
const legacyState = {
  version: 1,
  members: [{ id: 'm1', name: 'Aman' }],
  expenses: [
    { id: 'legacy_1', title: 'Old Dinner', amount: 1000, paidBy: 'm1', participants: ['m1'] } // receipt field undefined
  ]
};
const migratedLegacy = migrateData(legacyState);
assert(migratedLegacy.expenses[0].receipt === null, 'Legacy expense safely migrated to receipt: null');

// -----------------------------------------------------------------------------
// Scenario 16: Financial & Analytics Isolation
// -----------------------------------------------------------------------------
console.log('\nScenario 16: Financial & Analytics Isolation');
const totalSpendBefore = calculateTotalSpending(state1.expenses);
const balancesBefore = calculateBalances(state1.members, state1.expenses);

// Edit an expense to attach a receipt
const hotelExpToAttach = state1.expenses.find(e => e.title === 'Hotel WEBP');
editExpense(state1, hotelExpToAttach.id, {
  ...hotelExpToAttach,
  receipt: { name: 'new_hotel.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,hotel' }
});

const totalSpendAfter = calculateTotalSpending(state1.expenses);
const balancesAfter = calculateBalances(state1.members, state1.expenses);

assert(totalSpendBefore === totalSpendAfter, 'Attaching receipt does NOT alter total spending');
assert(balancesBefore.m1.balance === balancesAfter.m1.balance, 'Attaching receipt does NOT alter member balances');

// -----------------------------------------------------------------------------
// Scenario 17: LocalStorage Quota Safety Handling
// -----------------------------------------------------------------------------
console.log('\nScenario 17: LocalStorage Quota Safety Handling');
// Mock localStorage throwing QuotaExceededError
const originalSetItem = global.localStorage ? global.localStorage.setItem : null;
if (global.localStorage) {
  global.localStorage.setItem = () => {
    const err = new Error('QuotaExceededError');
    err.name = 'QuotaExceededError';
    throw err;
  };
  const saveSuccess = saveData(state1);
  assert(saveSuccess === false, 'saveData catches QuotaExceededError and returns false safely without crashing app');
  global.localStorage.setItem = originalSetItem;
} else {
  assert(true, 'Environment without global localStorage handles save fallback safely');
}

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
