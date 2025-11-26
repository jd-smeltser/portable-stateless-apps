# Templates

Starting points for new apps. Copy a template to `apps/your-app-name/` and customize.

## Available Templates

### `blank/`
Minimal starting point with core utilities wired up.
- Basic HTML shell with iOS meta tags
- Simple item list with add/delete
- ~100 lines of JS

### `list-app/`
Full-featured list application.
- Toggle (checkbox) support
- Grouping by field
- Import/Export buttons
- iOS Shortcuts integration
- ~200 lines of JS

## Usage

```bash
# Copy template
cp -r templates/list-app apps/my-app

# Edit apps/my-app/app.js - modify CONFIG and VALIDATION
# Edit apps/my-app/styles.css - customize appearance
```

## Template Structure

```
template/
├── index.html    # HTML shell (rarely needs changes)
├── app.js        # Main logic (customize CONFIG, VALIDATION, renderItem)
└── styles.css    # Styling (customize colors, layout)
```
