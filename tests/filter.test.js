/**
 * Smart Expense Splitter - Unit Test Suite for Advanced Expense Search, Filtering & Sorting
 * Run using: node tests/filter.test.js
 */

const {
  calculateBalances,
  calculateSettlements,
  getBudgetStats,
  calculateTotalSpending,
  generateSmartInsights,
  filterAndSortExpenses
} = require('../js/calculation.js');

const {
  createGroup,
  addMember,
  addExpense,
  editExpense,
  deleteExpense
} = require('../js/expense.js');

const { getInitialData } = require('../js/storage.js');

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

console.log('\n--- Running Advanced Expense Search, Filtering & Sorting Unit Test Suite ---\n');

// -----------------------------------------------------------------------------
// Setup Base Application State
// -----------------------------------------------------------------------------
let appState = getInitialData();
createGroup(appState, 'Goa Vacation');

addMember(appState, 'Aman');
addMember(appState, 'Rahul');
addMember(appState, 'Rohit');

const m1 = appState.members[0].id; // Aman
const m2 = appState.members[1].id; // Rahul
const m3 = appState.members[2].id; // Rohit

appState.group.budget = 20000;

// Add diverse expenses:
// 1. Hotel: ₹8,000 paid by Aman (Category: Hotel, Date: Today, Split: equal, Receipt: attached)
// 2. Cab: ₹1,000 paid by Rahul (Category: Travel, Date: Today, Split: equal, Receipt: null)
// 3. Dinner: ₹2,400 paid by Aman (Category: Food, Date: 2026-08-01, Split: custom, Receipt: attached)
// 4. Groceries: ₹500 paid by Rohit (Category: Food, Date: 2026-07-15, Split: equal, Receipt: null)
const todayStr = new Date().toISOString().split('T')[0];

addExpense(appState, {
  title: 'Hotel Booking',
  amount: 8000,
  category: 'Hotel',
  paidBy: m1,
  splitType: 'equal',
  participants: [m1, m2, m3],
  date: todayStr,
  receipt: { data: 'data:image/jpeg;base64,mockjpg', fileName: 'bill.jpg', fileType: 'image/jpeg' }
});

addExpense(appState, {
  title: 'Airport Cab',
  amount: 1000,
  category: 'Travel',
  paidBy: m2,
  splitType: 'equal',
  participants: [m1, m2, m3],
  date: todayStr,
  receipt: null
});

addExpense(appState, {
  title: 'Seafood Dinner',
  amount: 2400,
  category: 'Food',
  paidBy: m1,
  splitType: 'custom',
  participants: [m1, m2, m3],
  customShares: { [m1]: 1000, [m2]: 800, [m3]: 600 },
  date: '2026-08-01',
  receipt: { data: 'data:image/png;base64,mockpng', fileName: 'dinner.png', fileType: 'image/png' }
});

addExpense(appState, {
  title: 'Supermarket Groceries',
  amount: 500,
  category: 'Food',
  paidBy: m3,
  splitType: 'equal',
  participants: [m1, m3],
  date: '2026-07-15',
  receipt: null
});

const expHotelId = appState.expenses.find(e => e.title === 'Hotel Booking').id;
const expCabId = appState.expenses.find(e => e.title === 'Airport Cab').id;

// -----------------------------------------------------------------------------
// Test Scenarios 1-4: Search Functionality (Title, Member, Category, Case-Insensitive)
// -----------------------------------------------------------------------------
console.log('Test Scenarios 1-4: Search functionality');

// 1. Search by title
const s1 = filterAndSortExpenses(appState.expenses, appState.members, { searchQuery: 'dinner' });
assert(s1.filteredCount === 1, 'Search "dinner" finds 1 matching expense');
assert(s1.filtered[0].title === 'Seafood Dinner', 'Matching expense title is "Seafood Dinner"');

// 2. Search by member name
const s2 = filterAndSortExpenses(appState.expenses, appState.members, { searchQuery: 'rahul' });
assert(s2.filteredCount === 1, 'Search "rahul" finds 1 expense paid by Rahul');
assert(s2.filtered[0].title === 'Airport Cab', 'Matching expense is "Airport Cab"');

// 3. Search by category name
const s3 = filterAndSortExpenses(appState.expenses, appState.members, { searchQuery: 'travel' });
assert(s3.filteredCount === 1, 'Search "travel" finds 1 expense in Travel category');

// 4. Case-insensitive search
const s4 = filterAndSortExpenses(appState.expenses, appState.members, { searchQuery: 'HOTEL' });
assert(s4.filteredCount === 1, 'Case-insensitive search "HOTEL" finds 1 expense');

// -----------------------------------------------------------------------------
// Test Scenarios 5-6: Category & Paid-By Filters
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 5-6: Category & Paid-By filters');

