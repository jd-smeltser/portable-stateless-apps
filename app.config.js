/**
 * APP CONFIGURATION
 * =================
 * AI agents: Modify this file to create any app.
 * The platform handles storage, ingestion, and UI rendering.
 */

export const AppConfig = {
  // App metadata
  name: 'Tasks',
  icon: '✓',
  version: 1,

  // Primary entity (the main "thing" this app manages)
  primaryEntity: 'tasks',

  // Dexie schema definitions
  // Format: { storeName: 'keyPath, index1, index2, ...' }
  // Prefix with ++ for auto-increment, & for unique, * for multi-entry
  schema: {
    tasks: '++id, title, due, completed, priority, createdAt'
  },

  // Entity definitions for validation and UI
  entities: {
    tasks: {
      // Display configuration
      display: {
        singular: 'Task',
        plural: 'Tasks',
        icon: '☐',
        completedIcon: '☑',
        emptyState: 'No tasks yet. Add one below!'
      },

      // Field definitions
      fields: {
        id: {
          type: 'number',
          auto: true,
          hidden: true
        },
        title: {
          type: 'string',
          required: true,
          maxLength: 500,
          placeholder: 'What needs to be done?',
          display: 'primary' // Shows as main text
        },
        notes: {
          type: 'string',
          maxLength: 2000,
          placeholder: 'Additional notes...',
          display: 'secondary',
          multiline: true
        },
        due: {
          type: 'date',
          display: 'badge',
          format: 'relative' // 'relative' | 'short' | 'long'
        },
        priority: {
          type: 'enum',
          options: ['low', 'medium', 'high'],
          default: 'medium',
          display: 'badge',
          colors: {
            low: '#8e8e93',
            medium: '#ff9500',
            high: '#ff3b30'
          }
        },
        completed: {
          type: 'boolean',
          default: false,
          display: 'checkbox'
        },
        createdAt: {
          type: 'datetime',
          auto: true,
          hidden: true
        }
      },

      // List view configuration
      listView: {
        groupBy: 'completed',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        groups: {
          false: { label: null, collapsed: false },
          true: { label: 'Completed', collapsed: true }
        }
      },

      // Quick add form (bottom input)
      quickAdd: {
        fields: ['title'],
        defaults: {
          completed: false,
          priority: 'medium'
        }
      },

      // Full form (for editing)
      form: {
        fields: ['title', 'notes', 'due', 'priority']
      },

      // Actions available on each item
      actions: {
        toggle: {
          field: 'completed',
          icon: 'checkbox'
        },
        delete: {
          confirm: false,
          icon: 'trash'
        }
      }
    }
  },

  // URL ingestion configuration
  ingestion: {
    paramName: 'add',
    encoding: 'base64', // 'base64' | 'base64-gzip' | 'json'
    maxItems: 100,
    targetEntity: 'tasks'
  },

  // Export configuration
  export: {
    formats: ['text', 'json'],
    textTemplate: (item) => `☐ ${item.title}${item.due ? ` (${item.due})` : ''}`
  },

  // Theme overrides (optional)
  theme: {
    accent: '#007aff',
    // Override any CSS variable here
  }
};

// =============================================================================
// EXAMPLE CONFIGS FOR OTHER APP TYPES
// =============================================================================

/**
 * HABIT TRACKER
 */
export const HabitTrackerConfig = {
  name: 'Habits',
  icon: '🔥',
  version: 1,
  primaryEntity: 'habits',

  schema: {
    habits: '++id, name, frequency, streak, lastCompleted',
    completions: '++id, habitId, date'
  },

  entities: {
    habits: {
      display: {
        singular: 'Habit',
        plural: 'Habits',
        emptyState: 'Start building better habits!'
      },
      fields: {
        id: { type: 'number', auto: true, hidden: true },
        name: { type: 'string', required: true, maxLength: 200, display: 'primary' },
        frequency: {
          type: 'enum',
          options: ['daily', 'weekly', 'monthly'],
          default: 'daily',
          display: 'badge'
        },
        streak: { type: 'number', default: 0, display: 'badge', suffix: '🔥' },
        lastCompleted: { type: 'date', hidden: true }
      },
      quickAdd: { fields: ['name'] },
      actions: {
        complete: { handler: 'incrementStreak', icon: 'check' },
        delete: { icon: 'trash' }
      }
    }
  },

  ingestion: { paramName: 'add', targetEntity: 'habits' }
};

/**
 * BOOKMARK MANAGER
 */
export const BookmarkConfig = {
  name: 'Links',
  icon: '🔗',
  version: 1,
  primaryEntity: 'bookmarks',

  schema: {
    bookmarks: '++id, title, url, *tags, createdAt',
    tags: '++id, &name, color'
  },

  entities: {
    bookmarks: {
      display: {
        singular: 'Bookmark',
        plural: 'Bookmarks',
        emptyState: 'Save your first link!'
      },
      fields: {
        id: { type: 'number', auto: true, hidden: true },
        title: { type: 'string', required: true, display: 'primary' },
        url: { type: 'url', required: true, display: 'link' },
        tags: { type: 'array', of: 'string', display: 'tags' },
        createdAt: { type: 'datetime', auto: true, hidden: true }
      },
      quickAdd: { fields: ['url'] }, // Auto-fetch title from URL
      actions: {
        open: { handler: 'openUrl', icon: 'external' },
        delete: { icon: 'trash' }
      }
    }
  },

  ingestion: { paramName: 'add', targetEntity: 'bookmarks' }
};

/**
 * EXPENSE TRACKER
 */
export const ExpenseConfig = {
  name: 'Expenses',
  icon: '💰',
  version: 1,
  primaryEntity: 'expenses',

  schema: {
    expenses: '++id, amount, category, date, note',
    categories: '++id, &name, budget'
  },

  entities: {
    expenses: {
      display: {
        singular: 'Expense',
        plural: 'Expenses',
        emptyState: 'Track your spending!'
      },
      fields: {
        id: { type: 'number', auto: true, hidden: true },
        amount: { type: 'currency', required: true, display: 'primary', currency: 'USD' },
        category: { type: 'relation', entity: 'categories', display: 'badge' },
        date: { type: 'date', default: 'today', display: 'secondary' },
        note: { type: 'string', maxLength: 500 }
      },
      listView: {
        groupBy: 'date',
        sortBy: 'date',
        sortOrder: 'desc',
        aggregate: { field: 'amount', fn: 'sum', display: 'header' }
      },
      quickAdd: { fields: ['amount', 'category'] }
    }
  }
};

export default AppConfig;
