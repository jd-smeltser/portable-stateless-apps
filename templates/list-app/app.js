/**
 * List App Template
 * Full-featured list with toggle, grouping, and iOS Shortcuts support
 *
 * AI INSTRUCTIONS:
 * 1. Modify CONFIG to change app name and schema
 * 2. Modify VALIDATION to match your fields
 * 3. Modify renderItem() for custom list item display
 * 4. Modify groupBy/sortBy in CONFIG for different organization
 */

import { createDB, createStore } from '../../core/db.js';
import { processUrl } from '../../core/ingestion.js';
import { validate, sanitize } from '../../core/security.js';
import { shareItems, importFromClipboard } from '../../core/share.js';
import { setupIOS, createToast, formatDate } from '../../core/ios.js';

// =============================================================================
// CONFIGURATION - AI: Modify this section
// =============================================================================

const CONFIG = {
  name: 'Tasks',
  version: 1,

  // Dexie schema
  schema: {
    items: '++id, title, completed, due, priority, createdAt'
  },

  // List behavior
  primaryField: 'title',      // Main display field
  toggleField: 'completed',   // Field to toggle (or null)
  groupBy: 'completed',       // Group by field (or null)
  sortBy: 'createdAt',
  sortOrder: 'desc',

  // Group labels (when groupBy is set)
  groups: {
    false: null,              // No label for incomplete
    true: 'Completed'         // Label for complete
  },

  // Quick add defaults
  quickAddDefaults: {
    completed: false,
    priority: 'medium'
  },

  // Share format
  shareFormat: (item) => `${item.completed ? '☑' : '☐'} ${item.title}`
};

// Validation schema for incoming data
const VALIDATION = {
  title: { type: 'string', required: true, maxLength: 500 },
  completed: { type: 'boolean', default: false },
  due: { type: 'date' },
  priority: { type: 'enum', values: ['low', 'medium', 'high'], default: 'medium' },
  notes: { type: 'string', maxLength: 2000 },
  createdAt: { type: 'datetime' }
};

// =============================================================================
// DATABASE
// =============================================================================

const db = createDB(CONFIG);
const store = createStore(db, 'items');

// =============================================================================
// UI
// =============================================================================

const listEl = document.getElementById('list');
const showToast = createToast(document.getElementById('toast'));

async function render() {
  document.getElementById('app-title').textContent = CONFIG.name;
  document.title = CONFIG.name;

  const allItems = await store.getAll({
    sortBy: CONFIG.sortBy,
    sortOrder: CONFIG.sortOrder
  });

  if (allItems.length === 0) {
    listEl.innerHTML = `<div class="empty">No items yet</div>`;
    return;
  }

  // Group items
  let groups = { default: allItems };
  if (CONFIG.groupBy) {
    groups = groupBy(allItems, CONFIG.groupBy);
  }

  listEl.innerHTML = '';

  for (const [key, items] of Object.entries(groups)) {
    const label = CONFIG.groups?.[key];
    if (label) {
      const divider = document.createElement('div');
      divider.className = 'section-divider';
      divider.textContent = `${label} (${items.length})`;
      listEl.appendChild(divider);
    }

    for (const item of items) {
      listEl.appendChild(renderItem(item));
    }
  }
}

/**
 * Render a single list item
 * AI: Customize this function for different item displays
 */
function renderItem(item) {
  const el = document.createElement('div');
  const isToggled = CONFIG.toggleField ? item[CONFIG.toggleField] : false;
  el.className = `item ${isToggled ? 'toggled' : ''}`;
  el.dataset.id = item.id;

  // Toggle button (checkbox)
  if (CONFIG.toggleField) {
    const toggle = document.createElement('button');
    toggle.className = 'item-toggle';
    toggle.setAttribute('role', 'checkbox');
    toggle.setAttribute('aria-checked', isToggled);
    toggle.innerHTML = isToggled
      ? '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
      : '';
    toggle.onclick = () => handleToggle(item.id);
    el.appendChild(toggle);
  }

  // Content
  const content = document.createElement('div');
  content.className = 'item-content';

  // Primary text
  const primary = document.createElement('span');
  primary.className = 'item-primary';
  primary.textContent = item[CONFIG.primaryField];
  content.appendChild(primary);

  // Secondary info (due date)
  if (item.due) {
    const due = document.createElement('span');
    due.className = 'item-secondary';
    due.textContent = formatDate(item.due);
    content.appendChild(due);
  }

  el.appendChild(content);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'item-delete';
  deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  deleteBtn.onclick = () => handleDelete(item.id);
  el.appendChild(deleteBtn);

  return el;
}

function groupBy(items, field) {
  return items.reduce((acc, item) => {
    const key = String(item[field]);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleAdd(value) {
  const data = validate({
    [CONFIG.primaryField]: value,
    ...CONFIG.quickAddDefaults,
    createdAt: 'now'
  }, VALIDATION);

  if (data) {
    await store.add(data);
    render();
  }
}

async function handleToggle(id) {
  await store.toggle(id, CONFIG.toggleField);
  render();
}

async function handleDelete(id) {
  await store.delete(id);
  render();
}

async function handleImport() {
  const items = await importFromClipboard({
    validate: (item) => item[CONFIG.primaryField]?.length > 0
  });

  if (!items) {
    showToast('No valid data in clipboard', 'error');
    return;
  }

  const validated = items
    .map(item => validate({ ...item, createdAt: 'now' }, VALIDATION))
    .filter(Boolean);

  await store.bulkAdd(validated);
  showToast(`Imported ${validated.length} item(s)`);
  render();
}

async function handleShare() {
  const items = await store.getAll();
  const filtered = CONFIG.toggleField
    ? items.filter(i => !i[CONFIG.toggleField])
    : items;

  if (filtered.length === 0) {
    showToast('Nothing to share');
    return;
  }

  await shareItems(filtered, {
    title: CONFIG.name,
    formatter: CONFIG.shareFormat
  });
}

// =============================================================================
// EVENT BINDINGS
// =============================================================================

document.getElementById('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('input');
  const value = input.value.trim();
  if (!value) return;
  handleAdd(value);
  input.value = '';
});

document.getElementById('btn-import').addEventListener('click', handleImport);
document.getElementById('btn-share').addEventListener('click', handleShare);

// =============================================================================
// INIT
// =============================================================================

async function init() {
  setupIOS();

  // Process URL ingestion
  const { data, count } = await processUrl({
    param: 'add',
    validate: (item) => item[CONFIG.primaryField]?.length > 0
  });

  if (count > 0) {
    const validated = data
      .map(item => validate({ ...item, createdAt: 'now' }, VALIDATION))
      .filter(Boolean);
    await store.bulkAdd(validated);
    showToast(`Imported ${validated.length} item(s)`);
  }

  render();
}

init();
