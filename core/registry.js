/**
 * Registry - Shared URL-based record store
 *
 * All apps share this registry. Each record is a URL that contains its own data.
 * Apps can query, link, and subscribe to changes across the ecosystem.
 */

const REGISTRY_KEY = 'url-registry';
const REGISTRY_VERSION = 1;

// In-memory cache
let records = [];
let listeners = [];

/**
 * Record structure:
 * {
 *   id: string,          // Unique ID
 *   type: string,        // 'note', 'task', 'template', etc.
 *   url: string,         // The URL containing the data (with hash)
 *   links: string[],     // IDs of linked records
 *   tags: string[],      // User tags
 *   created: string,     // ISO timestamp
 *   updated: string,     // ISO timestamp
 *   meta: {}             // Type-specific metadata (for queries without decoding URL)
 * }
 */

// ============================================
// Persistence
// ============================================

function load() {
  try {
    const stored = localStorage.getItem(REGISTRY_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.version === REGISTRY_VERSION) {
        records = data.records || [];
      } else {
        // Handle migration if needed
        records = data.records || [];
      }
    }
  } catch (e) {
    console.error('Registry load error:', e);
    records = [];
  }
}

function save() {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify({
      version: REGISTRY_VERSION,
      records: records
    }));
  } catch (e) {
    console.error('Registry save error:', e);
  }
}

// ============================================
// Core CRUD
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Add a new record to the registry
 */
function add(type, url, options = {}) {
  const record = {
    id: generateId(),
    type,
    url,
    links: options.links || [],
    tags: options.tags || [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    meta: options.meta || {}
  };

  records.unshift(record);
  save();
  notify({ action: 'add', record });

  return record;
}

/**
 * Get a record by ID
 */
function get(id) {
  return records.find(r => r.id === id) || null;
}

/**
 * Update a record
 */
function update(id, updates) {
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;

  const record = records[index];

  if (updates.url !== undefined) record.url = updates.url;
  if (updates.links !== undefined) record.links = updates.links;
  if (updates.tags !== undefined) record.tags = updates.tags;
  if (updates.meta !== undefined) record.meta = { ...record.meta, ...updates.meta };

  record.updated = new Date().toISOString();

  save();
  notify({ action: 'update', record });

  return record;
}

/**
 * Remove a record
 */
function remove(id) {
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return false;

  const record = records[index];
  records.splice(index, 1);

  save();
  notify({ action: 'remove', record });

  return true;
}

// ============================================
// Queries
// ============================================

/**
 * Get all records
 */
function all() {
  return [...records];
}

/**
 * Get records by type
 */
function byType(type) {
  return records.filter(r => r.type === type);
}

/**
 * Get records by tag
 */
function byTag(tag) {
  return records.filter(r => r.tags.includes(tag));
}

/**
 * Get records that link to a specific record
 */
function linkedTo(id) {
  return records.filter(r => r.links.includes(id));
}

/**
 * Get records that a specific record links to
 */
function linksFrom(id) {
  const record = get(id);
  if (!record) return [];
  return record.links.map(linkId => get(linkId)).filter(Boolean);
}

/**
 * Search records by meta field
 */
function byMeta(key, value) {
  return records.filter(r => r.meta[key] === value);
}

/**
 * Complex query
 */
function query(criteria = {}) {
  let result = [...records];

  if (criteria.type) {
    result = result.filter(r => r.type === criteria.type);
  }

  if (criteria.tag) {
    result = result.filter(r => r.tags.includes(criteria.tag));
  }

  if (criteria.linksTo) {
    result = result.filter(r => r.links.includes(criteria.linksTo));
  }

  if (criteria.hasLinks) {
    result = result.filter(r => r.links.length > 0);
  }

  if (criteria.meta) {
    for (const [key, value] of Object.entries(criteria.meta)) {
      result = result.filter(r => r.meta[key] === value);
    }
  }

  if (criteria.search) {
    const term = criteria.search.toLowerCase();
    result = result.filter(r =>
      r.meta.title?.toLowerCase().includes(term) ||
      r.tags.some(t => t.toLowerCase().includes(term))
    );
  }

  // Sort
  if (criteria.sortBy) {
    const field = criteria.sortBy;
    const order = criteria.sortOrder === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      if (a[field] < b[field]) return -1 * order;
      if (a[field] > b[field]) return 1 * order;
      return 0;
    });
  }

  // Limit
  if (criteria.limit) {
    result = result.slice(0, criteria.limit);
  }

  return result;
}

