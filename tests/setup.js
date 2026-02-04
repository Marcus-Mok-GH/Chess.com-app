import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { JSDOM } from 'jsdom';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock WebSocket
global.WebSocket = class WebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send() {}
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ type: 'close' });
  }
};

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Custom matchers for testing-library
expect.extend({
  toBeInTheDocument() {
    return {
      pass: this.utils.contains(this.received, document.body),
      message: () => `expected ${this.utils.printReceived(this.received)} to be in document`,
    };
  },
});

// Mock fetch
global.fetch = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
