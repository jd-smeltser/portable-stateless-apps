/**
 * Command Palette - Universal navigation and search
 *
 * Opens with Cmd/Ctrl + K
 * Provides: app switching, record search, quick actions
 *
 * Usage:
 *   import CommandPalette from '/core/command-palette.js';
 *   CommandPalette.init();
 */

import Registry from './registry.js';

let palette = null;
let input = null;
let results = null;
let catalog = null;
let selectedIndex = 0;
let items = [];
let isOpen = false;

const PALETTE_HTML = `
<div class="cmd-palette-backdrop">
  <div class="cmd-palette">
    <div class="cmd-palette-input-wrap">
      <span class="cmd-palette-icon">⌘</span>
      <input type="text" class="cmd-palette-input" placeholder="Search apps, records, or type a command...">
    </div>
    <div class="cmd-palette-results"></div>
    <div class="cmd-palette-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>esc</kbd> close</span>
    </div>
  </div>
</div>
`;

const PALETTE_STYLES = `
.cmd-palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 9999;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.cmd-palette-backdrop.open {
  opacity: 1;
  visibility: visible;
}

.cmd-palette {
  width: 90%;
  max-width: 560px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
  transform: scale(0.95) translateY(-10px);
  transition: transform 0.15s;
}

.cmd-palette-backdrop.open .cmd-palette {
  transform: scale(1) translateY(0);
}

.cmd-palette-input-wrap {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #333;
  gap: 12px;
}

.cmd-palette-icon {
  color: #666;
  font-size: 1.1rem;
}

.cmd-palette-input {
  flex: 1;
  background: none;
  border: none;
  color: #e5e5e5;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
}

.cmd-palette-input::placeholder {
  color: #666;
}

.cmd-palette-results {
  max-height: 400px;
  overflow-y: auto;
}

.cmd-palette-group {
  padding: 8px 0;
}

.cmd-palette-group-label {
  padding: 6px 16px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cmd-palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.cmd-palette-item:hover,
.cmd-palette-item.selected {
  background: #262626;
}

.cmd-palette-item-icon {
  font-size: 1.25rem;
  width: 28px;
  text-align: center;
}

.cmd-palette-item-content {
  flex: 1;
  min-width: 0;
}

.cmd-palette-item-title {
  font-size: 0.9rem;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-palette-item-subtitle {
  font-size: 0.75rem;
  color: #666;
}

.cmd-palette-item-badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: #333;
  border-radius: 4px;
  color: #999;
}

.cmd-palette-empty {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}

.cmd-palette-footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid #333;
  font-size: 0.7rem;
  color: #666;
}

.cmd-palette-footer kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #333;
  border-radius: 4px;
  font-family: inherit;
  margin-right: 4px;
}
`;

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    catalog = await fetch('/catalog.json').then(r => r.json());
  } catch (e) {
    catalog = { apps: {}, recordTypes: {} };
  }
  return catalog;
}

function injectStyles() {
  if (document.getElementById('cmd-palette-styles')) return;
  const style = document.createElement('style');
  style.id = 'cmd-palette-styles';
  style.textContent = PALETTE_STYLES;
  document.head.appendChild(style);
}

function createPalette() {
  if (palette) return;

  const div = document.createElement('div');
  div.innerHTML = PALETTE_HTML;
  palette = div.firstElementChild;
  document.body.appendChild(palette);

  input = palette.querySelector('.cmd-palette-input');
  results = palette.querySelector('.cmd-palette-results');

  // Event listeners
  input.addEventListener('input', () => {
    selectedIndex = 0;
    render();
  });

  input.addEventListener('keydown', handleKeydown);

  palette.addEventListener('click', (e) => {
    if (e.target === palette) {
      close();
    }
    const item = e.target.closest('.cmd-palette-item');
    if (item) {
      const idx = parseInt(item.dataset.index);
      selectItem(idx);
    }
  });
}

function open() {
  if (isOpen) return;
  isOpen = true;
  createPalette();
  selectedIndex = 0;
  input.value = '';
  render();
  palette.classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function close() {
  if (!isOpen) return;
  isOpen = false;
  palette.classList.remove('open');
  input.blur();
}

function toggle() {
  isOpen ? close() : open();
}

function handleKeydown(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection();
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection();
      break;
    case 'Enter':
      e.preventDefault();
      selectItem(selectedIndex);
      break;
    case 'Escape':
      e.preventDefault();
      close();
      break;
  }
}