// ============================================
// Links
// ============================================

/**
 * Add a link between records
 */
function addLink(fromId, toId) {
  const record = get(fromId);
  if (!record) return false;

  if (!record.links.includes(toId)) {
    record.links.push(toId);
    record.updated = new Date().toISOString();
    save();
    notify({ action: 'link', from: fromId, to: toId });
  }

  return true;
}

/**
 * Remove a link between records
 */
function removeLink(fromId, toId) {
  const record = get(fromId);
  if (!record) return false;

  const index = record.links.indexOf(toId);
  if (index > -1) {
    record.links.splice(index, 1);
    record.updated = new Date().toISOString();
    save();
    notify({ action: 'unlink', from: fromId, to: toId });
  }

  return true;
}

// ============================================
// Tags
// ============================================

/**
 * Add a tag to a record
 */
function addTag(id, tag) {
  const record = get(id);
  if (!record) return false;

  if (!record.tags.includes(tag)) {
    record.tags.push(tag);
    record.updated = new Date().toISOString();
    save();
    notify({ action: 'tag', record, tag });
  }

  return true;
}

/**
 * Remove a tag from a record
 */
function removeTag(id, tag) {
  const record = get(id);
  if (!record) return false;

  const index = record.tags.indexOf(tag);
  if (index > -1) {
    record.tags.splice(index, 1);
    record.updated = new Date().toISOString();
    save();
    notify({ action: 'untag', record, tag });
  }

  return true;
}

/**
 * Get all unique tags
 */
function allTags() {
  const tags = new Set();
  records.forEach(r => r.tags.forEach(t => tags.add(t)));
  return [...tags].sort();
}

// ============================================
// Subscriptions (cross-app reactivity)
// ============================================

/**
 * Subscribe to registry changes
 * Callback receives: { action, record, ... }
 */
function subscribe(callback) {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
}

function notify(event) {
  listeners.forEach(fn => {
    try {
      fn(event);
    } catch (e) {
      console.error('Registry listener error:', e);
    }
  });

  // Also dispatch a custom event for cross-tab/window sync
  window.dispatchEvent(new CustomEvent('registry-change', { detail: event }));
}

// Listen for changes from other tabs/windows
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === REGISTRY_KEY) {
      load();
      notify({ action: 'sync' });
    }
  });
}

// ============================================
// Import/Export
// ============================================

/**
 * Export all records as JSON
 */
function exportAll() {
  return JSON.stringify({
    version: REGISTRY_VERSION,
    exported: new Date().toISOString(),
    records: records
  }, null, 2);
}

/**
 * Import records from JSON
 */
function importRecords(json, options = { merge: true }) {
  try {
    const data = JSON.parse(json);
    const incoming = data.records || [];

    if (options.merge) {
      // Merge: add records that don't exist
      incoming.forEach(record => {
        if (!get(record.id)) {
          records.push(record);
        }
      });
    } else {
      // Replace: overwrite everything
      records = incoming;
    }

    save();
    notify({ action: 'import', count: incoming.length });
    return true;
  } catch (e) {
    console.error('Import error:', e);
    return false;
  }
}

// ============================================
// Initialize
// ============================================

load();

// ============================================
// Export API
// ============================================

const Registry = {
  // CRUD
  add,
  get,
  update,
  remove,

  // Queries
  all,
  byType,
  byTag,
  byMeta,
  linkedTo,
  linksFrom,
  query,

  // Links
  addLink,
  removeLink,

  // Tags
  addTag,
  removeTag,
  allTags,

  // Subscriptions
  subscribe,

  // Import/Export
  export: exportAll,
  import: importRecords,

  // Utils
  reload: load
};

// Make available globally and as module
if (typeof window !== 'undefined') {
  window.Registry = Registry;
}

export default Registry;
