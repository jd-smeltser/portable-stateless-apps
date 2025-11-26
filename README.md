# Portable Stateless Apps

Zero-dependency, static SPAs for iOS with Shortcuts integration. No backend, no database, no auth - just GitHub Pages + localStorage/IndexedDB.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  iOS Shortcut                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Build JSON  │ →  │ Base64 Encode │ →  │ Open URL + param │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Static SPA (GitHub Pages)                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Decode URL  │ →  │ Validate     │ →  │ Store in IndexedDB│   │
│  │ param       │    │ + Sanitize   │    │ (via Dexie)      │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│         ↓                                        ↓              │
│  ┌─────────────┐                        ┌──────────────────┐   │
│  │ Clean URL   │                        │ Render UI        │   │
│  │ (replaceState)                       │                  │   │
│  └─────────────┘                        └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
portable-stateless-apps/
├── core/                    # Reusable platform utilities
│   ├── db.js               # Dexie wrapper (createDB, createStore)
│   ├── ingestion.js        # URL param decoding (processUrl)
│   ├── security.js         # XSS sanitization (validate, sanitize)
│   ├── share.js            # Web Share API (shareItems, importFromClipboard)
│   ├── ios.js              # iOS helpers (setupIOS, createToast, formatDate)
│   └── index.js            # Re-exports all utilities
│
├── templates/               # Starting points for new apps
│   ├── blank/              # Minimal template
│   └── list-app/           # Full-featured list template
│
└── apps/                    # Your apps go here
    └── task-manager/        # Example app
```

## For AI Agents

### Creating a New App

1. Copy a template:
   ```bash
   cp -r templates/list-app apps/my-new-app
   ```

2. Edit `apps/my-new-app/app.js`:
   - Modify `CONFIG` (name, schema)
   - Modify `VALIDATION` (field rules)
   - Modify `renderItem()` for custom display

3. Edit `apps/my-new-app/styles.css`:
   - Customize colors via CSS variables
   - Add app-specific styles

### Core Utilities Reference

```javascript
// Database
import { createDB, createStore } from '../../core/db.js';
const db = createDB({ name: 'MyApp', version: 1, schema: { items: '++id, name' } });
const store = createStore(db, 'items');
await store.add({ name: 'Item 1' });
await store.getAll({ sortBy: 'name' });
await store.toggle(id, 'completed');
await store.delete(id);

// URL Ingestion
import { processUrl } from '../../core/ingestion.js';
const { data, count } = await processUrl({ param: 'add' });

// Security
import { validate, sanitize } from '../../core/security.js';
const clean = validate(data, { name: { type: 'string', required: true } });

// Sharing
import { shareItems, importFromClipboard } from '../../core/share.js';
await shareItems(items, { formatter: i => i.name });
const imported = await importFromClipboard();

// iOS
import { setupIOS, createToast, formatDate } from '../../core/ios.js';
setupIOS();
const showToast = createToast(document.getElementById('toast'));
showToast('Hello!', 'success');
```

### Validation Schema

```javascript
const VALIDATION = {
  name:     { type: 'string', required: true, maxLength: 200 },
  count:    { type: 'number', min: 0, max: 100 },
  status:   { type: 'enum', values: ['active', 'done'], default: 'active' },
  url:      { type: 'url' },
  email:    { type: 'email' },
  date:     { type: 'date' },           // ISO string or 'today'
  created:  { type: 'datetime' },       // Use 'now' for current timestamp
  tags:     { type: 'array', items: { type: 'string' } },
  metadata: { type: 'object' }
};
```

### Field Types

| Type | Description | Options |
|------|-------------|---------|
| `string` | Text, XSS sanitized | `required`, `maxLength`, `minLength`, `pattern` |
| `number` | Numeric | `min`, `max` |
| `boolean` | true/false | `default` |
| `date` | ISO date string | Accepts `'today'` |
| `datetime` | ISO datetime | Accepts `'now'` |
| `enum` | Constrained values | `values: []`, `default` |
| `url` | Validated URL | - |
| `email` | Validated email | - |
| `array` | Array of items | `items: {}`, `maxItems` |
| `object` | Nested object | `schema: {}` |

## iOS Shortcuts Integration

### URL Format

```
https://your-app.github.io/apps/task-manager/?add=BASE64_PAYLOAD
```

### Single Item

```json
{"title": "Buy milk", "due": "2024-01-15"}
```

### Bulk Import

```json
[
  {"title": "Task 1"},
  {"title": "Task 2", "priority": "high"}
]
```

### Shortcut Steps

1. **Ask for Input** → Task title
2. **Dictionary** → `{"title": "[input]"}`
3. **Base64 Encode**
4. **Text** → `https://your-app.github.io/?add=[encoded]`
5. **Open URLs**

## Limitations

- **URL Length**: ~2000 chars on iOS Safari. Use clipboard import for bulk data.
- **PWA Storage Isolation**: Safari and PWA have separate storage. Use Safari-only mode.
- **No Background Sync**: Notifications require the tab to be open.

## Deployment

1. Push to GitHub
2. Settings → Pages → Deploy from branch
3. Access at `https://username.github.io/repo/apps/app-name/`
