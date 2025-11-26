/**
 * Security Utilities
 * XSS sanitization and input validation
 */

/**
 * Sanitize a string to prevent XSS attacks
 * @param {string} str - Input string
 * @param {Object} options - { maxLength: number }
 * @returns {string} Sanitized string
 */
export function sanitize(str, { maxLength = 10000 } = {}) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize an object's string values recursively
 * @param {Object} obj - Input object
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized object
 */
export function sanitizeObject(obj, options = {}) {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitize(obj, options) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeObject(value, options);
  }
  return result;
}

/**
 * Validate data against a schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Field definitions
 * @returns {Object|null} Validated data or null if invalid
 *
 * @example
 * const schema = {
 *   title: { type: 'string', required: true, maxLength: 200 },
 *   count: { type: 'number', min: 0, max: 100 },
 *   status: { type: 'enum', values: ['active', 'done'] },
 *   url: { type: 'url' },
 *   date: { type: 'date' }
 * };
 */
export function validate(data, schema) {
  if (typeof data !== 'object' || data === null) return null;

  const result = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      console.warn(`Validation failed: ${field} is required`);
      return null;
    }

    // Skip undefined optional fields
    if (value === undefined) {
      if (rules.default !== undefined) {
        result[field] = rules.default;
      }
      continue;
    }

    // Type validation
    const validated = validateField(value, rules);
    if (validated === null && rules.required) {
      console.warn(`Validation failed: ${field} has invalid type`);
      return null;
    }

    if (validated !== null) {
      result[field] = validated;
    }
  }

  return result;
}

function validateField(value, rules) {
  switch (rules.type) {
    case 'string':
      if (typeof value !== 'string') return null;
      let str = sanitize(value, { maxLength: rules.maxLength || 10000 });
      if (rules.minLength && str.length < rules.minLength) return null;
      if (rules.pattern && !new RegExp(rules.pattern).test(str)) return null;
      return str;

    case 'number':
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(num)) return null;
      if (rules.min !== undefined && num < rules.min) return null;
      if (rules.max !== undefined && num > rules.max) return null;
      return num;

    case 'boolean':
      return Boolean(value);

    case 'date':
    case 'datetime':
      if (value === 'now') return new Date().toISOString();
      if (value === 'today') return new Date().toISOString().split('T')[0];
      if (typeof value !== 'string') return null;
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : value;

    case 'enum':
      return rules.values?.includes(value) ? value : rules.default || null;

    case 'url':
      try {
        return new URL(value).href;
      } catch {
        return null;
      }

    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value) ? sanitize(value) : null;

    case 'array':
      if (!Array.isArray(value)) return null;
      const maxItems = rules.maxItems || 100;
      return value.slice(0, maxItems).map(item =>
        rules.items ? validateField(item, rules.items) : item
      ).filter(item => item !== null);

    case 'object':
      if (typeof value !== 'object' || value === null) return null;
      return rules.schema ? validate(value, rules.schema) : sanitizeObject(value);

    default:
      return sanitizeObject(value);
  }
}

/**
 * Validate an array of items
 * @param {Array} items - Items to validate
 * @param {Object} schema - Field definitions
 * @param {Object} options - { maxItems: number }
 * @returns {Array} Valid items only
 */
export function validateArray(items, schema, { maxItems = 100 } = {}) {
  if (!Array.isArray(items)) {
    const single = validate(items, schema);
    return single ? [single] : [];
  }

  return items
    .slice(0, maxItems)
    .map(item => validate(item, schema))
    .filter(Boolean);
}

/**
 * Check if a string contains potentially dangerous content
 * @param {string} str - Input string
 * @returns {boolean} True if potentially dangerous
 */
export function isDangerous(str) {
  if (typeof str !== 'string') return false;
  const patterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];
  return patterns.some(p => p.test(str));
}

export default { sanitize, sanitizeObject, validate, validateArray, isDangerous };
