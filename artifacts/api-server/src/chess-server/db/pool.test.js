import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MANAGED_ENV_KEYS = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'VERCEL',
  'AWS_LAMBDA_FUNCTION_NAME',
];

const originalEnv = Object.fromEntries(MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreManagedEnv() {
  for (const key of MANAGED_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.DATABASE_URL = 'postgres://user:pass@pooled.example.com:5432/chess';
  delete process.env.DATABASE_URL_UNPOOLED;
  delete process.env.VERCEL;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  restoreManagedEnv();
});

describe('pool idle-client error handling', () => {
  it('attaches an error listener to the pooled connection pool', async () => {
    const poolModule = await import('./pool.js');
    const pool = poolModule.getPool();

    expect(pool).toBeTruthy();
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
  });

  it('does not rethrow when an idle client emits an error', async () => {
    const poolModule = await import('./pool.js');
    const pool = poolModule.getPool();

    expect(() => pool.emit('error', new Error('idle client exploded'))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it('attaches an error listener to the direct pool when a distinct unpooled URL is configured', async () => {
    process.env.DATABASE_URL_UNPOOLED = 'postgres://user:pass@direct.example.com:5432/chess';

    const poolModule = await import('./pool.js');
    const directPool = poolModule.getDirectPool();

    expect(directPool).toBeTruthy();
    expect(directPool).not.toBe(poolModule.getPool());
    expect(directPool.listenerCount('error')).toBeGreaterThan(0);
    expect(() => directPool.emit('error', new Error('idle client exploded'))).not.toThrow();
  });

  it('creates no pools when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;

    const poolModule = await import('./pool.js');

    expect(poolModule.getPool()).toBeNull();
    expect(poolModule.default).toBeNull();
  });
});