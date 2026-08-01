import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeApiBaseUrl } from './apiBase.js';

describe('normalizeApiBaseUrl', () => {
  beforeEach(() => {
    // Ensure consistent behavior across environments: treat as if no browser protocol
    if (typeof globalThis.window !== 'undefined') {
      vi.stubGlobal('window', { location: { protocol: '' } });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns /api for undefined input', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('/api');
  });

  it('returns /api for empty string', () => {
    expect(normalizeApiBaseUrl('')).toBe('/api');
  });

  it('returns /api for literal "undefined"', () => {
    expect(normalizeApiBaseUrl('undefined')).toBe('/api');
  });

  it('returns /api for bare "api"', () => {
    expect(normalizeApiBaseUrl('api')).toBe('/api');
  });

  it('returns /api for "api/"', () => {
    expect(normalizeApiBaseUrl('api/')).toBe('/api');
  });

  it('appends /api to a custom host', () => {
    const result = normalizeApiBaseUrl('myserver.com');
    expect(result).toBe('https://myserver.com/api');
  });

  it('does not double-append /api when base already ends in /api', () => {
    const result = normalizeApiBaseUrl('https://example.com/api');
    expect(result).toBe('https://example.com/api');
  });

  it('handles trailing slash on a URL with /api', () => {
    const result = normalizeApiBaseUrl('https://example.com/api/');
    expect(result).toBe('https://example.com/api');
  });

  it('uses http:// for localhost without protocol', () => {
    const result = normalizeApiBaseUrl('localhost:8080');
    expect(result).toBe('http://localhost:8080/api');
  });
});
