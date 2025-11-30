/**
 * Assets - Base64 encoded media storage
 *
 * Assets are stored as registry records with base64 data.
 * Other records reference assets by UUID only - the base64 is looked up on render.
 *
 * Asset syntax in text: ![alt text](assetId)
 * Rendered as: <img src="data:mimeType;base64,..." alt="alt text">
 */

import Registry from './registry.js';

const ASSET_TYPE = 'asset';
const MAX_SIZE_MB = 5; // Max file size in MB

/**
 * Asset record structure:
 * {
 *   id: string,
 *   type: 'asset',
 *   url: 'asset://base64data...',  // Using asset:// protocol to store base64
 *   meta: {
 *     name: string,        // Original filename
 *     mimeType: string,    // e.g., 'image/png'
 *     size: number,        // Size in bytes
 *     width: number,       // Image dimensions (if applicable)
 *     height: number,
 *     ts: number           // Timestamp
 *   }
 * }
 */

// ============================================
// Asset CRUD
// ============================================

/**
 * Create an asset from a File object
 */
export async function createFromFile(file) {
  // Validate file size
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large. Maximum size is ${MAX_SIZE_MB}MB`);
  }

  // Read file as base64
  const base64 = await fileToBase64(file);

  // Get dimensions if it's an image
  let width, height;
  if (file.type.startsWith('image/')) {
    const dims = await getImageDimensions(base64, file.type);
    width = dims.width;
    height = dims.height;
  }

  const ts = Date.now();

  // Store in registry with asset:// protocol URL
  const record = Registry.add(ASSET_TYPE, `asset://${base64}`, {
    meta: {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      width,
      height,
      ts
    }
  });

  return record;
}

/**
 * Create an asset from a base64 string directly
 */
export function createFromBase64(base64, mimeType, name = 'asset') {
  const ts = Date.now();

  // Remove data URL prefix if present
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');

  const record = Registry.add(ASSET_TYPE, `asset://${cleanBase64}`, {
    meta: {
      name,
      mimeType,
      size: Math.round(cleanBase64.length * 0.75), // Approximate decoded size
      ts
    }
  });

  return record;
}

/**
 * Import an asset with a specific ID (for shared URL import)
 * This preserves the original ID so references still work
 */
export function importWithId(id, base64, meta) {
  // Check if already exists
  if (get(id)) return get(id);

  // Directly manipulate the registry's internal storage
  // This is a special case for importing shared assets
  const record = {
    id,
    type: ASSET_TYPE,
    url: `asset://${base64}`,
    links: [],
    tags: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    meta: meta || {}
  };

  // Get registry records and add directly
  const allRecords = Registry.all();
  allRecords.unshift(record);

  // Force save by updating a dummy field
  // We need to access the internal save mechanism
  // Use localStorage directly as a workaround
  try {
    const stored = localStorage.getItem('url-registry');
    const data = stored ? JSON.parse(stored) : { version: 1, records: [] };
    data.records.unshift(record);
    localStorage.setItem('url-registry', JSON.stringify(data));
    // Reload registry
    Registry.reload();
  } catch (e) {
    console.error('Failed to import asset:', e);
    return null;
  }

  return record;
}

/**
 * Get an asset by ID
 */
export function get(id) {
  const record = Registry.get(id);
  if (!record || record.type !== ASSET_TYPE) return null;
  return record;
}

/**
 * Get the data URL for an asset (for rendering in img src)
 */
export function getDataUrl(id) {
  const record = get(id);
  if (!record) return null;

  const base64 = record.url.replace('asset://', '');
  return `data:${record.meta.mimeType};base64,${base64}`;
}

/**
 * Get all assets
 */
export function all() {
  return Registry.byType(ASSET_TYPE);
}

/**
 * Delete an asset
 */
export function remove(id) {
  return Registry.remove(id);
}

// ============================================
// Text Parsing & Rendering
// ============================================

const ASSET_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Parse asset references from text
 * Returns array of { alt, id, start, end }
 */
export function parseAssets(text) {
  const assets = [];
  let match;
  const regex = new RegExp(ASSET_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    assets.push({
      alt: match[1],
      id: match[2],
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0]
    });
  }
  return assets;
}

/**
 * Extract asset IDs from text
 */
export function extractAssetIds(text) {
  return parseAssets(text).map(a => a.id);
}

/**
 * Create asset reference syntax
 */
export function createReference(id, alt = '') {
  return `![${alt}](${id})`;
}

// ============================================
// Utilities
// ============================================

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data URL prefix, keep just base64
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(base64, mimeType) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// ============================================
// Export
// ============================================

const Assets = {
  createFromFile,
  createFromBase64,
  importWithId,
  get,
  getDataUrl,
  all,
  remove,
  parseAssets,
  extractAssetIds,
  createReference,
  MAX_SIZE_MB
};

if (typeof window !== 'undefined') {
  window.Assets = Assets;
}

export default Assets;
