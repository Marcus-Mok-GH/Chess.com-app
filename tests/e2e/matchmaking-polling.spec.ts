import { test, expect } from '@playwright/test';

test.describe('Matchmaking Polling Fallback', () => {
  test('should use polling fallback when WebSocket is blocked', async ({ page, context }) => {
    // Block WebSocket connections to force polling fallback
    await context.route('**/socket.io/**', route => {
      if (route.request().resourceType() === 'websocket') {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Mock API responses for polling-based matchmaking
    await context.route('**/api/matchmaking/join', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Joined matchmaking queue' }),
      });
    });

    await context.route('**/api/matchmaking/heartbeat', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await context.route('**/api/matchmaking/check-match', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ matchFound: false }),
      });
    });

    await context.route('**/api/matchmaking/details', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 5, distribution: {} }),
      });
    });

    // Navigate to online play page
    await page.goto('/online');

    // Wait for page to load
    await expect(page.locator('.online-play-page')).toBeVisible();

    // Click Ranked mode to start matchmaking
    await page.click('.mode-option.ranked');

    // Should be in matchmaking view
    await expect(page.locator('.matchmaking-title')).toContainText('Finding Opponent');

    // Should show polling transport indicator
    await expect(page.locator('.waiting-desc')).toContainText(
      'Using polling while real-time matchmaking reconnects'
    );

    // Verify that matchmaking info is displayed
    await expect(page.locator('.stat-value').first()).toBeVisible();

    // Verify Cancel button exists
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
  });

  test('should handle matchmaking errors gracefully with polling', async ({ page, context }) => {
    // Block WebSocket connections
    await context.route('**/socket.io/**', route => {
      if (route.request().resourceType() === 'websocket') {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Mock join failure
    await context.route('**/api/matchmaking/join', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Failed to join matchmaking' }),
      });
    });

    await page.goto('/online');

    // Click Ranked mode
    await page.click('.mode-option.ranked');

    // Should show error message
    await expect(page.locator('.error-message')).toBeVisible();
  });

  test('should cancel matchmaking and return to mode select', async ({ page, context }) => {
    // Block WebSocket connections
    await context.route('**/socket.io/**', route => {
      if (route.request().resourceType() === 'websocket') {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Mock successful join
    await context.route('**/api/matchmaking/join', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Joined matchmaking queue' }),
      });
    });

    await context.route('**/api/matchmaking/leave', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Left matchmaking queue' }),
      });
    });

    await page.goto('/online');

    // Start matchmaking
    await page.click('.mode-option.ranked');
    await expect(page.locator('.matchmaking-title')).toBeVisible();

    // Click Cancel button
    await page.click('button:has-text("Cancel")');

    // Should return to mode select
    await expect(page.locator('.mode-title')).toContainText('Choose Game Mode');
  });
});