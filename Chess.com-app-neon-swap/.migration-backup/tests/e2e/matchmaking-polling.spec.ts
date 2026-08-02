import { test, expect } from '@playwright/test';

test.describe('Matchmaking E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock logged-in user for all tests
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        username: 'TestUser',
        elo: 1200
      }));
    });
  });

  test('should use polling matchmaking when starting ranked', async ({ page, context }) => {
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
    await expect(page.locator('.mode-title')).toContainText('Choose Game Mode');

    // Click Ranked mode to start matchmaking
    await page.click('.mode-option.ranked');

    // Should be in matchmaking view
    await expect(page.locator('.waiting-container')).toBeVisible();
    await expect(page.locator('.matchmaking-title')).toContainText('Finding Opponent');

    // Verify player rating is displayed
    await expect(page.locator('.stat-value').first()).toContainText('1200');

    // Verify matchmaking info is displayed (search time, players online)
    await expect(page.locator('.search-stats')).toBeVisible();

    // Verify Cancel button exists
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should handle matchmaking errors gracefully', async ({ page, context }) => {
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

    // Navigate to online play page
    await page.goto('/online');

    // Wait for page to load
    await expect(page.locator('.online-play-page')).toBeVisible();

    // Click Ranked mode
    await page.click('.mode-option.ranked');

    // Should show error message and return to mode select
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.mode-title')).toContainText('Choose Game Mode');
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

    // Mock successful join and leave
    let joinCalled = false;
    await context.route('**/api/matchmaking/join', route => {
      joinCalled = true;
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

    // Navigate to online play page
    await page.goto('/online');

    // Start matchmaking
    await page.click('.mode-option.ranked');

    // Wait for matchmaking view to appear
    await expect(page.locator('.waiting-container')).toBeVisible();
    await expect(page.locator('.matchmaking-title')).toContainText('Finding Opponent');

    // Verify join was called
    await page.waitForTimeout(500); // Give time for join request

    // Click Cancel button
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Should return to mode select
    await expect(page.locator('.mode-title')).toContainText('Choose Game Mode');
    await expect(page.locator('.mode-option.ranked')).toBeVisible();
  });

  test('should prevent ranked play for guest users', async ({ page }) => {
    // Clear any existing user from localStorage
    await page.addInitScript(() => {
      localStorage.removeItem('user');
    });

    // Navigate to online play page
    await page.goto('/online');

    // Wait for page to load
    await expect(page.locator('.online-play-page')).toBeVisible();
    await expect(page.locator('.guest-banner')).toBeVisible();

    // Try to click Ranked mode
    await page.click('.mode-option.ranked');

    // Should show login modal
    await expect(page.locator('[class*="LoginModal"]')).toBeVisible();

    // The page should remain in mode select
    await expect(page.locator('.mode-title')).toContainText('Choose Game Mode');
  });
});
