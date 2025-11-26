/**
 * URL Ingestion Utilities
 * Handle data ingestion via URL parameters (for iOS Shortcuts integration)
 */

/**
 * Decode a URL payload
 * Supports: plain JSON, Base64, Base64+Gzip, URI-encoded
 * @param {string} payload - Encoded payload string
 * @returns {Promise<any>} Decoded data or null
 */
export async function decode(payload) {
  if (!payload) return null;

  // Try plain JSON first (URL-encoded)
  try {
    return JSON.parse(decodeURIComponent(payload));
  } catch {}

  // Try Base64
  try {
    const binary = Uint8Array.from(atob(payload), c => c.charCodeAt(0));

    // Check for gzip magic bytes
    if (binary[0] === 0x1f && binary[1] === 0x8b) {
      const stream = new Blob([binary])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    }

    // Plain Base64
    return JSON.parse(atob(payload));
  } catch {}

  return null;
}

/**
 * Encode data for URL transport
 * @param {any} data - Data to encode
 * @param {string} method - 'base64' | 'gzip' | 'uri'
 * @returns {Promise<string>} Encoded string
 */
export async function encode(data, method = 'base64') {
  const json = JSON.stringify(data);

  switch (method) {
    case 'uri':
      return encodeURIComponent(json);

    case 'gzip':
      const stream = new Blob([json])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(buffer)));

    case 'base64':
    default:
      return btoa(json);
  }
}

/**
 * Process URL parameters for data ingestion
 * Automatically cleans URL after processing
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} { data: any, count: number, param: string }
 *
 * @example
 * const { data, count } = await processUrl({
 *   param: 'add',           // URL param name (default: 'add')
 *   clean: true,            // Remove param after processing (default: true)
 *   validate: (item) => item.title?.length > 0  // Optional validation
 * });
 */
export async function processUrl(options = {}) {
  const {
    param = 'add',
    clean = true,
    validate = null,
    maxItems = 100
  } = options;

  const params = new URLSearchParams(window.location.search);
  const payload = params.get(param);

  if (!payload) {
    return { data: null, count: 0, param };
  }

  // Clean URL immediately to prevent duplicate processing
  if (clean) {
    const cleanUrl = window.location.pathname + window.location.hash;
    history.replaceState(null, '', cleanUrl);
  }

  const data = await decode(payload);
  if (!data) {
    return { data: null, count: 0, param, error: 'decode_failed' };
  }

  // Normalize to array
  let items = Array.isArray(data) ? data : [data];

  // Apply limit
  items = items.slice(0, maxItems);

  // Apply validation if provided
  if (validate) {
    items = items.filter(validate);
  }

  return {
    data: items,
    count: items.length,
    param
  };
}

/**
 * Build an ingestion URL
 * @param {string} baseUrl - Base app URL
 * @param {any} data - Data to include
 * @param {Object} options - { param: string, method: string }
 * @returns {Promise<string>} Complete URL with encoded data
 */
export async function buildUrl(baseUrl, data, options = {}) {
  const { param = 'add', method = 'base64' } = options;
  const encoded = await encode(data, method);
  const url = new URL(baseUrl);
  url.searchParams.set(param, encoded);
  return url.toString();
}

/**
 * Get estimated URL length for given data
 * Useful for checking if data will fit in URL limits
 * @param {any} data - Data to check
 * @param {string} method - Encoding method
 * @returns {Promise<number>} Estimated character count
 */
export async function estimateUrlLength(data, method = 'base64') {
  const encoded = await encode(data, method);
  return encoded.length;
}

/**
 * Check if data fits within URL length limits
 * @param {any} data - Data to check
 * @param {number} maxLength - Maximum URL length (default: 2000 for Safari)
 * @returns {Promise<boolean>}
 */
export async function fitsInUrl(data, maxLength = 2000) {
  const length = await estimateUrlLength(data);
  return length < maxLength;
}

export default { decode, encode, processUrl, buildUrl, estimateUrlLength, fitsInUrl };
