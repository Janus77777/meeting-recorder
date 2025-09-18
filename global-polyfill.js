// Global polyfill for browser environment
if (typeof window !== 'undefined') {
  window.global = window;
}
module.exports = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});