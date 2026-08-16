/**
 * Smart Expense Splitter - Storage Management Module
 * Handles localStorage persistence, schema migration, CSV export, and data reset.
 */

const STORAGE_KEY = 'expenseSplitter.data';
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Initial empty data structure template.
 */
function getInitialData() {
  return {
    version: CURRENT_SCHEMA_VERSION,
    theme: 'light',
    group: null, // { id, name, currentUserId, budget, createdAt }
    members: [], // [{ id, name, contact, createdAt }]
    expenses: [], // [{ id, title, amount, category, paidBy, splitType, participants, customShares, date, createdAt }]
    settlements: [], // [{ id, from, to, amount, status, payments, paidAt }]
    activities: [] // [{ id, type, category, message, actor, amount, relatedEntityId, timestamp }]
  };
}

/**
 * Checks if localStorage is supported and accessible.
 * @returns {boolean}
 */
function isStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Loads and parses application state from localStorage.
 * Runs schema migration if necessary.
 * @returns {Object} Application state object
 */
function loadData() {
  if (!isStorageAvailable()) {
    console.warn('localStorage is not available. Session data will not persist.');
    return getInitialData();
  }

  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
      return getInitialData();
    }

    const parsedData = JSON.parse(rawData);
    return migrateData(parsedData);
  } catch (e) {
    console.error('Failed to parse stored data:', e);
    return getInitialData();
  }
}

/**
 * Saves application state to localStorage.
 * @param {Object} data - Application state object
 * @returns {boolean} Success status
 */
function saveData(data) {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    const jsonString = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, jsonString);
    return true;
  } catch (e) {
    console.error('Failed to save data to localStorage:', e);
    return false;
  }
}

/**
 * Schema migration stub function.
 * @param {Object} data 
 * @returns {Object} Migrated data
 */
function migrateData(data) {
  if (!data || typeof data !== 'object') {
    return getInitialData();
  }

  // Version check and progressive migrations
  if (!data.version || data.version < CURRENT_SCHEMA_VERSION) {
    data.version = CURRENT_SCHEMA_VERSION;
  }

  // Ensure default structures exist
  if (!Array.isArray(data.members)) data.members = [];
  if (!Array.isArray(data.expenses)) data.expenses = [];
  if (!Array.isArray(data.settlements)) data.settlements = [];
  if (!Array.isArray(data.activities)) data.activities = [];
  if (!data.theme) data.theme = 'light';
  if (data.group && typeof data.group.budget === 'undefined') {
    data.group.budget = null;
  }

  // Backward compatibility migration for legacy settlements without payments history
  data.settlements.forEach(s => {
    if (!Array.isArray(s.payments)) {
      s.payments = [];
      if (s.status === 'paid' && s.amount > 0) {
        s.payments.push({
          id: `pay_legacy_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          amount: s.amount,
          paymentMethod: 'Other',
          note: 'Legacy full payment',
          date: s.paidAt ? s.paidAt.split('T')[0] : new Date().toISOString().split('T')[0]
        });
      }
    }
  });

  return data;
}

/**
 * Clears all application data from localStorage.
 */
function clearAllData() {
  if (isStorageAvailable()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
    }
  }
}

/**
 * Converts expenses and member mappings into a formatted CSV string.
 * @param {Array<Object>} expenses 
 * @param {Array<Object>} members 
 * @returns {string} CSV content
 */
function exportToCSV(expenses, members) {
  const memberMap = {};
  members.forEach(m => {
    memberMap[m.id] = m.name;
  });

  const headers = ['ID', 'Date', 'Title', 'Category', 'Amount (INR)', 'Paid By', 'Split Type', 'Participants', 'Created At'];
  const rows = [headers];

  expenses.forEach(exp => {
    const paidByName = memberMap[exp.paidBy] || exp.paidBy || 'Unknown';
    const participantNames = (exp.participants || [])
      .map(id => memberMap[id] || id)
      .join('; ');

    const row = [
      exp.id,
      exp.date || '',
      `"${(exp.title || '').replace(/"/g, '""')}"`,
      exp.category || 'Other',
      exp.amount,
      `"${paidByName.replace(/"/g, '""')}"`,
      exp.splitType || 'equal',
      `"${participantNames.replace(/"/g, '""')}"`,
      exp.createdAt || ''
    ];
    rows.push(row);
  });

  return rows.map(r => r.join(',')).join('\n');
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STORAGE_KEY,
    getInitialData,
    isStorageAvailable,
    loadData,
    saveData,
    migrateData,
    clearAllData,
    exportToCSV
  };
}
