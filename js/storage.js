/**
 * Smart Expense Splitter - Storage Management Module
 * Handles localStorage persistence, schema migration, CSV export, and data reset.
 */

const STORAGE_KEY = 'expenseSplitter.data';
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Initial empty data structure template.
 */
function getInitialData() {
  return {
    version: CURRENT_SCHEMA_VERSION,
    theme: 'light',
    activeGroupId: null,
    groups: [],
    group: null, // Pointer reference to active group
    members: [], // Pointer reference to active group's members
    expenses: [], // Pointer reference to active group's expenses
    settlements: [], // Pointer reference to active group's settlements
    activities: [], // Pointer reference to active group's activities
    recurringExpenses: [], // Pointer reference to active group's recurring expenses
    templates: [] // Pointer reference to active group's templates
  };
}

/**
 * Synchronizes root pointer references (group, members, expenses, etc.) with active group.
 * @param {Object} appState 
 */
function syncActiveGroupProjections(appState) {
  if (!appState || typeof appState !== 'object') return;
  if (!Array.isArray(appState.groups)) appState.groups = [];

  let activeGroup = appState.groups.find(g => g.id === appState.activeGroupId);
  if (!activeGroup && appState.groups.length > 0) {
    activeGroup = appState.groups[0];
    appState.activeGroupId = activeGroup.id;
  }

  if (activeGroup) {
    if (!Array.isArray(activeGroup.members)) activeGroup.members = [];
    if (!Array.isArray(activeGroup.expenses)) activeGroup.expenses = [];
    if (!Array.isArray(activeGroup.settlements)) activeGroup.settlements = [];
    if (!Array.isArray(activeGroup.activities)) activeGroup.activities = [];
    if (!Array.isArray(activeGroup.recurringExpenses)) activeGroup.recurringExpenses = [];
    if (!Array.isArray(activeGroup.templates)) activeGroup.templates = [];

    // If root pointers were updated/reassigned directly (e.g. via .filter), update activeGroup first!
    if (appState.group === activeGroup) {
      if (Array.isArray(appState.members)) activeGroup.members = appState.members;
      if (Array.isArray(appState.expenses)) activeGroup.expenses = appState.expenses;
      if (Array.isArray(appState.settlements)) activeGroup.settlements = appState.settlements;
      if (Array.isArray(appState.activities)) activeGroup.activities = appState.activities;
      if (Array.isArray(appState.recurringExpenses)) activeGroup.recurringExpenses = appState.recurringExpenses;
      if (Array.isArray(appState.templates)) activeGroup.templates = appState.templates;
    }

    appState.group = activeGroup;
    appState.members = activeGroup.members;
    appState.expenses = activeGroup.expenses;
    appState.settlements = activeGroup.settlements;
    appState.activities = activeGroup.activities;
    appState.recurringExpenses = activeGroup.recurringExpenses;
    appState.templates = activeGroup.templates;
  } else {
    appState.activeGroupId = null;
    appState.group = null;
    appState.members = [];
    appState.expenses = [];
    appState.settlements = [];
    appState.activities = [];
    appState.recurringExpenses = [];
    appState.templates = [];
  }
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
    // Sync active group data back to groups array before persisting
    syncActiveGroupProjections(data);
    const jsonString = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, jsonString);
    return true;
  } catch (e) {
    const isQuotaError = e && (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014
    );
    if (isQuotaError) {
      console.warn('LocalStorage Quota Exceeded while saving app data:', e);
    } else {
      console.error('Failed to save data to localStorage:', e);
    }
    return false;
  }
}

/**
 * Schema migration function for multi-group state.
 * @param {Object} data 
 * @returns {Object} Migrated data
 */
