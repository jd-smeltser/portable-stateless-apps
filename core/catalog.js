/**
 * Catalog - Manages app registry (static + installed)
 *
 * Merges catalog.json with localStorage installed apps
 *
 * Usage:
 *   import Catalog from '/core/catalog.js';
 *   const apps = await Catalog.getApps();
 *   const types = await Catalog.getRecordTypes();
 */

const STORAGE_KEY = 'installed-apps';

let staticCatalog = null;
let installedApps = null;

// Load static catalog.json
async function loadStaticCatalog() {
  if (staticCatalog) return staticCatalog;
  try {
    staticCatalog = await fetch('/catalog.json').then(r => r.json());
  } catch (e) {
    staticCatalog = { apps: {}, recordTypes: {} };
  }
  return staticCatalog;
}

// Load installed apps from localStorage
function loadInstalledApps() {
  if (installedApps) return installedApps;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    installedApps = data ? JSON.parse(data) : { apps: {} };
  } catch (e) {
    installedApps = { apps: {} };
  }
  return installedApps;
}

// Save installed apps to localStorage
function saveInstalledApps() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(installedApps));
}

// Get merged apps (static + installed)
async function getApps() {
  const static_ = await loadStaticCatalog();
  const installed = loadInstalledApps();

  const apps = { ...static_.apps };

  // Add installed apps
  Object.entries(installed.apps).forEach(([id, bundle]) => {
    apps[id] = {
      name: bundle.manifest.name,
      description: bundle.manifest.description,
      icon: bundle.manifest.icon,
      version: bundle.manifest.version,
      path: `/run/?app=${id}`,  // Special path for installed apps
      records: bundle.manifest.records,
      installed: true
    };
  });

  return apps;
}

// Get merged record types
async function getRecordTypes() {
  const static_ = await loadStaticCatalog();
  const installed = loadInstalledApps();

  const types = { ...static_.recordTypes };

  // Add record types from installed apps
  Object.entries(installed.apps).forEach(([id, bundle]) => {
    if (bundle.recordTypes) {
      Object.entries(bundle.recordTypes).forEach(([typeId, typeInfo]) => {
        types[typeId] = {
          ...typeInfo,
          primaryApp: id
        };
      });
    }
  });

  return types;
}

// Get full merged catalog
async function getCatalog() {
  return {
    apps: await getApps(),
    recordTypes: await getRecordTypes()
  };
}

// Install an app from bundle
function install(bundle) {
  // Validate bundle
  if (!bundle.manifest?.id) {
    throw new Error('Bundle missing manifest.id');
  }
  if (!bundle.manifest?.name) {
    throw new Error('Bundle missing manifest.name');
  }
  if (!bundle.html) {
    throw new Error('Bundle missing html');
  }

  const id = bundle.manifest.id;

  // Check for conflicts with static apps
  if (staticCatalog?.apps?.[id]) {
    throw new Error(`App "${id}" conflicts with built-in app`);
  }

  loadInstalledApps();
  installedApps.apps[id] = bundle;
  saveInstalledApps();

  return id;
}

// Uninstall an app
function uninstall(id) {
  loadInstalledApps();
  if (!installedApps.apps[id]) {
    throw new Error(`App "${id}" not found`);
  }
  delete installedApps.apps[id];
  saveInstalledApps();
}

// Get installed app bundle (for running)
function getInstalledApp(id) {
  loadInstalledApps();
  return installedApps.apps[id] || null;
}

// List installed app IDs
function listInstalled() {
  loadInstalledApps();
  return Object.keys(installedApps.apps);
}

// Validate a bundle before install
function validate(bundle) {
  const errors = [];

  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['Bundle must be a JSON object'] };
  }

  if (bundle.version !== 1) {
    errors.push('Bundle version must be 1');
  }

  if (bundle.type !== 'app-bundle') {
    errors.push('Bundle type must be "app-bundle"');
  }

  if (!bundle.manifest) {
    errors.push('Bundle missing manifest');
  } else {
    if (!bundle.manifest.id || typeof bundle.manifest.id !== 'string') {
      errors.push('manifest.id must be a non-empty string');
    } else if (!/^[a-z0-9-]+$/.test(bundle.manifest.id)) {
      errors.push('manifest.id must be lowercase alphanumeric with dashes');
    }

    if (!bundle.manifest.name) {
      errors.push('manifest.name is required');
    }

    if (!bundle.manifest.icon) {
      errors.push('manifest.icon is required');
    }
  }

  if (!bundle.html || typeof bundle.html !== 'string') {
    errors.push('Bundle missing html (must be a string)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export bundle format documentation
const BUNDLE_SCHEMA = `
{
  "version": 1,
  "type": "app-bundle",
  "manifest": {
    "id": "my-app",           // lowercase, alphanumeric, dashes only
    "name": "My App",
    "description": "What it does",
    "icon": "📱",
    "version": "1.0.0",
    "records": {
      "creates": ["my-type"],  // Record types this app creates
      "opens": ["my-type", "note"]  // Types it can open
    }
  },
  "html": "<!DOCTYPE html>...",  // Complete HTML app
  "recordTypes": {               // Optional: new record types
    "my-type": {
      "name": "My Type",
      "icon": "📱",
      "schema": { "t": "string", "data": "any" }
    }
  }
}
`;

export default {
  getApps,
  getRecordTypes,
  getCatalog,
  install,
  uninstall,
  getInstalledApp,
  listInstalled,
  validate,
  BUNDLE_SCHEMA
};
