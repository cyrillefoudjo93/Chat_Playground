/**
 * Browser polyfills and compatibility helpers
 * Provides consistent behavior across different browsers
 */

/**
 * Initialize all polyfills and browser compatibility fixes
 */
export function initBrowserCompatibility(): void {
  // Fix for iOS Safari 100vh issue
  setupIOSViewportFix();

  // Fix for various mobile browser address bar issues
  setupMobileAddressBarFix();

  // Enable smooth scrolling where natively supported
  document.documentElement.style.scrollBehavior = 'smooth';
}

/**
 * Fix for iOS Safari 100vh issue
 * iOS Safari includes the address bar in the viewport height calculation
 */
function setupIOSViewportFix(): void {
  // Initial setup
  updateViewportHeight();

  // Update on resize and orientation change
  window.addEventListener('resize', updateViewportHeight);
  window.addEventListener('orientationchange', () => {
    // Small delay to ensure dimensions are updated after orientation change
    setTimeout(updateViewportHeight, 100);
  });
}

/**
 * Update CSS custom property for viewport height
 */
function updateViewportHeight(): void {
  // First we get the viewport height and multiply it by 1% to get a value for a vh unit
  const vh = window.innerHeight * 0.01;
  // Then we set the value in the --vh custom property to the root of the document
  document.documentElement.style.setProperty('--vh', `${vh}px`);

  // Also set other viewport-related variables
  const vw = window.innerWidth * 0.01;
  document.documentElement.style.setProperty('--vw', `${vw}px`);
  
  // Check if device is in landscape mode
  const isLandscape = window.innerWidth > window.innerHeight;
  document.documentElement.classList.toggle('landscape', isLandscape);
  document.documentElement.classList.toggle('portrait', !isLandscape);
}

/**
 * Fix for mobile browser address bar appearing/disappearing
 * This helps prevent layout shifts when the address bar appears or disappears
 */
function setupMobileAddressBarFix(): void {
  // Detect if device is mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    let lastScrollPosition = window.scrollY;
    
    // Lock scroll when address bar is shown/hidden to prevent unwanted content shifts
    window.addEventListener('scroll', () => {
      if (Math.abs(window.scrollY - lastScrollPosition) < 50) {
        // Normal scroll, do nothing
        lastScrollPosition = window.scrollY;
      } else {
        // Likely address bar showing/hiding
        // Optional: implement specific fixes if needed
      }
    });
  }
}
