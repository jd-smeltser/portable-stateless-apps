/**
 * Database Utilities
 * Dexie.js wrapper for IndexedDB with common patterns
 */

/**
 * Create a new Dexie database instance
 * @param {Object} config - { name: string, version: number, schema: Object }
 * @returns {Dexie} Configured database instance
 *
 * @example
 * const db = createDB({
 *   name: 'MyApp',
 *   version: 1,
 *   schema: {
 *     tasks: '++id, title, completed, createdAt',
 *     tags: '++id, &name'
 *   }
 * });
 */
export function createDB({ name, version = 1, schema }) {
  const db = new Dexie(name);
  db.version(version).stores(schema);
  return db;
}

/**
 * Generic CRUD operations for any table
 * @param {Dexie} db - Dexie database instance
 * @param {string} table - Table name
 * @returns {Object} CRUD methods
 */
export function createStore(db, table) {
  return {
    async getAll(options = {}) {
      let collection = db[table];

      if (options.where) {
        collection = collection.where(options.where.field).equals(options.where.value);
      }

      if (options.sortBy) {
        collection = collection.orderBy(options.sortBy);
      }

      let results = await collection.toArray();

      if (options.sortOrder === 'desc') {
        results = results.reverse();
      }

      if (options.limit) {
        results = results.slice(0, options.limit);
      }

      return results;
    },

    async get(id) {
      return db[table].get(id);
    },

    async add(item) {
      return db[table].add(item);
    },

    async bulkAdd(items) {
      return db[table].bulkAdd(items);
    },

    async update(id, changes) {
      return db[table].update(id, changes);
    },

    async put(item) {
      return db[table].put(item);
    },

    async delete(id) {
      return db[table].delete(id);
    },

    async clear() {
      return db[table].clear();
    },

    async count() {
      return db[table].count();
    },

    // Convenience methods
    async toggle(id, field) {
      const item = await this.get(id);
      if (!item) return;
      return this.update(id, { [field]: !item[field] });
    },

    async increment(id, field, amount = 1) {
      const item = await this.get(id);
      if (!item) return;
      return this.update(id, { [field]: (item[field] || 0) + amount });
    }
  };
}

/**
 * Subscribe to database changes (live queries)
 * @param {Dexie} db - Dexie database instance
 * @param {string} table - Table name
 * @param {Function} callback - Called with updated data
 * @returns {Function} Unsubscribe function
 */
export function subscribe(db, table, callback) {
  const observable = Dexie.liveQuery(() => db[table].toArray());
  const subscription = observable.subscribe({
    next: callback,
    error: err => console.error('DB subscription error:', err)
  });
  return () => subscription.unsubscribe();
}

export default { createDB, createStore, subscribe };
