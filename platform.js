/**
 * PLATFORM ENGINE
 * ================
 * Config-driven SPA platform for iOS Shortcuts integration.
 * AI agents only need to modify app.config.js - this file handles everything else.
 */

import AppConfig from './app.config.js';

// =============================================================================
// DATABASE ENGINE
// =============================================================================

class Database {
  constructor(config) {
    this.config = config;
    this.db = new Dexie(`${config.name}DB`);
    this.db.version(config.version).stores(config.schema);
  }

  async getAll(entity, options = {}) {
    const entityConfig = this.config.entities[entity];
    let collection = this.db[entity];

    if (options.sortBy) {
      collection = collection.orderBy(options.sortBy);
      if (options.sortOrder === 'desc') {
        collection = collection.reverse();
      }
    }

    return collection.toArray();
  }

  async get(entity, id) {
    return this.db[entity].get(id);
  }

  async add(entity, data) {
    const validated = this.validate(entity, data);
    if (!validated) throw new Error('Validation failed');
    return this.db[entity].add(validated);
  }

  async bulkAdd(entity, items) {
    const validated = items
      .map(item => this.validate(entity, item))
      .filter(Boolean);
    return this.db[entity].bulkAdd(validated);
  }

  async update(entity, id, changes) {
    return this.db[entity].update(id, changes);
  }

  async delete(entity, id) {
    return this.db[entity].delete(id);
  }

  async count(entity) {
    return this.db[entity].count();
  }

  // Validate data against entity schema
  validate(entity, data) {
    const entityConfig = this.config.entities[entity];
    if (!entityConfig) return null;

    const fields = entityConfig.fields;
    const result = {};

    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const value = data[fieldName];

      // Auto-generated fields
      if (fieldConfig.auto) {
        if (fieldConfig.type === 'datetime' || fieldConfig.type === 'date') {
          result[fieldName] = new Date().toISOString();
        }
        continue;
      }

      // Required check
      if (fieldConfig.required && (value === undefined || value === null || value === '')) {
        console.warn(`Required field ${fieldName} missing`);
        return null;
      }

      // Skip undefined optional fields
      if (value === undefined) {
        if (fieldConfig.default !== undefined) {
          result[fieldName] = fieldConfig.default;
        }
        continue;
      }

      // Type validation and sanitization
      result[fieldName] = this.sanitizeField(value, fieldConfig);
    }

    return result;
  }

  sanitizeField(value, config) {
    switch (config.type) {
      case 'string':
        if (typeof value !== 'string') return '';
        let str = value.slice(0, config.maxLength || 1000);
        // XSS protection
        return str
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');

      case 'number':
      case 'currency':
        return typeof value === 'number' ? value : parseFloat(value) || 0;

      case 'boolean':
        return Boolean(value);

      case 'date':
      case 'datetime':
        if (value === 'today') return new Date().toISOString().split('T')[0];
        return typeof value === 'string' && !isNaN(Date.parse(value)) ? value : null;

      case 'enum':
        return config.options?.includes(value) ? value : config.default || config.options?.[0];

      case 'url':
        try {
          return new URL(value).href;
        } catch {
          return null;
        }

      case 'array':
        return Array.isArray(value) ? value.slice(0, 50) : [];

      default:
        return value;
    }
  }
}

// =============================================================================
// INGESTION ENGINE
// =============================================================================

class Ingestion {
  constructor(config, db) {
    this.config = config;
    this.db = db;
  }

  async processUrl() {
    const params = new URLSearchParams(window.location.search);
    const ingestionConfig = this.config.ingestion;
    const payload = params.get(ingestionConfig.paramName);

    if (!payload) return 0;

    // Immediately clean URL
    history.replaceState(null, '', window.location.pathname);

    const data = await this.decode(payload, ingestionConfig.encoding);
    if (!data) {
      this.showError('Invalid import data');
      return 0;
    }

    const items = Array.isArray(data) ? data : [data];
    const limited = items.slice(0, ingestionConfig.maxItems || 100);

    const count = await this.db.bulkAdd(ingestionConfig.targetEntity, limited);
    return count;
  }

  async decode(payload, encoding = 'base64') {
    try {
      // Try gzip first
      const binary = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
      if (binary[0] === 0x1f && binary[1] === 0x8b) {
        const stream = new Blob([binary])
          .stream()
          .pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
      }
    } catch {}

    // Fallback to plain base64
    try {
      return JSON.parse(atob(payload));
    } catch {}

    // Try URL-encoded JSON
    try {
      return JSON.parse(decodeURIComponent(payload));
    } catch {}

    return null;
  }

  showError(msg) {
    window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }));
  }
}

// =============================================================================
// UI ENGINE
// =============================================================================

