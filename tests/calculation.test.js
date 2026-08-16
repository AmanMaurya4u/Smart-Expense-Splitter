/**
 * Smart Expense Splitter - Unit Test Suite for Business & Calculation Logic
 * Run using: node tests/calculation.test.js
 */

const {
  calculateEqualSplit,
  calculateCustomSplit,
  calculateBalances,
  calculateSettlements
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

console.log('\n--- Running Smart Expense Splitter Calculation Tests ---\n');

// -----------------------------------------------------------------------------
// Test 1: Equal Split - Exact Division
// -----------------------------------------------------------------------------
console.log('Test Suite 1: Equal Split (Exact Division)');
const eq1 = calculateEqualSplit(1200, ['m1', 'm2', 'm3']);
assert(eq1['m1'] === 400, 'Member 1 share should be 400');
assert(eq1['m2'] === 400, 'Member 2 share should be 400');
assert(eq1['m3'] === 400, 'Member 3 share should be 400');
const sumEq1 = Object.values(eq1).reduce((a, b) => a + b, 0);
assert(Math.abs(sumEq1 - 1200) < 0.001, 'Sum of shares equals total amount (1200)');

// -----------------------------------------------------------------------------
// Test 2: Equal Split - Remainder Paise Distribution (1000 / 3)
// -----------------------------------------------------------------------------
console.log('\nTest Suite 2: Equal Split (Remainder Paise Rounding)');
const eq2 = calculateEqualSplit(1000, ['m1', 'm2', 'm3']);
assert(eq2['m1'] === 333.34, 'Member 1 receives extra 1 paisa (333.34)');
assert(eq2['m2'] === 333.33, 'Member 2 receives base (333.33)');
assert(eq2['m3'] === 333.33, 'Member 3 receives base (333.33)');
const sumEq2 = Object.values(eq2).reduce((a, b) => a + b, 0);
assert(Math.abs(sumEq2 - 1000) < 0.001, 'Sum of shares equals exact total amount (1000.00)');

// -----------------------------------------------------------------------------
// Test 3: Custom Split Allocation Validation
// -----------------------------------------------------------------------------
console.log('\nTest Suite 3: Custom Split Validation');
const customValid = calculateCustomSplit(1000, { m1: 500, m2: 300, m3: 200 });
assert(customValid.isValid === true, 'Exact sum (500+300+200=1000) is valid');
assert(customValid.remaining === 0, 'Remaining balance is 0');

const customInvalid = calculateCustomSplit(1000, { m1: 400, m2: 300 });
assert(customInvalid.isValid === false, 'Incomplete sum (700/1000) is invalid');
assert(customInvalid.remaining === 300, 'Remaining unallocated balance is 300');

// -----------------------------------------------------------------------------
// Test 4: Net Balance Accumulation
// -----------------------------------------------------------------------------
console.log('\nTest Suite 4: Net Balance Calculation');
const members = [
  { id: 'm1', name: 'Aman' },
  { id: 'm2', name: 'Rahul' },
  { id: 'm3', name: 'Rohit' }
];

const expenses = [
  {
    id: 'exp1',
    amount: 1200,
    paidBy: 'm1',
    splitType: 'equal',
    participants: ['m1', 'm2', 'm3']
  }
];

const balances = calculateBalances(members, expenses);
assert(balances['m1'].paid === 1200, 'Aman paid 1200');
assert(balances['m1'].share === 400, 'Aman share is 400');
assert(balances['m1'].balance === 800, 'Aman net balance is +800');

assert(balances['m2'].paid === 0, 'Rahul paid 0');
assert(balances['m2'].share === 400, 'Rahul share is 400');
assert(balances['m2'].balance === -400, 'Rahul net balance is -400');

assert(balances['m3'].balance === -400, 'Rohit net balance is -400');

// -----------------------------------------------------------------------------
// Test 5: Greedy Debt Simplification Algorithm
// -----------------------------------------------------------------------------
console.log('\nTest Suite 5: Settlement Minimization Algorithm');
const settlements = calculateSettlements(balances);
assert(settlements.length === 2, 'PRD Worked Example generates exactly 2 settlements instead of 3+');
assert(settlements[0].from === 'm2' || settlements[0].from === 'm3', 'Debtor pays creditor');
assert(settlements[0].amount === 400, 'Settlement amount is 400');

const totalSettledAmt = settlements.reduce((a, b) => a + b.amount, 0);
assert(totalSettledAmt === 800, 'Total settled amount equals total credit (+800)');

// -----------------------------------------------------------------------------
// Test 6: Zero Balance Edge Case
// -----------------------------------------------------------------------------
console.log('\nTest Suite 6: Zero Balance Edge Case');
const zeroBalances = {
  m1: { memberId: 'm1', name: 'Aman', balance: 0 },
  m2: { memberId: 'm2', name: 'Rahul', balance: 0 }
};
const zeroSettlements = calculateSettlements(zeroBalances);
assert(zeroSettlements.length === 0, 'Zero balances result in empty settlement array');

// Summary Report
console.log(`\n=================================================`);
console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed`);
console.log(`=================================================\n`);

if (failCount > 0) {
  process.exit(1);
}
