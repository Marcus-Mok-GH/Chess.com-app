// @vitest-environment node
//
// Mobile overflow regression test: loads the built app in real Chromium at
// phone viewports and fails when any route scrolls or overflows horizontally.
//
// Follows the render.test.js precedent of using build artifacts when present:
// the suite boots `vite preview` from artifacts/chess/dist/public and skips
// gracefully on checkouts without a prior `pnpm build` (or without a browser
// binary), so the canonical suite stays green everywhere.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const chessDir = path.join(repoRoot, 'artifacts', 'chess');
const distIndex = path.join(chessDir, 'dist', 'public', 'index.html');
const viteBin = path.join(chessDir, 'node_modules', '.bin', 'vite');

const hasBuild = fs.existsSync(distIndex);
const hasVite = fs.existsSync(viteBin);

// Playwright + browser availability. A missing browser or package skips the
// suite rather than failing machines that cannot run headed binaries.
let chromium = null;
let browserAvailable = false;
try {
  ({ chromium } = await import('playwright'));
  browserAvailable = true;
} catch {
  browserAvailable = false;
}

describe.skipIf(!hasBuild || !hasVite || !browserAvailable)('mobile layout overflow', () => {
  const PORT = 5200 + (process.pid % 500);
  const BASE = `http://127.0.0.1:${PORT}`;
  let server;
  let browser;

  // SPA shell routes measured at a large phone and a small phone. Game routes
  // (/game/:id, /online/:id) need seeded state and are covered by their own
  // component tests; the shell + content pages carry the shared layout CSS.
  const ROUTES = [
    '/',
    '/login',
    '/home',
    '/play',
    '/online',
    '/puzzles',
    '/openings',
    '/settings',
    '/more',
    '/leaderboard',
    '/history',
    '/subscription',
    '/changelog',
  ];
  const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];

  function startPreviewServer() {
    return new Promise((resolve, reject) => {
      server = spawn(viteBin, ['preview', '--config', 'vite.config.ts'], {
        cwd: chessDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          BASE_PATH: '/',
          PORT: String(PORT),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      server.stdout.on('data', (chunk) => { output += chunk; });
      server.stderr.on('data', (chunk) => { output += chunk; });
      server.on('error', reject);
      server.on('exit', (code) => {
        if (code && code !== 0) reject(new Error(`vite preview exited ${code}: ${output.slice(-400)}`));
      });
      resolve();
    });
  }

  async function waitUntilReady(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error('vite preview exited before becoming ready');
      try {
        const response = await fetch(BASE + '/');
        if (response.ok) return;
        lastError = new Error(`preview returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(`vite preview not ready in ${timeoutMs}ms: ${lastError}`);
  }

  beforeAll(async () => {
    await startPreviewServer();
    await waitUntilReady();
    browser = await chromium.launch();
  }, 120000);

  afterAll(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => {
        if (server.exitCode !== null) return resolve();
        server.once('exit', resolve);
        setTimeout(() => { try { server.kill('SIGKILL'); } catch {} resolve(); }, 3000);
      });
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`keeps every shell route within the viewport at ${viewport.width}x${viewport.height}`, async () => {
      const context = await browser.newContext({
        viewport,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const overflows = [];

      for (const route of ROUTES) {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        // Lazy chunks mount after the SPA shell; settle briefly, then measure.
        await page.waitForTimeout(600);

        const result = await page.evaluate(() => {
          const doc = document.documentElement;
          // 1px tolerance for sub-pixel rounding at fractional zoom levels.
          const overflowsPage = doc.scrollWidth > window.innerWidth + 1;
          const main = document.querySelector('.app > main');
          const mainScrolls = main ? main.scrollWidth > main.clientWidth + 1 : false;
          return { overflowsPage, mainScrolls, docScrollWidth: doc.scrollWidth };
        });

        if (result.overflowsPage || result.mainScrolls) {
          overflows.push(`${route} (scrollWidth ${result.docScrollWidth})`);
        }
      }

      await context.close();

      expect(
        overflows,
        `routes overflowing horizontally at ${viewport.width}px: ${overflows.join(', ')}`
      ).toEqual([]);
    }, 180000);
  }
});
