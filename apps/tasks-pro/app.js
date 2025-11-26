/**
 * Tasks Pro
 * A polished task manager with responsive design
 */

import { createDB, createStore } from '../../core/db.js';
import { processUrl } from '../../core/ingestion.js';
import { validate } from '../../core/security.js';
import { shareAsJSON, importFromClipboard } from '../../core/share.js';
import { setupIOS, createToast, formatDate } from '../../core/ios.js';

// =============================================================================
// CONFIG
// =============================================================================

const db = createDB({
  name: 'TasksProDB',
  version: 1,
  schema: {
    tasks: '++id, title, completed, due, createdAt'
  }
});

const tasks = createStore(db, 'tasks');

const VALIDATION = {
  title: { type: 'string', required: true, maxLength: 500 },
  due: { type: 'date' },
  completed: { type: 'boolean', default: false },
  createdAt: { type: 'datetime' }
};

// =============================================================================
// STATE
// =============================================================================

let currentFilter = 'all';

// =============================================================================
// DOM
// =============================================================================

const listEl = document.getElementById('task-list');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('task-input');
const dueEl = document.getElementById('task-due');
const titleEl = document.getElementById('main-title');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('overlay');
const showToast = createToast(document.getElementById('toast'));

// =============================================================================
// FILTERING
// =============================================================================

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return dateStr.split('T')[0] === getToday();
}

function isUpcoming(dateStr) {
  if (!dateStr) return false;
  const today = getToday();
  const due = dateStr.split('T')[0];
  return due > today;
}

function filterTasks(allTasks, filter) {
  switch (filter) {
    case 'today':
      return allTasks.filter(t => !t.completed && isToday(t.due));
    case 'upcoming':
      return allTasks.filter(t => !t.completed && isUpcoming(t.due));
    case 'completed':
      return allTasks.filter(t => t.completed);
    case 'all':
    default:
      return allTasks.filter(t => !t.completed);
  }
}

function getFilterTitle(filter) {
  const titles = {
    all: 'All Tasks',
    today: 'Today',
    upcoming: 'Upcoming',
    completed: 'Completed'
  };
  return titles[filter] || 'Tasks';
}

// =============================================================================
// RENDER
// =============================================================================

async function render() {
  const allTasks = await tasks.getAll({ sortBy: 'createdAt', sortOrder: 'desc' });
  const filtered = filterTasks(allTasks, currentFilter);

  // Update counts
  document.getElementById('count-all').textContent = allTasks.filter(t => !t.completed).length;
  document.getElementById('count-today').textContent = allTasks.filter(t => !t.completed && isToday(t.due)).length;
  document.getElementById('count-upcoming').textContent = allTasks.filter(t => !t.completed && isUpcoming(t.due)).length;
  document.getElementById('count-completed').textContent = allTasks.filter(t => t.completed).length;

  // Update title
  titleEl.textContent = getFilterTitle(currentFilter);

  // Render list
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <li class="empty-state">
        <p>No tasks here</p>
      </li>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(task => `
    <li class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
      <button class="task-checkbox" role="checkbox" aria-checked="${task.completed}">
        ${task.completed ? `
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        ` : ''}
      </button>
      <div class="task-content">
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${task.due ? `<span class="task-due ${isToday(task.due) ? 'today' : ''}">${formatDate(task.due)}</span>` : ''}
      </div>
      <button class="task-delete" aria-label="Delete">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </li>
  `).join('');

  // Bind task events
  listEl.querySelectorAll('.task-checkbox').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.closest('.task-item').dataset.id);
      handleToggle(id);
    });
  });

  listEl.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.closest('.task-item').dataset.id);
      handleDelete(id);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleAdd(title, due) {
  const data = validate({
    title,
    due: due || null,
    completed: false,
    createdAt: 'now'
  }, VALIDATION);

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

async function handleExport() {
  const allTasks = await tasks.getAll();
  const success = await shareAsJSON(allTasks, 'tasks.json');
  if (success) {
    showToast('Tasks exported');
  }
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

function setFilter(filter) {
  currentFilter = filter;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.filter === filter);
  });

  // Close mobile menu
  closeMobileMenu();

  render();
}

function toggleMobileMenu() {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeMobileMenu() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

// =============================================================================
// EVENTS
// =============================================================================

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = inputEl.value.trim();
  const due = dueEl.value;
  if (!title) return;
  handleAdd(title, due);
  inputEl.value = '';
  dueEl.value = '';
});

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => setFilter(item.dataset.filter));
});

document.getElementById('btn-export').addEventListener('click', handleExport);
document.getElementById('btn-import').addEventListener('click', handleImport);

menuToggle.addEventListener('click', toggleMobileMenu);
overlay.addEventListener('click', closeMobileMenu);

// Keyboard shortcut for add (desktop)
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    inputEl.focus();
  }
});

// =============================================================================
// INIT
// =============================================================================

async function init() {
  setupIOS();

  // Process URL ingestion
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
