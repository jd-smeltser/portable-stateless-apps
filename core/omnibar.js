/**
 * Omnibar - nvalt-style unified search/create
 *
 * Always visible at top. Typing searches, Enter creates.
 * @app prefix switches context (e.g., @calendar Meeting)
 *
 * Usage:
 *   import Omnibar from '/core/omnibar.js';
 *   Omnibar.init({ app: 'notes', onCreate: (title) => {...} });
 */

import Registry from './registry.js';
import Catalog from './catalog.js';

let bar = null;
let input = null;
let results = null;
let catalog = null;
let selectedIndex = 0;
let items = [];
let currentApp = 'notes';
let targetApp = null; // When using @app prefix
let onCreate = null;
let onSelect = null;

const OMNIBAR_HTML = `
<div class="omnibar">
  <div class="omnibar-input-wrap">
    <input type="text" class="omnibar-input" placeholder="Search or create..." autocomplete="off" spellcheck="false">
    <span class="omnibar-hint">
      <kbd>↵</kbd> create
      <kbd>↑↓</kbd> navigate
      <kbd>esc</kbd> clear
    </span>
  </div>
  <div class="omnibar-results"></div>
</div>
`;

const OMNIBAR_STYLES = `
.omnibar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg, #0a0a0a);
  border-bottom: 1px solid var(--border, #262626);
  padding: 12px 16px;
}

.omnibar-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface, #141414);
  border: 1px solid var(--border, #262626);
  border-radius: 10px;
  padding: 0 14px;
  transition: border-color 0.15s;
}

.omnibar-input-wrap:focus-within {
  border-color: var(--accent, #3b82f6);
}

.omnibar-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text, #e5e5e5);
  font-size: 1rem;
  font-family: inherit;
  padding: 12px 0;
  outline: none;
  min-width: 0;
}

.omnibar-input::placeholder {
  color: var(--text-muted, #737373);
}

.omnibar-hint {
  font-size: 0.7rem;
  color: var(--text-muted, #737373);
  white-space: nowrap;
  display: flex;
  gap: 8px;
}

.omnibar-hint kbd {
  display: inline-block;
  padding: 2px 5px;
  background: var(--border, #262626);
  border-radius: 4px;
  font-family: inherit;
}

.omnibar-results {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 100%;
  background: var(--surface, #141414);
  border: 1px solid var(--border, #262626);
  border-radius: 10px;
  max-height: 400px;
  overflow-y: auto;
  display: none;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.omnibar-results.open {
  display: block;
}

.omnibar-section {
  padding: 8px 0;
}

.omnibar-section:not(:last-child) {
  border-bottom: 1px solid var(--border, #262626);
}

.omnibar-section-label {
  padding: 6px 14px;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-muted, #737373);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.omnibar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
}

.omnibar-item:hover,
.omnibar-item.selected {
  background: rgba(59, 130, 246, 0.1);
}

.omnibar-item-icon {
  font-size: 1.1rem;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.omnibar-item-content {
  flex: 1;
  min-width: 0;
}

.omnibar-item-title {
  font-size: 0.9rem;
  color: var(--text, #e5e5e5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omnibar-item-meta {
  font-size: 0.7rem;
  color: var(--text-muted, #737373);
}

.omnibar-item-badge {
  font-size: 0.65rem;
  padding: 2px 6px;
  background: var(--border, #262626);
  border-radius: 4px;
  color: var(--text-muted, #737373);
}

.omnibar-create {
  background: rgba(59, 130, 246, 0.05);
  border-top: 1px solid var(--border, #262626);
}

.omnibar-create .omnibar-item-title {
  color: var(--accent, #3b82f6);
}

.omnibar-app-prefix {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--accent, #3b82f6);
  border-radius: 4px;
  font-size: 0.75rem;
  color: white;
  margin-right: 8px;
}

.omnibar-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted, #737373);
  font-size: 0.85rem;
}

/* Hide on mobile when not focused - optional */
@media (max-width: 600px) {
  .omnibar-hint {
    display: none;
  }
}
`;

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    // Use Catalog module to get merged static + installed apps
    catalog = await Catalog.getCatalog();
  } catch (e) {
    catalog = { apps: {}, recordTypes: {} };
  }
  return catalog;
}

function injectStyles() {
  if (document.getElementById('omnibar-styles')) return;
  const style = document.createElement('style');
  style.id = 'omnibar-styles';
  style.textContent = OMNIBAR_STYLES;
  document.head.appendChild(style);
}