function updateSelection() {
  const allItems = results.querySelectorAll('.cmd-palette-item');
  allItems.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedIndex);
  });

  // Scroll into view
  const selected = allItems[selectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function selectItem(index) {
  const item = items[index];
  if (!item) return;

  close();

  if (item.action) {
    item.action();
  } else if (item.href) {
    window.location.href = item.href;
  }
}

async function render() {
  const cat = await loadCatalog();
  const query = input.value.toLowerCase().trim();

  items = [];
  let html = '';

  // Navigation section
  const navItems = [
    { icon: '🏠', title: 'Home', subtitle: 'Go to dashboard', href: '/' },
    ...Object.entries(cat.apps).map(([id, app]) => ({
      icon: app.icon,
      title: app.name,
      subtitle: app.description,
      href: app.path,
      badge: id
    }))
  ];

  const filteredNav = navItems.filter(item =>
    !query ||
    item.title.toLowerCase().includes(query) ||
    item.subtitle?.toLowerCase().includes(query)
  );

  if (filteredNav.length > 0) {
    html += `<div class="cmd-palette-group">`;
    html += `<div class="cmd-palette-group-label">Navigation</div>`;
    filteredNav.forEach(item => {
      items.push(item);
      html += renderItem(item, items.length - 1);
    });
    html += `</div>`;
  }

  // Records section (if there's a query)
  if (query.length >= 1) {
    const records = Registry.query({
      search: query,
      limit: 10
    }).filter(r => r.type !== 'asset');

    if (records.length > 0) {
      html += `<div class="cmd-palette-group">`;
      html += `<div class="cmd-palette-group-label">Records</div>`;

      records.forEach(record => {
        const typeInfo = cat.recordTypes?.[record.type];
        const icon = typeInfo?.icon || '📎';
        const primaryApp = typeInfo?.primaryApp;
        const app = primaryApp ? cat.apps[primaryApp] : null;
        const hash = record.url.split('#')[1] || '';

        const item = {
          icon,
          title: record.meta?.title || 'Untitled',
          subtitle: record.type,
          href: app ? `${app.path}#${hash}` : '#',
          badge: record.type
        };

        items.push(item);
        html += renderItem(item, items.length - 1);
      });

      html += `</div>`;
    }
  }

  // Quick actions
  const actions = [
    { icon: '➕', title: 'New Note', subtitle: 'Create a new note', href: '/apps/note/' },
    { icon: '☑️', title: 'New Task', subtitle: 'Create a new task', href: '/apps/tasks/' },
    { icon: '📅', title: 'New Event', subtitle: 'Create a calendar event', href: '/apps/calendar/' },
  ].filter(item =>
    !query ||
    item.title.toLowerCase().includes(query)
  );

  if (actions.length > 0 && query.length === 0) {
    html += `<div class="cmd-palette-group">`;
    html += `<div class="cmd-palette-group-label">Quick Actions</div>`;
    actions.forEach(item => {
      items.push(item);
      html += renderItem(item, items.length - 1);
    });
    html += `</div>`;
  }

  if (items.length === 0) {
    html = `<div class="cmd-palette-empty">No results found</div>`;
  }

  results.innerHTML = html;
  updateSelection();
}

function renderItem(item, index) {
  const selected = index === selectedIndex ? 'selected' : '';
  return `
    <div class="cmd-palette-item ${selected}" data-index="${index}">
      <span class="cmd-palette-item-icon">${item.icon}</span>
      <div class="cmd-palette-item-content">
        <div class="cmd-palette-item-title">${escapeHtml(item.title)}</div>
        ${item.subtitle ? `<div class="cmd-palette-item-subtitle">${escapeHtml(item.subtitle)}</div>` : ''}
      </div>
      ${item.badge ? `<span class="cmd-palette-item-badge">${item.badge}</span>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function init() {
  injectStyles();

  // Global keyboard shortcut
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggle();
    }
  });

  // Preload catalog
  loadCatalog();
}

export default {
  init,
  open,
  close,
  toggle
};
