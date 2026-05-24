import '@testing-library/jest-dom';

// jsdom does not implement crypto.randomUUID; polyfill for test environment
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: () => 'test-uuid-0000-0000-0000-000000000000',
  configurable: true,
  writable: true,
});
