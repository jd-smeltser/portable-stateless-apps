# iOS Shortcuts Integration

## Quick Add (Single Task)

Build a Shortcut with these actions:

1. **Ask for Input** → "Task title"
2. **Set Variable** `title` to Provided Input
3. **Dictionary**
   ```json
   { "title": "[title]" }
   ```
4. **Get Dictionary Value** → all keys
5. **Base64 Encode**
6. **Text**: `https://YOUR-GITHUB-PAGES-URL/?add=[Base64 Text]`
7. **Open URLs**

## Add Task with Due Date

```json
{
  "title": "Buy groceries",
  "due": "2024-01-15T10:00:00Z",
  "priority": "high",
  "notes": "Don't forget milk"
}
```

## Bulk Import (Multiple Tasks)

```json
[
  { "title": "Task 1" },
  { "title": "Task 2", "due": "2024-01-20" },
  { "title": "Task 3", "priority": "low" }
]
```

**Note:** For bulk imports (>5 tasks), the URL may exceed Safari's limit.
Use the clipboard method instead:

1. Build JSON array
2. **Copy to Clipboard**
3. **Open URL**: `https://YOUR-GITHUB-PAGES-URL/`
4. Tap the clipboard import button in the app

## Supported Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Max 500 chars |
| `due` | ISO 8601 string | No | e.g., `2024-01-15` or `2024-01-15T10:00:00Z` |
| `priority` | string | No | `low`, `medium`, `high` |
| `notes` | string | No | Max 2000 chars |
| `completed` | boolean | No | Default: `false` |

## Compression (Optional)

For larger payloads, you can use gzip compression before Base64 encoding.
The app auto-detects gzip magic bytes and decompresses.

This requires a JavaScript bridge or a Mac with Shortcuts + shell scripting.
