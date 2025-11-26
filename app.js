/**
 * Task Manager - Zero-dependency SPA with URL-state ingestion
 * Uses Dexie.js for IndexedDB, supports iOS Shortcuts integration
 */

// =============================================================================
// DATABASE SETUP (Dexie)
// =============================================================================

const db = new Dexie('TaskManagerDB');

db.version(1).stores({
  tasks: '++id, title, due, completed, createdAt'
});

// =============================================================================
// SECURITY: Validation & Sanitization
// =============================================================================

const ALLOWED_TASK_FIELDS = ['id', 'title', 'due', 'notes', 'completed', 'priority', 'createdAt'];
const MAX_TITLE_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;
const MAX_BULK_IMPORT = 100;

/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, MAX_NOTES_LENGTH)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate a single task object
 */
function validateTask(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return null;
  }

  // Check for unexpected fields
  const keys = Object.keys(obj);
  if (!keys.every(k => ALLOWED_TASK_FIELDS.includes(k))) {
    console.warn('Task contains unexpected fields:', keys);
  }

  // Title is required
  if (typeof obj.title !== 'string' || obj.title.trim() === '') {
    return null;
  }

  // Build sanitized task
  return {
    title: sanitizeString(obj.title.slice(0, MAX_TITLE_LENGTH)),
    notes: obj.notes ? sanitizeString(obj.notes) : '',
    due: isValidDate(obj.due) ? obj.due : null,
    priority: ['low', 'medium', 'high'].includes(obj.priority) ? obj.priority : 'medium',
    completed: Boolean(obj.completed),
    createdAt: new Date().toISOString()
  };
}

/**
 * Validate ISO date string
 */
function isValidDate(str) {
  if (typeof str !== 'string') return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

/**
 * Validate array of tasks
 */
function validateTaskArray(arr) {
  if (!Array.isArray(arr)) {
    // Single task object
    const task = validateTask(arr);
    return task ? [task] : [];
  }

  if (arr.length > MAX_BULK_IMPORT) {
    console.warn(`Bulk import limited to ${MAX_BULK_IMPORT} tasks`);
    arr = arr.slice(0, MAX_BULK_IMPORT);
  }

  return arr
    .map(validateTask)
    .filter(Boolean);
}

// =============================================================================
// URL INGESTION (The "API")
// =============================================================================

/**
 * Decode URL payload (supports both raw Base64 and gzip+Base64)
 */
async function decodePayload(encoded) {
  try {
    // First try: assume it's gzip compressed
    const binary = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

    if (binary[0] === 0x1f && binary[1] === 0x8b) {
      // Gzip magic bytes detected - decompress
      const stream = new Blob([binary])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
  } catch {
    // Not gzip, fall through
  }

  // Fallback: plain Base64
  try {
    const decoded = atob(encoded);
    return JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to decode payload:', e);
    return null;
  }
}

/**
 * Process URL parameters for task ingestion
 */
async function processUrlIngestion() {
  const params = new URLSearchParams(window.location.search);
  const addParam = params.get('add');

  if (!addParam) return 0;

  // Immediately sanitize URL (prevent duplicate ingestion on refresh)
  const cleanUrl = window.location.pathname + window.location.hash;
  history.replaceState(null, '', cleanUrl);

  const payload = await decodePayload(addParam);
  if (!payload) {
    showToast('Invalid import data', 'error');
    return 0;
  }

  const tasks = validateTaskArray(payload);
  if (tasks.length === 0) {
    showToast('No valid tasks found', 'error');
    return 0;
  }

  // Bulk insert into IndexedDB
  await db.tasks.bulkAdd(tasks);

  return tasks.length;
}

// =============================================================================
// CLIPBOARD API (Bulk Import)
// =============================================================================

async function importFromClipboard() {
  try {
    // Check permission
    const permission = await navigator.permissions.query({ name: 'clipboard-read' });
    if (permission.state === 'denied') {
      showToast('Clipboard access denied', 'error');
      return;
    }

    const text = await navigator.clipboard.readText();

    if (!text.trim()) {
      showToast('Clipboard is empty', 'error');
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      showToast('Clipboard does not contain valid JSON', 'error');
      return;
    }

    const tasks = validateTaskArray(data);
    if (tasks.length === 0) {
      showToast('No valid tasks in clipboard', 'error');
      return;
    }

    await db.tasks.bulkAdd(tasks);
    showToast(`Imported ${tasks.length} task${tasks.length > 1 ? 's' : ''}`);
    await renderTasks();

  } catch (e) {
    console.error('Clipboard import failed:', e);
    showToast('Failed to read clipboard', 'error');
  }
}

// =============================================================================
// WEB SHARE API (Export)
// =============================================================================

async function shareTasksAsText() {
  const tasks = await db.tasks.where('completed').equals(0).toArray();

  if (tasks.length === 0) {
    showToast('No tasks to share');
    return;
  }

  const text = tasks
    .map(t => `☐ ${t.title}${t.due ? ` (due: ${formatDate(t.due)})` : ''}`)
    .join('\n');

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My Tasks',
        text: text
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
      }
    }
  } else {
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(text);
    showToast('Tasks copied to clipboard');
  }
}

