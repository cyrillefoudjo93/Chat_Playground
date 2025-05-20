/**
 * ViewportManager.ts
 * Utility for managing viewport measurements and responsive behavior
 */

class ViewportManager {
  private static instance: ViewportManager;
  private resizeCallbacks: Function[] = [];
  private orientationCallbacks: Function[] = [];
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  private aspectRatio: number = 0;
  private orientation: 'portrait' | 'landscape' = 'portrait';

  private constructor() {
    this.updateViewportSize();
    this.setupEventListeners();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ViewportManager {
    if (!ViewportManager.instance) {
      ViewportManager.instance = new ViewportManager();
    }
    return ViewportManager.instance;
  }

  /**
   * Setup event listeners for viewport changes
   */
  private setupEventListeners(): void {
    // Window resize event
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // Orientation change
    window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
    
    // Fix for iOS vh units
    window.addEventListener('load', this.setVhProperty.bind(this));
    
    // Initial calls
    this.setVhProperty();
    this.handleResize();
  }

  /**
   * Update viewport measurements
   */
  private updateViewportSize(): void {
    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.aspectRatio = this.viewportWidth / this.viewportHeight;
    this.orientation = this.viewportWidth > this.viewportHeight ? 'landscape' : 'portrait';
  }

  /**
   * Handle window resize events
   */
  private handleResize(): void {
    this.updateViewportSize();
    this.setVhProperty();
    this.resizeCallbacks.forEach(callback => callback({
      width: this.viewportWidth,
      height: this.viewportHeight,
      aspectRatio: this.aspectRatio
    }));
  }

  /**
   * Handle orientation change events
   */
  private handleOrientationChange(): void {
    setTimeout(() => {
      this.updateViewportSize();
      this.orientationCallbacks.forEach(callback => callback({
        orientation: this.orientation,
        width: this.viewportWidth,
        height: this.viewportHeight
      }));
    }, 100); // Small delay to ensure dimensions are updated
  }

  /**
   * Set CSS variable for viewport height (fixes iOS issues)
   */
  private setVhProperty(): void {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    const vw = window.innerWidth * 0.01;
    document.documentElement.style.setProperty('--vw', `${vw}px`);
  }

  /**
   * Register a callback for viewport resize
   */
  public onResize(callback: Function): void {
    this.resizeCallbacks.push(callback);
  }

  /**
   * Register a callback for orientation change
   */
  public onOrientationChange(callback: Function): void {
    this.orientationCallbacks.push(callback);
  }

  /**
   * Remove a resize callback
   */
  public removeResizeCallback(callback: Function): void {
    this.resizeCallbacks = this.resizeCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Remove an orientation callback
   */
  public removeOrientationCallback(callback: Function): void {
    this.orientationCallbacks = this.orientationCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Get the current viewport dimensions
   */
  public getViewportDimensions() {
    return {
      width: this.viewportWidth,
      height: this.viewportHeight,
      aspectRatio: this.aspectRatio,
      orientation: this.orientation
    };
  }

  /**
   * Calculate a responsive value based on viewport size
   * @param minValue Minimum value
   * @param maxValue Maximum value
   * @param minWidth Viewport width at which minValue applies
   * @param maxWidth Viewport width at which maxValue applies
   */
  public getResponsiveValue(
    minValue: number, 
    maxValue: number, 
    minWidth: number = 320, 
    maxWidth: number = 1920
  ): number {
    const limitedWidth = Math.max(minWidth, Math.min(maxWidth, this.viewportWidth));
    const ratio = (limitedWidth - minWidth) / (maxWidth - minWidth);
    return minValue + (maxValue - minValue) * ratio;
  }
}

export default ViewportManager.getInstance();
