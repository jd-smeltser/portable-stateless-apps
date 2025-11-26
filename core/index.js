/**
 * Core Platform Utilities
 * Import from this file for all platform features
 *
 * @example
 * import { createDB, createStore } from './core/index.js';
 * import { processUrl } from './core/index.js';
 * import { sanitize, validate } from './core/index.js';
 */

export * from './db.js';
export * from './security.js';
export * from './ingestion.js';
export * from './share.js';
export * from './ios.js';

// Convenience re-exports
export { default as db } from './db.js';
export { default as security } from './security.js';
export { default as ingestion } from './ingestion.js';
export { default as share } from './share.js';
export { default as ios } from './ios.js';
