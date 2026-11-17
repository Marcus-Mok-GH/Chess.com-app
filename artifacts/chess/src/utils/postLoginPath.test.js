import { describe, it, expect, beforeEach } from 'vitest';
import {
  rememberPostLoginPath,
  consumePostLoginPath,
  POST_LOGIN_STORAGE_KEY,
} from './postLoginPath';

describe('postLoginPath', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('remembers a relative path and consumes it once', () => {
    rememberPostLoginPath('/friends');
    expect(window.sessionStorage.getItem(POST_LOGIN_STORAGE_KEY)).toBe('/friends');
    expect(consumePostLoginPath()).toBe('/friends');
    expect(consumePostLoginPath()).toBe('/home');
  });

  it('keeps a query string', () => {
    rememberPostLoginPath('/clubs?tab=mine');
    expect(consumePostLoginPath()).toBe('/clubs?tab=mine');
  });

  it('defaults to /home when nothing was remembered', () => {
    expect(consumePostLoginPath()).toBe('/home');
  });

  it('ignores destinations that would become an open redirect', () => {
    rememberPostLoginPath('https://evil.example.com');
    rememberPostLoginPath('//evil.example.com/friends');
    rememberPostLoginPath('javascript:alert(1)');
    expect(consumePostLoginPath()).toBe('/home');
  });

  it('ignores empty values and the login routes themselves', () => {
    rememberPostLoginPath('');
    rememberPostLoginPath(null);
    rememberPostLoginPath('/login');
    rememberPostLoginPath('/login?mode=signup');
    rememberPostLoginPath('/verify-email');
    expect(consumePostLoginPath()).toBe('/home');
  });

  it('drops a stored value that was tampered with', () => {
    window.sessionStorage.setItem(POST_LOGIN_STORAGE_KEY, '//evil.example.com');
    expect(consumePostLoginPath()).toBe('/home');
    expect(window.sessionStorage.getItem(POST_LOGIN_STORAGE_KEY)).toBeNull();
  });
});