function migrateData(data) {
  if (!data || typeof data !== 'object') {
    return getInitialData();
  }

  if (!data.theme) data.theme = 'light';
  data.version = CURRENT_SCHEMA_VERSION;

  // Detect single-group legacy schema
  const isLegacySingleGroup = !Array.isArray(data.groups) || data.groups.length === 0;

  if (isLegacySingleGroup) {
    const legacyGroupObj = data.group || { id: `group_${Date.now()}`, name: 'Default Group', budget: null };
    const migratedGroup = {
      id: legacyGroupObj.id || `group_${Date.now()}`,
      name: legacyGroupObj.name || 'Default Group',
      currentUserId: legacyGroupObj.currentUserId || null,
      budget: typeof legacyGroupObj.budget === 'number' ? legacyGroupObj.budget : null,
      createdAt: legacyGroupObj.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: Array.isArray(data.members) ? data.members : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      settlements: Array.isArray(data.settlements) ? data.settlements : [],
      activities: Array.isArray(data.activities) ? data.activities : [],
      recurringExpenses: Array.isArray(data.recurringExpenses) ? data.recurringExpenses : [],
      templates: Array.isArray(data.templates) ? data.templates : []
    };

    data.groups = [migratedGroup];
    data.activeGroupId = migratedGroup.id;
  }

  // Ensure every group inside groups array is properly structured
  data.groups.forEach(g => {
    if (!g.id) g.id = `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    if (!g.name) g.name = 'Group';
    if (!Array.isArray(g.members)) g.members = [];
    if (!Array.isArray(g.expenses)) g.expenses = [];
    if (!Array.isArray(g.settlements)) g.settlements = [];
    if (!Array.isArray(g.activities)) g.activities = [];
    if (!Array.isArray(g.recurringExpenses)) g.recurringExpenses = [];
    if (!Array.isArray(g.templates)) g.templates = [];
    if (typeof g.budget === 'undefined') g.budget = null;

    // Ensure expenses have receipt property
    g.expenses.forEach(e => {
      if (typeof e.receipt === 'undefined') e.receipt = null;
    });

    // Ensure settlements have payments history
    g.settlements.forEach(s => {
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
  });

  syncActiveGroupProjections(data);
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
 * Escapes a cell value safely for CSV export (RFC 4180 compliant).
 * Encloses values containing quotes, commas, or newlines in double quotes and doubles internal quotes.
 * @param {any} val 
 * @returns {string} Escaped cell string
 */
function escapeCSVCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a sanitized CSV filename based on group name and date.
 * @param {string} [groupName] 
 * @param {string} [dateStr] 
 * @returns {string} Filename string (e.g. Goa-Trip-2026-expenses-2026-08-18.csv)
 */
function generateCSVFilename(groupName, dateStr) {
  const safeName = (groupName || 'Group')
    .trim()
    .replace(/[^a-zA-Z0-9_\-\u0900-\u097F]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = dateStr || new Date().toISOString().split('T')[0];
  return `${safeName || 'Group'}-expenses-${date}.csv`;
}

/**
 * Converts expenses and member mappings into a formatted CSV string.
 * @param {Array<Object>} expenses 
 * @param {Array<Object>} members 
 * @returns {string} CSV content
 */
function exportToCSV(expenses, members) {
  const memberMap = {};
  (members || []).forEach(m => {
    memberMap[m.id] = m.name;
  });

  const headers = ['Date', 'Expense Title', 'Amount', 'Paid By', 'Category', 'Split Type', 'Participants', 'Has Receipt'];
  const rows = [headers.map(escapeCSVCell).join(',')];

  (expenses || []).forEach(exp => {
    const paidByName = memberMap[exp.paidBy] || exp.paidBy || 'Unknown';
    const participantNames = (exp.participants || [])
      .map(id => memberMap[id] || id)
      .join('; ');
    const hasReceipt = (exp.receipt && exp.receipt.data) ? 'Yes' : 'No';
    const splitTypeLabel = (exp.splitType || 'equal').toLowerCase() === 'custom' ? 'Custom' : 'Equal';

    const rowCells = [
      exp.date || '',
      exp.title || '',
      typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount) || 0,
      paidByName,
      exp.category || 'Other',
      splitTypeLabel,
      participantNames,
      hasReceipt
    ];

    rows.push(rowCells.map(escapeCSVCell).join(','));
  });

  return rows.join('\r\n');
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
    syncActiveGroupProjections,
    clearAllData,
    escapeCSVCell,
    generateCSVFilename,
    exportToCSV
  };
}

