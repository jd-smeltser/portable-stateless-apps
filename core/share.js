/**
 * Share Utilities
 * Web Share API and Clipboard helpers
 */

/**
 * Share text content via Web Share API or clipboard fallback
 * @param {Object} options - { title, text, url }
 * @returns {Promise<boolean>} Success status
 */
export async function shareText({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false; // User cancelled
      console.warn('Share failed, falling back to clipboard:', e);
    }
  }

  // Fallback to clipboard
  return copyToClipboard(text || url || title);
}

/**
 * Share a file via Web Share API
 * @param {Object} options - { filename, content, mimeType, title }
 * @returns {Promise<boolean>} Success status
 */
export async function shareFile({ filename, content, mimeType = 'application/json', title }) {
  const file = new File([content], filename, { type: mimeType });
  const shareData = { files: [file], title };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      console.warn('File share failed:', e);
    }
  }

  // Fallback to clipboard
  return copyToClipboard(content);
}

/**
 * Share items as formatted text
 * @param {Array} items - Items to share
 * @param {Object} options - { title, formatter }
 * @returns {Promise<boolean>}
 */
export async function shareItems(items, { title = 'Items', formatter = defaultFormatter } = {}) {
  const text = items.map(formatter).join('\n');
  return shareText({ title, text });
}

/**
 * Share items as JSON file
 * @param {Array} items - Items to export
 * @param {string} filename - Output filename
 * @returns {Promise<boolean>}
 */
export async function shareAsJSON(items, filename = 'data.json') {
  const content = JSON.stringify(items, null, 2);
  return shareFile({ filename, content, mimeType: 'application/json' });
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error('Clipboard write failed:', e);
    return false;
  }
}

/**
 * Read text from clipboard
 * @returns {Promise<string|null>} Clipboard text or null
 */
export async function readFromClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    console.error('Clipboard read failed:', e);
    return null;
  }
}

/**
 * Import JSON data from clipboard
 * @param {Object} options - { validate: Function, maxItems: number }
 * @returns {Promise<Array|null>} Parsed items or null
 */
export async function importFromClipboard({ validate, maxItems = 100 } = {}) {
  const text = await readFromClipboard();
  if (!text) return null;

  try {
    let data = JSON.parse(text);
    let items = Array.isArray(data) ? data : [data];

    items = items.slice(0, maxItems);

    if (validate) {
      items = items.filter(validate);
    }

    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/**
 * Check if Web Share API is available
 * @returns {boolean}
 */
export function canShare() {
  return !!navigator.share;
}

/**
 * Check if file sharing is available
 * @returns {boolean}
 */
export function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
  return navigator.canShare({ files: [testFile] });
}

function defaultFormatter(item) {
  if (typeof item === 'string') return item;
  return item.title || item.name || JSON.stringify(item);
}

export default {
  shareText,
  shareFile,
  shareItems,
  shareAsJSON,
  copyToClipboard,
  readFromClipboard,
  importFromClipboard,
  canShare,
  canShareFiles
};
