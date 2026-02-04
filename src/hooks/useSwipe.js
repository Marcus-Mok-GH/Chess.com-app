/**
 * Swipe gesture detection for mobile interactions
 * Provides touch-based navigation and actions
 */

import { useEffect, useRef, useCallback } from 'react';

// Default swipe configuration
const DEFAULT_CONFIG = {
  threshold: 50,        // Minimum distance to trigger swipe
  timeout: 300,         // Maximum time for swipe gesture (ms)
  restraint: 100,       // Maximum perpendicular distance allowed
  allowedTime: 300,     // Maximum time allowed for swipe
};

/**
 * Hook to detect swipe gestures on an element
 * @param {Object} options - Configuration options
 * @param {Function} options.onSwipeLeft - Callback for left swipe
 * @param {Function} options.onSwipeRight - Callback for right swipe
 * @param {Function} options.onSwipeUp - Callback for up swipe
 * @param {Function} options.onSwipeDown - Callback for down swipe
 * @param {Function} options.onTap - Callback for tap
 * @param {number} options.threshold - Minimum swipe distance (default: 50)
 * @param {boolean} options.preventDefault - Prevent default touch behavior
 */
export function useSwipe(options = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onTap,
    threshold = DEFAULT_CONFIG.threshold,
    preventDefault = false,
  } = options;
  
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const elementRef = useRef(null);
  
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: new Date().getTime(),
    };
  }, []);
  
  const handleTouchMove = useCallback((e) => {
    if (preventDefault) {
      e.preventDefault();
    }
  }, [preventDefault]);
  
  const handleTouchEnd = useCallback((e) => {
    const touch = e.changedTouches[0];
    const distX = touch.clientX - touchStart.current.x;
    const distY = touch.clientY - touchStart.current.y;
    const elapsedTime = new Date().getTime() - touchStart.current.time;
    
    // Check if it's a valid swipe (within time limit)
    if (elapsedTime <= DEFAULT_CONFIG.allowedTime) {
      // Horizontal swipe
      if (Math.abs(distX) >= threshold && Math.abs(distY) <= DEFAULT_CONFIG.restraint) {
        if (distX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (distX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
      }
      // Vertical swipe
      else if (Math.abs(distY) >= threshold && Math.abs(distX) <= DEFAULT_CONFIG.restraint) {
        if (distY > 0 && onSwipeDown) {
          onSwipeDown();
        } else if (distY < 0 && onSwipeUp) {
          onSwipeUp();
        }
      }
      // Tap
      else if (Math.abs(distX) < 10 && Math.abs(distY) < 10 && onTap) {
        onTap();
      }
    }
  }, [threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onTap]);
  
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, preventDefault]);
  
  return elementRef;
}

/**
 * Hook for detecting horizontal swipe only (for move navigation)
 * @param {Object} options
 */
export function useHorizontalSwipe(options = {}) {
  const { onLeft, onRight, ...rest } = options;
  
  return useSwipe({
    onSwipeLeft: onLeft,
    onSwipeRight: onRight,
    ...rest,
  });
}

/**
 * Hook for pull-to-refresh gesture
 * @param {Function} onRefresh - Callback when pull-to-refresh is triggered
 * @param {Object} options
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const {
    threshold = 80,
    maxPull = 150,
  } = options;
  
  const pullStart = useRef(0);
  const currentPull = useRef(0);
  const isPulling = useRef(false);
  const elementRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const handleTouchStart = useCallback((e) => {
    const element = elementRef.current;
    if (!element) return;
    
    // Only start pull if at top of scroll
    if (element.scrollTop === 0) {
      pullStart.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);
  
  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current) return;
    
    const touch = e.touches[0];
    const pull = touch.clientY - pullStart.current;
    
    if (pull > 0) {
      currentPull.current = Math.min(pull, maxPull);
      
      // Visual feedback
      const element = elementRef.current;
      if (element) {
        element.style.transform = `translateY(${currentPull.current * 0.5}px)`;
      }
      
      // Prevent default scrolling
      if (pull > 10) {
        e.preventDefault();
      }
    }
  }, []);
  
  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    
    isPulling.current = false;
    
    // Reset position
    const element = elementRef.current;
    if (element) {
      element.style.transition = 'transform 0.3s ease';
      element.style.transform = 'translateY(0)';
      
      setTimeout(() => {
        element.style.transition = '';
      }, 300);
    }
    
    // Trigger refresh if pulled far enough
    if (currentPull.current >= threshold && onRefresh && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    currentPull.current = 0;
  }, [onRefresh, isRefreshing, threshold]);
  
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
  
  return { ref: elementRef, isRefreshing };
}

/**
 * Hook for detecting pinch gesture (for zoom)
 * @param {Function} onPinch - Callback with scale value
 */
export function usePinch(onPinch, options = {}) {
  const { minScale = 0.5, maxScale = 2 } = options;
  const initialDistance = useRef(0);
  const currentScale = useRef(1);
  const elementRef = useRef(null);
  
  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      initialDistance.current = getDistance(e.touches);
    }
  }, []);
  
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && initialDistance.current > 0) {
      const distance = getDistance(e.touches);
      const scale = (distance / initialDistance.current) * currentScale.current;
      const clampedScale = Math.min(Math.max(scale, minScale), maxScale);
      
      if (onPinch) {
        onPinch(clampedScale);
      }
    }
  }, [onPinch, minScale, maxScale]);
  
  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) {
      initialDistance.current = 0;
    }
  }, []);
  
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);
  
  return elementRef;
}

export default useSwipe;
