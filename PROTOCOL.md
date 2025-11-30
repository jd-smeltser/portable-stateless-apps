# Portable Apps Protocol v1.0

A specification for building stateless, URL-based applications with cross-app data sharing.

## Core Principles

1. **Data lives in URLs** - Every record is a self-contained URL with encoded state
2. **Registry is shared** - All apps read/write to one local registry
3. **Records are universal** - Any app can create, read, link to any record
4. **Zero backend** - Everything runs client-side with localStorage/IndexedDB
5. **AI-readable** - This spec is the complete guide for any AI to build/deploy apps

---

## Record Schema

Every piece of data is a **Record**:

```json
{
  "id": "string",           // Unique ID (timestamp36 + random)
  "type": "string",         // Record type: note, task, event, asset, etc.
  "url": "string",          // Self-contained URL with encoded data
  "links": ["id", "id"],    // IDs of linked records (bidirectional refs)
  "tags": ["string"],       // User-defined tags
  "created": "ISO8601",     // Creation timestamp
  "updated": "ISO8601",     // Last modified timestamp
  "meta": {                 // Type-specific metadata (for queries without decoding)
    "title": "string",
    "ts": "number",         // Unix timestamp (for deduplication)
    // ...additional fields per type
  }
}
```

### Built-in Record Types

| Type | URL Data Schema | Meta Fields |
|------|-----------------|-------------|
| `note` | `{ t, b, ts }` | `title`, `preview`, `ts` |
| `task` | `{ t, b, done, ts }` | `title`, `done`, `ts` |
| `event` | `{ t, b, start, duration, ts }` | `title`, `start`, `duration`, `ts` |
| `asset` | `asset://{base64}` | `name`, `mimeType`, `size`, `width`, `height`, `ts` |
| `template` | Same as source type | `title`, `ts`, `sourceApp` |

### URL Encoding

Record data is stored in URL hash using LZ-String compression:

```javascript
// Encode
const hash = LZString.compressToEncodedURIComponent(JSON.stringify(state));
const url = `/apps/note/#${hash}`;

// Decode
const state = JSON.parse(LZString.decompressFromEncodedURIComponent(hash));
```

---

## Registry API

The Registry is the shared data layer. All apps import from `/core/registry.js`.

### CRUD Operations

```javascript
import Registry from '/core/registry.js';

// Create
const record = Registry.add(type, url, { links, tags, meta });

// Read
const record = Registry.get(id);
const records = Registry.all();
const notes = Registry.byType('note');
const tagged = Registry.byTag('important');

// Update
Registry.update(id, { url, links, tags, meta });

// Delete
Registry.remove(id);
```

### Queries

```javascript
// Complex query
const results = Registry.query({
  type: 'task',
  tag: 'work',
  meta: { done: false },
  search: 'keyword',
  sortBy: 'updated',
  sortOrder: 'desc',
  limit: 10
});

// Link traversal
const outgoing = Registry.linksFrom(id);  // Records this links to
const incoming = Registry.linkedTo(id);    // Records linking to this
```

### Subscriptions

```javascript
// React to any registry change
const unsubscribe = Registry.subscribe((event) => {
  // event: { action: 'add'|'update'|'remove'|'link'|'sync', record, ... }
});
```

---

## Cross-App Linking

### Link Syntax in Text

Records can reference other records using `@[Title](id)` syntax:

```
Meeting notes linked to @[Project Alpha](abc123) and @[Task: Review](def456)
```

### Asset References

Images/files use markdown-style syntax with asset ID:

```
Here's the screenshot: ![description](assetId)
```

### Creating Links

Use the Linker module for `@`-mention autocomplete:

```javascript
import Linker from '/core/linker.js';

Linker.init();
Linker.attach(textareaElement, {
  recordId: currentRecordId,  // For bidirectional linking
  excludeId: currentRecordId  // Don't show self in dropdown
});
```

### Link Resolution

```javascript
// Parse links from text
const links = Linker.parseLinks(text);
// Returns: [{ title, id, start, end, raw }, ...]

// Extract just IDs for storage
const linkIds = Linker.extractLinkIds(text);
```

---

## Omnibar (nvalt-style)

The Omnibar provides unified search/create functionality inspired by Notational Velocity:

- Always visible at top of app
- Typing searches all records instantly
- Enter creates new record with typed text as title
- `@app` prefix switches context (e.g., `@calendar Meeting` creates event)
- Cmd/Ctrl+K or `/` focuses the omnibar

### Usage

```javascript
import Omnibar from '/core/omnibar.js';

Omnibar.init({
  app: 'notes',                    // Current app ID from catalog
  onCreate: (title) => { ... },    // Called when creating new record
  onSelect: (record) => { ... }    // Called when selecting existing record
});
```

### Cross-App Creation

When user types `@tasks Buy groceries` in the Notes app:
1. Omnibar recognizes `@tasks` prefix
2. On Enter, navigates to `/apps/tasks/?create=Buy%20groceries`
3. Tasks app reads `create` param and creates task with that title

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↵` Enter | Create new or open selected |
| `↑↓` | Navigate results |
| `Esc` | Clear and close |
| `Cmd/Ctrl+K` | Focus omnibar |
| `/` | Focus omnibar (when not in input) |

