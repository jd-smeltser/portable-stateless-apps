/**
 * Task Manager App
 * Example app built on the portable-stateless-apps platform
 */

import { createDB, createStore } from '../../core/db.js';
import { processUrl } from '../../core/ingestion.js';
import { validate } from '../../core/security.js';
import { shareItems, importFromClipboard } from '../../core/share.js';
import { setupIOS, createToast, formatDate } from '../../core/ios.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  name: 'Tasks',
  version: 1,
  schema: {
    tasks: '++id, title, completed, due, priority, createdAt'
  }
};

const VALIDATION = {
  title: { type: 'string', required: true, maxLength: 500 },
  notes: { type: 'string', maxLength: 2000 },
  due: { type: 'date' },
  priority: { type: 'enum', values: ['low', 'medium', 'high'], default: 'medium' },
  completed: { type: 'boolean', default: false },
  createdAt: { type: 'datetime' }
};

// =============================================================================
// DATABASE
// =============================================================================

const db = createDB(CONFIG);
const tasks = createStore(db, 'tasks');

// =============================================================================
// UI
// =============================================================================

const listEl = document.getElementById('task-list');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('task-input');
const showToast = createToast(document.getElementById('toast'));

async function render() {
  const allTasks = await tasks.getAll({ sortBy: 'createdAt', sortOrder: 'desc' });

  if (allTasks.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>No tasks yet</p>
        <p class="hint">Add a task below or import via URL</p>
      </div>
    `;
    return;
  }

  const incomplete = allTasks.filter(t => !t.completed);
  const complete = allTasks.filter(t => t.completed);

  listEl.innerHTML = '';

  incomplete.forEach(task => listEl.appendChild(renderTask(task)));

  if (complete.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'section-divider';
    divider.textContent = `Completed (${complete.length})`;
    listEl.appendChild(divider);
    complete.forEach(task => listEl.appendChild(renderTask(task)));
  }
}

function renderTask(task) {
  const el = document.createElement('div');
  el.className = `task-item ${task.completed ? 'completed' : ''}`;
  el.dataset.id = task.id;

  // Checkbox
  const checkbox = document.createElement('button');
  checkbox.className = 'task-checkbox';
  checkbox.setAttribute('role', 'checkbox');
  checkbox.setAttribute('aria-checked', task.completed);
  checkbox.innerHTML = task.completed
    ? '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    : '';
  checkbox.onclick = () => handleToggle(task.id);
  el.appendChild(checkbox);

  // Content
  const content = document.createElement('div');
  content.className = 'task-content';

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;
  content.appendChild(title);

  if (task.due) {
    const due = document.createElement('span');
    due.className = 'task-due';
    due.textContent = formatDate(task.due);
    content.appendChild(due);
  }

  el.appendChild(content);

  // Delete
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  deleteBtn.onclick = () => handleDelete(task.id);
  el.appendChild(deleteBtn);

  return el;
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleAdd(title) {
  const data = validate({ title, completed: false, createdAt: 'now' }, VALIDATION);
  if (!data) return;
  await tasks.add(data);
  render();
}

async function handleToggle(id) {
  await tasks.toggle(id, 'completed');
  render();
}

async function handleDelete(id) {
  await tasks.delete(id);
  render();
}

async function handleImport() {
  const items = await importFromClipboard({
    validate: item => item.title?.length > 0
  });

  if (!items) {
    showToast('No valid tasks in clipboard', 'error');
    return;
  }

  const validated = items
    .map(item => validate({ ...item, createdAt: 'now' }, VALIDATION))
    .filter(Boolean);

  await tasks.bulkAdd(validated);
  showToast(`Imported ${validated.length} task(s)`);
  render();
}

async function handleShare() {
  const allTasks = await tasks.getAll();
  const incomplete = allTasks.filter(t => !t.completed);

  if (incomplete.length === 0) {
    showToast('No tasks to share');
    return;
  }

  await shareItems(incomplete, {
    title: 'My Tasks',
    formatter: t => `☐ ${t.title}${t.due ? ` (${formatDate(t.due)})` : ''}`
  });
}

// =============================================================================
// EVENTS
// =============================================================================

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = inputEl.value.trim();
  if (!title) return;
  handleAdd(title);
  inputEl.value = '';
});

document.getElementById('btn-import').addEventListener('click', handleImport);
document.getElementById('btn-share').addEventListener('click', handleShare);

// =============================================================================
// INIT
// =============================================================================

async function init() {
  setupIOS();

  const { data, count } = await processUrl({
    param: 'add',
    validate: item => item.title?.length > 0
  });

  if (count > 0) {
    const validated = data
      .map(item => validate({ ...item, createdAt: 'now' }, VALIDATION))
      .filter(Boolean);
    await tasks.bulkAdd(validated);
    showToast(`Imported ${validated.length} task(s)`);
  }

  render();
}

init();