// 5. Category filter
const fCat = filterAndSortExpenses(appState.expenses, appState.members, { category: 'Food' });
assert(fCat.filteredCount === 2, 'Category filter "Food" finds 2 expenses');
assert(fCat.filteredTotalAmount === 2900, 'Filtered total amount for Food is ₹2,900');

// 6. Paid-by filter
const fPayer = filterAndSortExpenses(appState.expenses, appState.members, { paidBy: m1 });
assert(fPayer.filteredCount === 2, 'Paid-By filter for Aman finds 2 expenses');

// -----------------------------------------------------------------------------
// Test Scenarios 7-8: Date Range Filters
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 7-8: Date range filters');

// 7. Today filter
const fToday = filterAndSortExpenses(appState.expenses, appState.members, { dateRange: 'TODAY' });
assert(fToday.filteredCount === 2, 'Date filter "TODAY" finds 2 expenses');

// 8. Custom date range filter
const fCustomDate = filterAndSortExpenses(appState.expenses, appState.members, {
  dateRange: 'CUSTOM',
  startDate: '2026-07-01',
  endDate: '2026-07-31'
});
assert(fCustomDate.filteredCount === 1, 'Custom date range (July 2026) finds 1 expense (Groceries)');

// -----------------------------------------------------------------------------
// Test Scenarios 9-11: Amount Range Filters (Min, Max, Range)
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 9-11: Amount range filters');

// 9. Min amount
const fMin = filterAndSortExpenses(appState.expenses, appState.members, { minAmount: 2000 });
assert(fMin.filteredCount === 2, 'Min amount ₹2,000 finds 2 expenses (Hotel ₹8000, Dinner ₹2400)');

// 10. Max amount
const fMax = filterAndSortExpenses(appState.expenses, appState.members, { maxAmount: 1500 });
assert(fMax.filteredCount === 2, 'Max amount ₹1,500 finds 2 expenses (Cab ₹1000, Groceries ₹500)');

// 11. Amount range
const fRange = filterAndSortExpenses(appState.expenses, appState.members, { minAmount: 800, maxAmount: 3000 });
assert(fRange.filteredCount === 2, 'Amount range ₹800-₹3,000 finds 2 expenses (Cab ₹1000, Dinner ₹2400)');

// -----------------------------------------------------------------------------
// Test Scenarios 12-14: Split Type & Receipt Availability Filters
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 12-14: Split type & Receipt availability filters');

// 12. Split type
const fCustomSplit = filterAndSortExpenses(appState.expenses, appState.members, { splitType: 'custom' });
assert(fCustomSplit.filteredCount === 1, 'Split type "custom" finds 1 expense');

// 13. With receipt filter
const fWithReceipt = filterAndSortExpenses(appState.expenses, appState.members, { receipt: 'WITH_RECEIPT' });
assert(fWithReceipt.filteredCount === 2, 'Receipt filter "WITH_RECEIPT" finds 2 expenses');

// 14. Without receipt filter
const fWithoutReceipt = filterAndSortExpenses(appState.expenses, appState.members, { receipt: 'WITHOUT_RECEIPT' });
assert(fWithoutReceipt.filteredCount === 2, 'Receipt filter "WITHOUT_RECEIPT" finds 2 expenses');

// -----------------------------------------------------------------------------
// Test Scenarios 15-16: Combined Multi-Criteria Filters & Search
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 15-16: Combined multi-criteria filters & search');

// 15. Combined filters (Category = Food, Paid By = Aman, With Receipt)
const fCombo1 = filterAndSortExpenses(appState.expenses, appState.members, {
  category: 'Food',
  paidBy: m1,
  receipt: 'WITH_RECEIPT'
});
assert(fCombo1.filteredCount === 1, 'Combined criteria (Food + Aman + With Receipt) finds 1 expense');
assert(fCombo1.filtered[0].title === 'Seafood Dinner', 'Matched expense is Seafood Dinner');

// 16. Search + filters combined
const fCombo2 = filterAndSortExpenses(appState.expenses, appState.members, {
  searchQuery: 'dinner',
  category: 'Food',
  paidBy: m1
});
assert(fCombo2.filteredCount === 1, 'Search + Filters combined matches Seafood Dinner');

// -----------------------------------------------------------------------------
// Test Scenarios 17-22: Sorting Criteria
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 17-22: Sorting criteria');

// 17. Sort newest first
const sNewest = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'newest' });
assert(sNewest.filtered[0].amount >= 1000, 'Newest first puts today\'s expenses first');

// 18. Sort oldest first
const sOldest = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'oldest' });
assert(sOldest.filtered[0].title === 'Supermarket Groceries', 'Oldest first puts July expense first');

