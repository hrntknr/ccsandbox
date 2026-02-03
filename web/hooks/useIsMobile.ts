import { useEffect, useState } from 'react';

/**
 * Detect mobile devices based on touch capability and screen width.
 * Returns true only when both conditions are met:
 * - Device has touch screen (ontouchstart or maxTouchPoints > 0)
 * - Screen width is 768px or less
 *
 * This prevents false positives on touch-enabled laptops with large screens.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(hasTouchScreen && isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}