function createBar(container) {
  if (bar) return;

  const div = document.createElement('div');
  div.innerHTML = OMNIBAR_HTML;
  bar = div.firstElementChild;

  // Insert at top of container or body
  const target = container || document.body;
  target.insertBefore(bar, target.firstChild);

  input = bar.querySelector('.omnibar-input');
  results = bar.querySelector('.omnibar-results');

  // Event listeners
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('focus', () => {
    if (input.value.trim()) {
      render();
      results.classList.add('open');
    }
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) {
      results.classList.remove('open');
    }
  });

  // Click on results
  results.addEventListener('click', (e) => {
    const item = e.target.closest('.omnibar-item');
    if (item) {
      const idx = parseInt(item.dataset.index);
      selectItem(idx);
    }
  });
}

function handleInput() {
  const value = input.value;
  selectedIndex = 0;

  // Check for @app prefix
  const appMatch = value.match(/^@(\w+)\s*/);
  if (appMatch) {
    const appKey = appMatch[1].toLowerCase();
    const cat = catalog || { apps: {} };

    // Find matching app
    const matchedApp = Object.entries(cat.apps).find(([key, app]) =>
      key.startsWith(appKey) || app.name.toLowerCase().startsWith(appKey)
    );

    if (matchedApp) {
      targetApp = matchedApp[0];
    } else {
      targetApp = null;
    }
  } else {
    targetApp = null;
  }

  render();

  if (value.trim()) {
    results.classList.add('open');
  } else {
    results.classList.remove('open');
  }
}

function handleKeydown(e) {
  const isOpen = results.classList.contains('open');

  switch (e.key) {
    case 'ArrowDown':
      if (isOpen) {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelection();
      }
      break;

    case 'ArrowUp':
      if (isOpen) {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
      }
      break;

    case 'Enter':
      e.preventDefault();
      if (isOpen && items.length > 0) {
        selectItem(selectedIndex);
      }
      break;

    case 'Escape':
      e.preventDefault();
      input.value = '';
      targetApp = null;
      results.classList.remove('open');
      input.blur();
      break;
  }
}