async function shareTasksAsJSON() {
  const tasks = await db.tasks.toArray();
  const json = JSON.stringify(tasks, null, 2);

  if (navigator.share && navigator.canShare) {
    const file = new File([json], 'tasks.json', { type: 'application/json' });
    const shareData = { files: [file] };

    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('File share failed:', e);
        }
      }
    }
  }

  // Fallback: copy JSON to clipboard
  await navigator.clipboard.writeText(json);
  showToast('Tasks JSON copied to clipboard');
}

// =============================================================================
// UI RENDERING
// =============================================================================

const taskListEl = document.getElementById('task-list');
const addFormEl = document.getElementById('add-form');
const taskInputEl = document.getElementById('task-input');

/**
 * Render all tasks to the DOM
 */
async function renderTasks() {
  const tasks = await db.tasks.orderBy('createdAt').reverse().toArray();

  if (tasks.length === 0) {
    taskListEl.innerHTML = `
      <div class="empty-state">
        <p>No tasks yet</p>
        <p class="hint">Add a task below or import via URL</p>
      </div>
    `;
    return;
  }

  // Group by completed status
  const incomplete = tasks.filter(t => !t.completed);
  const complete = tasks.filter(t => t.completed);

  taskListEl.innerHTML = '';

  incomplete.forEach(task => {
    taskListEl.appendChild(createTaskElement(task));
  });

  if (complete.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.textContent = `Completed (${complete.length})`;
    taskListEl.appendChild(divider);

    complete.forEach(task => {
      taskListEl.appendChild(createTaskElement(task));
    });
  }
}

/**
 * Create a task DOM element (using textContent for XSS safety)
 */
function createTaskElement(task) {
  const el = document.createElement('div');
  el.className = `task-item ${task.completed ? 'completed' : ''}`;
  el.dataset.id = task.id;

  const checkbox = document.createElement('button');
  checkbox.className = 'task-checkbox';
  checkbox.setAttribute('role', 'checkbox');
  checkbox.setAttribute('aria-checked', task.completed);
  checkbox.innerHTML = task.completed
    ? '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    : '';
  checkbox.onclick = () => toggleTask(task.id);

  const content = document.createElement('div');
  content.className = 'task-content';

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title; // Safe: textContent, not innerHTML

  content.appendChild(title);

  if (task.due) {
    const due = document.createElement('span');
    due.className = 'task-due';
    due.textContent = formatDate(task.due);
    content.appendChild(due);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete';
  deleteBtn.setAttribute('aria-label', 'Delete task');
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  deleteBtn.onclick = () => deleteTask(task.id);

  el.appendChild(checkbox);
  el.appendChild(content);
  el.appendChild(deleteBtn);

  return el;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// =============================================================================
// TASK OPERATIONS
// =============================================================================

async function addTask(title) {
  const task = validateTask({ title });
  if (!task) return;

  await db.tasks.add(task);
  await renderTasks();
}

async function toggleTask(id) {
  const task = await db.tasks.get(id);
  if (!task) return;

  await db.tasks.update(id, { completed: !task.completed });
  await renderTasks();
}

async function deleteTask(id) {
  await db.tasks.delete(id);
  await renderTasks();
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================

const toastEl = document.getElementById('toast');
let toastTimeout;

function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);

  toastEl.textContent = message;
  toastEl.className = `toast ${type} show`;

  toastTimeout = setTimeout(() => {
    toastEl.className = 'toast';
  }, 3000);
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

addFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = taskInputEl.value.trim();
  if (!title) return;

  await addTask(title);
  taskInputEl.value = '';
});

document.getElementById('btn-import').addEventListener('click', importFromClipboard);
document.getElementById('btn-share').addEventListener('click', shareTasksAsText);

// Long-press share button for JSON export
let shareTimer;
document.getElementById('btn-share').addEventListener('touchstart', () => {
  shareTimer = setTimeout(shareTasksAsJSON, 500);
});
document.getElementById('btn-share').addEventListener('touchend', () => {
  clearTimeout(shareTimer);
});

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  // Process any URL ingestion first
  const imported = await processUrlIngestion();

  if (imported > 0) {
    showToast(`Imported ${imported} task${imported > 1 ? 's' : ''}`);
  }

  // Render tasks
  await renderTasks();
}

init();