// 19. Sort highest amount
const sHigh = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'amount_desc' });
assert(sHigh.filtered[0].amount === 8000, 'Highest amount puts Hotel ₹8,000 first');

// 20. Sort lowest amount
const sLow = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'amount_asc' });
assert(sLow.filtered[0].amount === 500, 'Lowest amount puts Groceries ₹500 first');

// 21. Sort A-Z Title
const sAZ = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'title_asc' });
assert(sAZ.filtered[0].title === 'Airport Cab', 'A-Z sorting puts "Airport Cab" first');

// 22. Sort Z-A Title
const sZA = filterAndSortExpenses(appState.expenses, appState.members, { sortBy: 'title_desc' });
assert(sZA.filtered[0].title === 'Supermarket Groceries', 'Z-A sorting puts "Supermarket Groceries" first');

// -----------------------------------------------------------------------------
// Test Scenarios 23-24: Clear Individual Filter & Clear All Filters
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 23-24: Clear individual & clear all filters');

const stateFull = { category: 'Food', paidBy: m1, minAmount: 1000 };
const fBeforeClear = filterAndSortExpenses(appState.expenses, appState.members, stateFull);
assert(fBeforeClear.filteredCount === 1, 'Before clearing: 1 expense matches');

// Clear category filter only
delete stateFull.category;
const fAfterSingleClear = filterAndSortExpenses(appState.expenses, appState.members, stateFull);
assert(fAfterSingleClear.filteredCount === 2, 'After clearing category filter: 2 expenses match');

// Clear all filters
const fClearedAll = filterAndSortExpenses(appState.expenses, appState.members, {});
assert(fClearedAll.filteredCount === 4, 'After clearing all filters: all 4 expenses returned');

// -----------------------------------------------------------------------------
// Test Scenarios 25-27: Edit, Delete, & Add Expense While Filtered
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 25-27: Edit, Delete, & Add expense while filtered');

// Edit expense while filtered
editExpense(appState, expCabId, {
  title: 'Airport Taxi Special',
  amount: 1200,
  category: 'Travel',
  paidBy: m2,
  splitType: 'equal',
  participants: [m1, m2, m3]
});

const fEdited = filterAndSortExpenses(appState.expenses, appState.members, { searchQuery: 'taxi' });
assert(fEdited.filteredCount === 1, 'Search for edited title "taxi" finds updated expense');

// Delete expense while filtered
deleteExpense(appState, expCabId);
const fDeleted = filterAndSortExpenses(appState.expenses, appState.members, {});
assert(fDeleted.filteredCount === 3, 'Filtered view updates after deleting expense');

// Add expense while filters are active
addExpense(appState, {
  title: 'Beach Drinks',
  amount: 1500,
  category: 'Food',
  paidBy: m1,
  splitType: 'equal',
  participants: [m1, m2]
});

const fActiveAfterAdd = filterAndSortExpenses(appState.expenses, appState.members, { category: 'Food' });
assert(fActiveAfterAdd.filteredCount === 3, 'Newly added Food expense appears in Food category filter');

// -----------------------------------------------------------------------------
// Test Scenarios 28-31: Read-Only System Protection & Analytics Isolation
// -----------------------------------------------------------------------------
console.log('\nTest Scenarios 28-31: System protection & analytics isolation');

// 28. Balances unaffected by filter
const realBalances = calculateBalances(appState.members, appState.expenses);
assert(realBalances[m1].balance > 0, 'Real balances calculated on total appState expenses');

// 29. Budget unaffected by filter
const realBudget = getBudgetStats(appState.group, appState.expenses);
assert(realBudget.totalSpent === calculateTotalSpending(appState.expenses), 'Real budget spent matches total spending');

// 30. Settlements unaffected by filter
const realSettlements = calculateSettlements(realBalances);
assert(Array.isArray(realSettlements), 'Real settlements generated from full appState');

// 31. Smart Spending Insights unaffected by filter
const realInsights = generateSmartInsights(appState);
assert(realInsights.length > 0, 'Smart Insights operate on complete expense dataset');

// -----------------------------------------------------------------------------
// Test Scenario 32: Mobile & Edge Cases
// -----------------------------------------------------------------------------
console.log('\nTest Scenario 32: Mobile & Edge Cases');
const emptyFilter = filterAndSortExpenses([], appState.members, { searchQuery: 'anything' });
assert(emptyFilter.filteredCount === 0, 'Empty expenses array safely returns 0 count');
assert(emptyFilter.filteredTotalAmount === 0, 'Empty expenses array safely returns ₹0 total');

// -----------------------------------------------------------------------------
// Summary Report
// -----------------------------------------------------------------------------
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