class UI {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.entity = config.primaryEntity;
    this.entityConfig = config.entities[this.entity];
  }

  async render() {
    await this.renderHeader();
    await this.renderList();
    await this.renderQuickAdd();
    this.bindEvents();
  }

  async renderHeader() {
    const header = document.querySelector('.app-header h1');
    if (header) {
      header.textContent = this.config.name;
    }
    document.title = this.config.name;
  }

  async renderList() {
    const container = document.getElementById('task-list');
    const listConfig = this.entityConfig.listView;
    const items = await this.db.getAll(this.entity, listConfig);

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${this.entityConfig.display.emptyState}</p>
        </div>
      `;
      return;
    }

    // Group items if configured
    let grouped = { default: items };
    if (listConfig.groupBy) {
      grouped = this.groupBy(items, listConfig.groupBy);
    }

    container.innerHTML = '';

    for (const [groupKey, groupItems] of Object.entries(grouped)) {
      const groupConfig = listConfig.groups?.[groupKey];

      if (groupConfig?.label) {
        const divider = document.createElement('div');
        divider.className = 'section-divider';
        divider.textContent = `${groupConfig.label} (${groupItems.length})`;
        container.appendChild(divider);
      }

      for (const item of groupItems) {
        container.appendChild(this.renderItem(item));
      }
    }
  }

  renderItem(item) {
    const el = document.createElement('div');
    const isCompleted = item.completed || item[this.entityConfig.actions?.toggle?.field];
    el.className = `task-item ${isCompleted ? 'completed' : ''}`;
    el.dataset.id = item.id;

    const fields = this.entityConfig.fields;

    // Checkbox (if toggle action exists)
    if (this.entityConfig.actions?.toggle) {
      const checkbox = document.createElement('button');
      checkbox.className = 'task-checkbox';
      checkbox.setAttribute('role', 'checkbox');
      checkbox.setAttribute('aria-checked', isCompleted);
      checkbox.innerHTML = isCompleted
        ? '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
        : '';
      checkbox.onclick = () => this.handleToggle(item.id);
      el.appendChild(checkbox);
    }

    // Content area
    const content = document.createElement('div');
    content.className = 'task-content';

    // Render fields by display type
    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      if (fieldConfig.hidden) continue;

      const value = item[fieldName];
      if (value === undefined || value === null) continue;

      const span = document.createElement('span');

      switch (fieldConfig.display) {
        case 'primary':
          span.className = 'task-title';
          span.textContent = value;
          content.appendChild(span);
          break;

        case 'secondary':
          span.className = 'task-secondary';
          span.textContent = value;
          content.appendChild(span);
          break;

        case 'badge':
          span.className = 'task-badge';
          if (fieldConfig.type === 'date') {
            span.textContent = this.formatDate(value);
          } else if (fieldConfig.colors?.[value]) {
            span.style.color = fieldConfig.colors[value];
            span.textContent = value;
          } else {
            span.textContent = value + (fieldConfig.suffix || '');
          }
          content.appendChild(span);
          break;

        case 'link':
          const link = document.createElement('a');
          link.className = 'task-link';
          link.href = value;
          link.textContent = new URL(value).hostname;
          link.target = '_blank';
          content.appendChild(link);
          break;
      }
    }

    el.appendChild(content);

    // Delete button
    if (this.entityConfig.actions?.delete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'task-delete';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      deleteBtn.onclick = () => this.handleDelete(item.id);
      el.appendChild(deleteBtn);
    }

    return el;
  }

  async renderQuickAdd() {
    const input = document.getElementById('task-input');
    const primaryField = Object.entries(this.entityConfig.fields)
      .find(([_, c]) => c.display === 'primary');

    if (input && primaryField) {
      input.placeholder = this.entityConfig.fields[primaryField[0]].placeholder || 'Add item...';
    }
  }

  bindEvents() {
    const form = document.getElementById('add-form');
    const input = document.getElementById('task-input');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;

      const quickAdd = this.entityConfig.quickAdd;
      const primaryField = quickAdd.fields[0];

      const data = {
        [primaryField]: value,
        ...quickAdd.defaults
      };

      await this.db.add(this.entity, data);
      input.value = '';
      await this.renderList();
    });

    // Import button
    document.getElementById('btn-import')?.addEventListener('click', () => this.handleImport());

    // Share button
    document.getElementById('btn-share')?.addEventListener('click', () => this.handleShare());

    // Toast listener
    window.addEventListener('toast', (e) => this.showToast(e.detail.message, e.detail.type));
  }

  async handleToggle(id) {
    const toggleConfig = this.entityConfig.actions.toggle;
    const item = await this.db.get(this.entity, id);
    await this.db.update(this.entity, id, {
      [toggleConfig.field]: !item[toggleConfig.field]
    });
    await this.renderList();
  }

  async handleDelete(id) {
    await this.db.delete(this.entity, id);
    await this.renderList();
  }

  async handleImport() {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      await this.db.bulkAdd(this.entity, items);
      this.showToast(`Imported ${items.length} item(s)`);
      await this.renderList();
    } catch (e) {
      this.showToast('Invalid clipboard data', 'error');
    }
  }

  async handleShare() {
    const items = await this.db.getAll(this.entity);
    const exportFn = this.config.export?.textTemplate;

    const text = items
      .filter(i => !i.completed)
      .map(exportFn || (i => JSON.stringify(i)))
      .join('\n');

    if (navigator.share) {
      await navigator.share({ title: this.config.name, text });
    } else {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard');
    }
  }

  groupBy(items, field) {
    return items.reduce((acc, item) => {
      const key = String(item[field]);
      (acc[key] = acc[key] || []).push(item);
      return acc;
    }, {});
  }

  formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.className = 'toast', 3000);
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  const db = new Database(AppConfig);
  const ingestion = new Ingestion(AppConfig, db);
  const ui = new UI(AppConfig, db);

  // Process URL ingestion first
  const imported = await ingestion.processUrl();
  if (imported > 0) {
    ui.showToast(`Imported ${imported} item(s)`);
  }

  // Render UI
  await ui.render();
}

init();
