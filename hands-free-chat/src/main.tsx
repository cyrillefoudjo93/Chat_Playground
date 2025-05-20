import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initBrowserCompatibility } from './utils/browserPolyfills';

// Initialize browser compatibility and polyfills
initBrowserCompatibility();

// Mount the app
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Prevent bounce/overscroll effects on touch devices
document.body.addEventListener('touchmove', (e) => {
  if (e.target === document.body) {
    e.preventDefault();
  }
}, { passive: false });

// Create and render root
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
