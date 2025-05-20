import React, { useState, useEffect, type ReactNode } from 'react';
import ViewportManager from '../utils/ViewportManager';

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onViewportChange?: (dimensions: { width: number; height: number; orientation: 'portrait' | 'landscape' }) => void;
}

/**
 * A container component that adjusts to viewport changes and provides responsive information
 */
const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className = '',
  style = {},
  onViewportChange
}) => {
  const [dimensions, setDimensions] = useState(ViewportManager.getViewportDimensions());
  
  useEffect(() => {
    // Handler for viewport size changes
    const handleResize = (dims: any) => {
      setDimensions(dims);
      if (onViewportChange) {
        onViewportChange(dims);
      }
    };
    
    // Register for viewport changes
    ViewportManager.onResize(handleResize);
    ViewportManager.onOrientationChange(handleResize);
    
    // Cleanup listener
    return () => {
      ViewportManager.removeResizeCallback(handleResize);
      ViewportManager.removeOrientationCallback(handleResize);
    };
  }, [onViewportChange]);
  
  // Classnames based on current viewport
  const orientationClass = dimensions.orientation === 'portrait' ? 'portrait-mode' : 'landscape-mode';
  const sizeClass = dimensions.width < 640 ? 'mobile-size' : 
                    dimensions.width < 1024 ? 'tablet-size' : 'desktop-size';
  
  return (
    <div 
      className={`responsive-container ${orientationClass} ${sizeClass} ${className}`}
      style={{
        width: '100%',
        height: '100%',
        ...style
      }}
      data-viewport-width={dimensions.width}
      data-viewport-height={dimensions.height}
      data-orientation={dimensions.orientation}
    >
      {children}
    </div>
  );
};

export default ResponsiveContainer;
