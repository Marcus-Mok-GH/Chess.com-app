/**
 * Haptic feedback utility for mobile interactions
 * Provides tactile feedback on supported devices
 */

// Check if vibration API is supported
const isVibrationSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// Vibration patterns
const PATTERNS = {
  light: 15,        // Light tap - piece selection
  medium: 25,       // Medium feedback - move made
  heavy: 40,        // Heavy feedback - capture, check
  success: [30, 50, 30],  // Success pattern - game won
  error: [50, 30, 50],    // Error pattern - illegal move
  warning: [20, 40, 20],  // Warning pattern - check
};

/**
 * Trigger haptic feedback
 * @param {string} type - Type of feedback: 'light', 'medium', 'heavy', 'success', 'error', 'warning'
 * @param {boolean} force - Force feedback even if reduced motion is enabled
 */
export function haptic(type = 'light', force = false) {
  // Check if reduced motion is preferred (unless forced)
  if (!force && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Check if vibration is supported
  if (!isVibrationSupported) {
    return;
  }
  
  // Check if user has enabled haptic feedback in settings
  const hapticEnabled = window.__HAPTIC_ENABLED__ !== false;
  if (!hapticEnabled) {
    return;
  }
  
  const pattern = PATTERNS[type] || PATTERNS.light;
  
  try {
    navigator.vibrate(pattern);
  } catch (e) {
    // Ignore errors - vibration API might not work on some devices
    console.debug('Haptic feedback failed:', e);
  }
}

/**
 * Quick feedback for common actions
 */
export const haptics = {
  select: () => haptic('light'),
  move: () => haptic('medium'),
  capture: () => haptic('heavy'),
  check: () => haptic('warning'),
  win: () => haptic('success'),
  lose: () => haptic('error'),
  draw: () => haptic('medium'),
  illegal: () => haptic('error'),
  button: () => haptic('light'),
  swipe: () => haptic('light'),
  scroll: () => haptic('light'),
};

/**
 * Check if haptic feedback is available on this device
 */
export function isHapticAvailable() {
  return isVibrationSupported;
}

/**
 * Enable/disable haptic feedback
 */
export function setHapticEnabled(enabled) {
  window.__HAPTIC_ENABLED__ = enabled;
}

/**
 * Check if haptic feedback is currently enabled
 */
export function isHapticEnabled() {
  return window.__HAPTIC_ENABLED__ !== false;
}

/**
 * Touch feedback helper - combines visual and haptic feedback
 * @param {HTMLElement} element - Element to animate
 * @param {string} type - Haptic type
 */
export function touchFeedback(element, type = 'light') {
  // Trigger haptic
  haptic(type);
  
  // Add visual feedback class
  if (element) {
    element.classList.add('touch-active');
    setTimeout(() => {
      element.classList.remove('touch-active');
    }, 150);
  }
}

export default haptics;
