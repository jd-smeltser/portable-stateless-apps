/**
 * Blank App Template
 * Minimal starting point with core utilities wired up
 */

import { createDB, createStore } from '../../core/db.js';
import { processUrl } from '../../core/ingestion.js';
import { validate, sanitize } from '../../core/security.js';
import { shareText, importFromClipboard } from '../../core/share.js';
import { setupIOS, createToast } from '../../core/ios.js';

// =============================================================================
// CONFIGURATION - Modify this section
// =============================================================================

const CONFIG = {
  name: 'MyApp',
  version: 1,
  schema: {
    items: '++id, name, createdAt'
  }
};

const VALIDATION_SCHEMA = {
  name: { type: 'string', required: true, maxLength: 200 },
  createdAt: { type: 'datetime' }
};

// =============================================================================
// DATABASE
// =============================================================================

const db = createDB(CONFIG);
const items = createStore(db, 'items');

// =============================================================================
// UI
// =============================================================================

const app = document.getElementById('app');
const showToast = createToast(document.getElementById('toast'));

async function render() {
  const allItems = await items.getAll({ sortBy: 'createdAt', sortOrder: 'desc' });

  app.innerHTML = `
    <header class="header">
      <h1>${CONFIG.name}</h1>
    </header>

    <main class="content">
      ${allItems.length === 0
        ? '<p class="empty">No items yet</p>'
        : allItems.map(item => `
            <div class="item" data-id="${item.id}">
              <span>${item.name}</span>
              <button class="delete" aria-label="Delete">×</button>
            </div>
          `).join('')
      }
    </main>

    <form class="add-form" id="add-form">
      <input type="text" id="input" placeholder="Add item..." autocomplete="off">
      <button type="submit">+</button>
    </form>
  `;

  bindEvents();
}

function bindEvents() {
  // Add form
  document.getElementById('add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('input');
    const name = input.value.trim();
    if (!name) return;

    const data = validate({ name, createdAt: 'now' }, VALIDATION_SCHEMA);
    if (data) {
      await items.add(data);
      input.value = '';
      render();
    }
  });

  // Delete buttons
  document.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.closest('.item').dataset.id);
      await items.delete(id);
      render();
    });
  });
}

// =============================================================================
// INIT
// =============================================================================

async function init() {
  setupIOS();

  // Process URL ingestion
  const { data, count } = await processUrl({
    param: 'add',
    validate: (item) => item.name?.length > 0
  });

  if (count > 0) {
    const validated = data
      .map(item => validate({ ...item, createdAt: 'now' }, VALIDATION_SCHEMA))
      .filter(Boolean);
    await items.bulkAdd(validated);
    showToast(`Imported ${validated.length} item(s)`);
  }

  render();
}

init();