---

## App Manifest

Every app has a manifest in its directory:

```json
{
  "name": "Notes",
  "id": "notes",
  "version": "1.0.0",
  "description": "Create and organize notes",

  "records": {
    "creates": ["note", "template"],
    "opens": ["note", "template", "task", "event"]
  },

  "entry": "index.html",

  "capabilities": {
    "assets": true,
    "linking": true,
    "templates": true
  }
}
```

### Record Handlers

Apps declare how they handle different record types:

- **creates**: Record types this app can create
- **opens**: Record types this app can display/edit (for cross-app navigation)

---

## App Catalog

The platform maintains a catalog of available apps:

```json
{
  "version": 1,
  "apps": {
    "notes": {
      "name": "Notes",
      "description": "Create and organize notes with linking",
      "url": "https://example.com/apps/notes/",
      "manifest": "manifest.json",
      "version": "1.0.0"
    },
    "tasks": {
      "name": "Tasks",
      "description": "Task management with cross-linking",
      "url": "https://example.com/apps/tasks/",
      "manifest": "manifest.json",
      "version": "1.0.0"
    }
  }
}
```

### Installation (JSON Paste)

Apps are installed by pasting a JSON bundle at `/installer/`:

```json
{
  "version": 1,
  "type": "app-bundle",
  "manifest": {
    "id": "my-app",
    "name": "My App",
    "description": "What this app does",
    "icon": "📱",
    "version": "1.0.0",
    "records": {
      "creates": ["my-type"],
      "opens": ["my-type", "note", "task"]
    }
  },
  "html": "<!DOCTYPE html><html>...complete app HTML...</html>",
  "recordTypes": {
    "my-type": {
      "name": "My Type",
      "icon": "📱",
      "schema": { "t": "string", "data": "any" }
    }
  }
}
```

The installer:
1. Validates bundle against schema
2. Stores in localStorage
3. Merges with static catalog
4. App runs via `/run/?app=my-app`

**For AI**: Read this protocol, generate a complete app as a JSON bundle, user pastes it to install.

---

## Platform Adapters

The same app code runs on multiple platforms via adapters:

### Web (Default)
Static HTML/JS served from any web server or file system.

### Progressive Web App (PWA)
Add `manifest.webmanifest` and service worker for installable offline app.

### Chrome Extension
Wrap in extension manifest with localStorage access.

### Safari Extension
Similar to Chrome with Safari-specific manifest.

### Electron
Wrap for desktop app distribution.

---

## Data Portability

### Export Formats

**Single Record URL:**
```
/apps/note/#compressed-state
```

**Record Bundle (with assets):**
```json
{
  "version": 1,
  "type": "record-bundle",
  "exported": "ISO8601",
  "records": [{ ...record }],
  "assets": [{ id, data, meta }]
}
```

**Full Registry Export:**
```json
{
  "version": 1,
  "type": "registry-export",
  "exported": "ISO8601",
  "records": [...all records...]
}
```

### Import

Bundles can be imported via:
- Drag & drop onto app
- File picker
- URL parameter: `?import=base64bundle`

---

## For AI Implementers

To create a new app:

1. Create directory in `/apps/{app-name}/`
2. Create `manifest.json` following App Manifest schema
3. Create `index.html` that imports core modules:
   ```javascript
   import Registry from '/core/registry.js';
   import Linker from '/core/linker.js';
   import Assets from '/core/assets.js';
   import Omnibar from '/core/omnibar.js';
   ```
4. Initialize Omnibar for nvalt-style search/create:
   ```javascript
   Omnibar.init({
     app: 'your-app-id',
     onCreate: (title) => createRecord(title),
     onSelect: (record) => {
       if (record.type === 'your-type') {
         selectRecord(record.id);
         return true; // handled locally
       }
       return false; // let omnibar navigate
     }
   });
   ```
5. Use Registry for all data operations
6. Support `@[Title](id)` linking syntax in any text fields
7. Handle incoming links via URL hash
8. Handle `?create=` URL parameter for cross-app record creation

To deploy to a platform:

1. Read the platform adapter requirements
2. Bundle core + app files
3. Add platform-specific manifest/wrapper
4. Output deployable package

---

## Storage

### localStorage (Default)
- Registry stored at key: `url-registry`
- Format: `{ version: 1, records: [...] }`

### Cross-Tab Sync
Registry listens to `storage` events for cross-tab synchronization.

### Size Limits
- localStorage: ~5-10MB depending on browser
- For larger datasets, apps can implement IndexedDB adapter

---

## Security Considerations

- All data is local - no server transmission
- URLs can be shared but contain the full data
- Asset base64 is stored locally, only ID shared in links
- No authentication required (single-user local app)
- Export bundles may contain sensitive data - user responsibility

---

## Version History

- **1.0.0** - Initial protocol specification
