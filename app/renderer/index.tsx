import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Get the root element
const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to find the root element');
}

// Create root and render app
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hot module replacement for development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    const NextApp = require('./App').default;
    root.render(
      <React.StrictMode>
        <NextApp />
      </React.StrictMode>
    );
  });
}

// Handle app errors
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent the default behavior (logging to console)
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
});

// Electron specific code
if (window.electronAPI) {
  // Add any Electron-specific initialization here
  console.log('Running in Electron environment');
  
  // Example: Get app version
  window.electronAPI.app.getVersion().then(version => {
    console.log('App version:', version);
  }).catch(error => {
    console.error('Failed to get app version:', error);
  });
} else {
  console.log('Running in browser environment (development)');
}