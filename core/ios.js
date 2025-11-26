/**
 * iOS Utilities
 * Safari/iOS-specific helpers for PWA-like experiences
 */

/**
 * Detect if running on iOS
 * @returns {boolean}
 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect if running as standalone PWA (added to home screen)
 * @returns {boolean}
 */
export function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Detect if running in Safari
 * @returns {boolean}
 */
export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/**
 * Get safe area insets
 * @returns {Object} { top, right, bottom, left }
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--safe-top') || '0'),
    right: parseInt(style.getPropertyValue('--safe-right') || '0'),
    bottom: parseInt(style.getPropertyValue('--safe-bottom') || '0'),
    left: parseInt(style.getPropertyValue('--safe-left') || '0')
  };
}

/**
 * Setup safe area CSS variables
 * Call this on app init
 */
export function setupSafeAreas() {
  const root = document.documentElement;
  root.style.setProperty('--safe-top', 'env(safe-area-inset-top, 0px)');
  root.style.setProperty('--safe-right', 'env(safe-area-inset-right, 0px)');
  root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
  root.style.setProperty('--safe-left', 'env(safe-area-inset-left, 0px)');
}

/**
 * Request screen wake lock (keep screen on)
 * @returns {Promise<WakeLockSentinel|null>}
 */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return null;

  try {
    return await navigator.wakeLock.request('screen');
  } catch (e) {
    console.warn('Wake lock request failed:', e);
    return null;
  }
}

/**
 * Setup automatic wake lock management
 * Releases on visibility change, re-acquires when visible
 * @returns {Function} Cleanup function
 */
export function setupWakeLock() {
  let wakeLock = null;

  async function acquire() {
    if (document.visibilityState === 'visible') {
      wakeLock = await requestWakeLock();
    }
  }

  function release() {
    wakeLock?.release();
    wakeLock = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      acquire();
    } else {
      release();
    }
  });

  acquire();

  return release;
}

/**
 * Trigger haptic feedback (if available)
 * @param {string} style - 'light' | 'medium' | 'heavy'
 */
export function haptic(style = 'light') {
  // iOS Safari doesn't support Vibration API, but this is here for future/Android
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30]
    };
    navigator.vibrate(patterns[style] || patterns.light);
  }
}

/**
 * Simple toast notification system
 * @param {HTMLElement} container - Toast container element
 * @returns {Function} showToast function
 */
export function createToast(container) {
  let timeout;

  return function showToast(message, type = 'info', duration = 3000) {
    clearTimeout(timeout);

    container.textContent = message;
    container.className = `toast ${type} show`;

    timeout = setTimeout(() => {
      container.className = 'toast';
    }, duration);
  };
}

/**
 * Format date in iOS-friendly relative format
 * @param {string|Date} date - Date to format
 * @returns {string}
 */
export function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';

  // Within a week
  const diff = Math.floor((target - today) / (1000 * 60 * 60 * 24));
  if (diff > 0 && diff < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }

  // Default format
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Prevent pull-to-refresh and overscroll
 */
export function preventOverscroll() {
  document.body.style.overscrollBehavior = 'none';
}

/**
 * Setup viewport for iOS
 * Handles keyboard, orientation changes
 */
export function setupViewport() {
  // Prevent zoom on input focus
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
  }

  // Handle orientation changes
  window.addEventListener('orientationchange', () => {
    // Small delay to let iOS settle
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);
  });
}

/**
 * Full iOS setup - call on app init
 */
export function setupIOS() {
  setupSafeAreas();
  setupViewport();
  preventOverscroll();

  if (isIOS()) {
    document.documentElement.classList.add('ios');
    if (isStandalone()) {
      document.documentElement.classList.add('standalone');
    }
  }
}

export default {
  isIOS,
  isStandalone,
  isSafari,
  getSafeAreaInsets,
  setupSafeAreas,
  requestWakeLock,
  setupWakeLock,
  haptic,
  createToast,
  formatDate,
  preventOverscroll,
  setupViewport,
  setupIOS
};