function updateSelection() {
  const allItems = results.querySelectorAll('.omnibar-item');
  allItems.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
  });

  const selected = allItems[selectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function selectItem(index) {
  const item = items[index];
  if (!item) return;

  results.classList.remove('open');

  if (item.type === 'create') {
    // Create new record
    const title = getSearchQuery();
    const app = item.app || currentApp;

    if (app === currentApp && onCreate) {
      onCreate(title);
      input.value = '';
      targetApp = null;
    } else {
      // Navigate to other app with title
      const cat = catalog?.apps?.[app];
      if (cat?.path) {
        const encoded = encodeURIComponent(title);
        window.location.href = `${cat.path}?create=${encoded}`;
      }
    }
  } else if (item.type === 'record') {
    // Open existing record
    if (onSelect) {
      const handled = onSelect(item.record);
      if (handled) {
        input.value = '';
        targetApp = null;
        return;
      }
    }

    // Navigate to record
    const record = item.record;
    const typeInfo = catalog?.recordTypes?.[record.type];
    const primaryApp = typeInfo?.primaryApp;
    const app = primaryApp ? catalog?.apps?.[primaryApp] : null;

    if (app?.path) {
      const hash = record.url.split('#')[1] || '';
      window.location.href = `${app.path}${hash ? '#' + hash : ''}`;
    }

    input.value = '';
    targetApp = null;
  } else if (item.type === 'app') {
    // Navigate to app
    window.location.href = item.path;
  }
}

function getSearchQuery() {
  let query = input.value.trim();

  // Remove @app prefix if present
  const appMatch = query.match(/^@\w+\s+/);
  if (appMatch) {
    query = query.slice(appMatch[0].length);
  }

  return query;
}

async function render() {
  const cat = await loadCatalog();
  const rawQuery = input.value.trim();
  const query = getSearchQuery().toLowerCase();

  items = [];
  let html = '';

  // Show target app indicator
  const effectiveApp = targetApp || currentApp;
  const appInfo = cat.apps[effectiveApp];

  // Search records
  if (query) {
    const records = Registry.query({
      search: query,
      limit: 8
    }).filter(r => r.type !== 'asset');

    if (records.length > 0) {
      html += '<div class="omnibar-section">';
      html += '<div class="omnibar-section-label">Records</div>';

      records.forEach(record => {
        const typeInfo = cat.recordTypes?.[record.type];
        const icon = typeInfo?.icon || '📎';
        const title = record.meta?.title || 'Untitled';
        const date = new Date(record.updated).toLocaleDateString();

        items.push({ type: 'record', record });
        html += `
          <div class="omnibar-item" data-index="${items.length - 1}">
            <span class="omnibar-item-icon">${icon}</span>
            <div class="omnibar-item-content">
              <div class="omnibar-item-title">${escapeHtml(title)}</div>
              <div class="omnibar-item-meta">${record.type} · ${date}</div>
            </div>
          </div>
        `;
      });

      html += '</div>';
    }
  }

  // Show apps when typing @
  if (rawQuery.startsWith('@') && !query) {
    html += '<div class="omnibar-section">';
    html += '<div class="omnibar-section-label">Switch App</div>';

    Object.entries(cat.apps).forEach(([key, app]) => {
      items.push({ type: 'app', app: key, path: app.path });
      html += `
        <div class="omnibar-item" data-index="${items.length - 1}">
          <span class="omnibar-item-icon">${app.icon}</span>
          <div class="omnibar-item-content">
            <div class="omnibar-item-title">${app.name}</div>
            <div class="omnibar-item-meta">${app.description}</div>
          </div>
          <span class="omnibar-item-badge">@${key}</span>
        </div>
      `;
    });

    html += '</div>';
  }

  // Create option (show when there's a query and app supports creation)
  if (query) {
    const canCreateInCurrentApp = effectiveApp !== 'assets';
    const createOptions = [];

    // Add current app create option if supported
    if (canCreateInCurrentApp) {
      const createIcon = appInfo?.icon || '📝';
      const createLabel = appInfo?.name || 'Note';
      createOptions.push({
        app: effectiveApp,
        icon: createIcon,
        label: createLabel,
        isPrimary: true
      });
    }

    // Show other app create options if not already targeting one
    if (!targetApp) {
      Object.entries(cat.apps).forEach(([key, app]) => {
        if (key === currentApp) return;
        if (key === 'assets') return; // Can't create assets from search

        createOptions.push({
          app: key,
          icon: app.icon,
          label: app.name,
          isPrimary: false
        });
      });
    }

    if (createOptions.length > 0) {
      html += '<div class="omnibar-section omnibar-create">';

      createOptions.forEach(opt => {
        items.push({ type: 'create', app: opt.app });
        html += `
          <div class="omnibar-item" data-index="${items.length - 1}">
            <span class="omnibar-item-icon">+</span>
            <div class="omnibar-item-content">
              <div class="omnibar-item-title">
                ${opt.isPrimary && targetApp ? `<span class="omnibar-app-prefix">${opt.icon} ${opt.label}</span>` : ''}
                Create "${escapeHtml(query)}"${!opt.isPrimary ? ` in ${opt.label}` : ''}
              </div>
            </div>
            <span class="omnibar-item-badge">${opt.icon} ${opt.label}</span>
          </div>
        `;
      });

      html += '</div>';
    }
  }

  if (items.length === 0 && rawQuery) {
    html = '<div class="omnibar-empty">Type to search or create</div>';
  }

  results.innerHTML = html;
  updateSelection();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function focus() {
  if (input) {
    input.focus();
  }
}

function clear() {
  if (input) {
    input.value = '';
    targetApp = null;
    results.classList.remove('open');
  }
}

function init(options = {}) {
  currentApp = options.app || 'notes';
  onCreate = options.onCreate || null;
  onSelect = options.onSelect || null;

  injectStyles();
  loadCatalog().then(() => {
    createBar(options.container);

    // Update placeholder based on current app
    const appInfo = catalog?.apps?.[currentApp];
    if (appInfo) {
      input.placeholder = `Search or create ${appInfo.name.toLowerCase()}...`;
    }

    // Check for ?create= parameter
    const params = new URLSearchParams(window.location.search);
    const createTitle = params.get('create');
    if (createTitle && onCreate) {
      // Clear the URL parameter
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      // Trigger creation
      setTimeout(() => onCreate(decodeURIComponent(createTitle)), 100);
    }
  });

  // Global keyboard shortcut to focus
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K to focus omnibar
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      focus();
    }
    // / to focus when not in an input
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      focus();
    }
  });
}

export default {
  init,
  focus,
  clear
};
