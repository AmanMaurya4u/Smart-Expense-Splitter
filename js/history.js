/**
 * Smart Expense Splitter - History & Undo/Redo Management Module
 * Manages undo and redo stacks, deep-copy state snapshots, max depth limit (50 items), and LocalStorage persistence.
 */

const HISTORY_STORAGE_KEY = 'expenseSplitter.history';
const MAX_HISTORY_SIZE = 50;

let undoStack = [];
let redoStack = [];

/**
 * Creates a deep copy state snapshot object with group scoping.
 * @param {Object} appState 
 * @param {string} actionName 
 * @returns {Object} Snapshot object
 */
function createSnapshot(appState, actionName) {
  let clonedState = null;
  try {
    clonedState = JSON.parse(JSON.stringify(appState));
  } catch (e) {
    console.error('Failed to create state snapshot:', e);
    clonedState = appState;
  }

  return {
    actionName: actionName || 'State Change',
    groupId: appState ? appState.activeGroupId : null,
    state: clonedState,
    timestamp: new Date().toISOString()
  };
}

/**
 * Saves current history stacks to LocalStorage safely.
 */
function saveHistoryToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const data = {
      undoStack: undoStack.slice(-MAX_HISTORY_SIZE),
      redoStack: redoStack.slice(-MAX_HISTORY_SIZE)
    };
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Unable to persist history stack to LocalStorage:', e);
  }
}

/**
 * Loads history stacks from LocalStorage with fallback for corrupted data.
 */
function loadHistoryFromStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      undoStack = [];
      redoStack = [];
      return;
    }

    const parsed = JSON.parse(raw);
    undoStack = Array.isArray(parsed.undoStack) ? parsed.undoStack.slice(-MAX_HISTORY_SIZE) : [];
    redoStack = Array.isArray(parsed.redoStack) ? parsed.redoStack.slice(-MAX_HISTORY_SIZE) : [];
  } catch (e) {
    console.warn('Failed to parse stored history. Resetting undo/redo stacks:', e);
    undoStack = [];
    redoStack = [];
  }
}

/**
 * Records a state snapshot before a new state-changing action occurs.
 * Clears redo stack when a new action takes place.
 * 
 * @param {Object} appState - State BEFORE modification
 * @param {string} actionName - Human-readable label (e.g. "Delete Dinner")
 */
function pushUndoSnapshot(appState, actionName) {
  if (!appState) return;

  const snapshot = createSnapshot(appState, actionName);
  undoStack.push(snapshot);

  // Enforce max limit of 50 items (remove oldest)
  if (undoStack.length > MAX_HISTORY_SIZE) {
    undoStack = undoStack.slice(-MAX_HISTORY_SIZE);
  }

  // Clear redo stack on new action branch
  redoStack = [];

  saveHistoryToStorage();
}

/**
 * Restores previous state from undo stack.
 * 
 * @param {Object} currentAppState 
 * @returns {{ success: boolean, restoredState?: Object, actionName?: string, error?: string }}
 */
function performUndo(currentAppState) {
  if (undoStack.length === 0) {
    return { success: false, error: 'Nothing to undo.' };
  }

  const activeGroupId = currentAppState ? currentAppState.activeGroupId : null;
  const lastUndo = undoStack[undoStack.length - 1];

  if (activeGroupId && lastUndo.groupId && lastUndo.groupId !== activeGroupId) {
    return { success: false, error: 'Cannot undo actions from a different group workspace.' };
  }

  const targetSnapshot = undoStack.pop();

  // Push current state to redo stack
  if (currentAppState) {
    const redoSnapshot = createSnapshot(currentAppState, targetSnapshot.actionName);
    redoStack.push(redoSnapshot);
    if (redoStack.length > MAX_HISTORY_SIZE) {
      redoStack = redoStack.slice(-MAX_HISTORY_SIZE);
    }
  }

  saveHistoryToStorage();

  return {
    success: true,
    restoredState: JSON.parse(JSON.stringify(targetSnapshot.state)),
    actionName: targetSnapshot.actionName
  };
}

/**
 * Restores next state from redo stack.
 * 
 * @param {Object} currentAppState 
 * @returns {{ success: boolean, restoredState?: Object, actionName?: string, error?: string }}
 */
function performRedo(currentAppState) {
  if (redoStack.length === 0) {
    return { success: false, error: 'Nothing to redo.' };
  }

  const activeGroupId = currentAppState ? currentAppState.activeGroupId : null;
  const lastRedo = redoStack[redoStack.length - 1];

  if (activeGroupId && lastRedo.groupId && lastRedo.groupId !== activeGroupId) {
    return { success: false, error: 'Cannot redo actions from a different group workspace.' };
  }

  const targetSnapshot = redoStack.pop();

  // Push current state to undo stack
  if (currentAppState) {
    const undoSnapshot = createSnapshot(currentAppState, targetSnapshot.actionName);
    undoStack.push(undoSnapshot);
    if (undoStack.length > MAX_HISTORY_SIZE) {
      undoStack = undoStack.slice(-MAX_HISTORY_SIZE);
    }
  }

  saveHistoryToStorage();

  return {
    success: true,
    restoredState: JSON.parse(JSON.stringify(targetSnapshot.state)),
    actionName: targetSnapshot.actionName
  };
}

/**
 * Returns current status of undo/redo stacks for UI button state, filtered by current active group.
 * 
 * @param {Object} [appState] 
 * @returns {{ canUndo: boolean, canRedo: boolean, undoActionName: string|null, redoActionName: string|null, undoCount: number, redoCount: number }}
 */
function getHistoryInfo(appState) {
  const activeGroupId = appState ? appState.activeGroupId : null;

  const lastUndo = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  const lastRedo = redoStack.length > 0 ? redoStack[redoStack.length - 1] : null;

  const canUndo = !!(lastUndo && (!activeGroupId || !lastUndo.groupId || lastUndo.groupId === activeGroupId));
  const canRedo = !!(lastRedo && (!activeGroupId || !lastRedo.groupId || lastRedo.groupId === activeGroupId));

  return {
    canUndo,
    canRedo,
    undoActionName: canUndo ? lastUndo.actionName : null,
    redoActionName: canRedo ? lastRedo.actionName : null,
    undoCount: undoStack.length,
    redoCount: redoStack.length
  };
}

/**
 * Clears both undo and redo stacks.
 */
function resetHistory() {
  undoStack = [];
  redoStack = [];
  saveHistoryToStorage();
}

// Auto-initialize from LocalStorage on load if in browser
if (typeof window !== 'undefined') {
  loadHistoryFromStorage();
}

// Universal module export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HISTORY_STORAGE_KEY,
    MAX_HISTORY_SIZE,
    createSnapshot,
    saveHistoryToStorage,
    loadHistoryFromStorage,
    pushUndoSnapshot,
    performUndo,
    performRedo,
    getHistoryInfo,
    resetHistory
  };
}
