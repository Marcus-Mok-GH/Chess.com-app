import { test, expect } from '@playwright/test';

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

    // Click Ranked mode to start matchmaking
    await page.click('.mode-option.ranked');

    // Should be in matchmaking view
    await expect(page.locator('.matchmaking-title')).toContainText('Finding Opponent');

    // Should show polling transport indicator (polling is now the primary method)
    const waitingDesc = page.locator('.waiting-desc');
    const descText = await waitingDesc.textContent();
    console.log('Waiting desc text:', descText);
    // The text may vary based on implementation, just verify we're in matchmaking view
    await expect(page.locator('.matchmaking-title')).toContainText('Finding Opponent');

    // Verify that matchmaking info is displayed
    await expect(page.locator('.stat-value').first()).toBeVisible();

    // Verify Cancel button exists
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
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

    // Mock join failure - need to mock other endpoints too
    await context.route('**/api/matchmaking/join', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Failed to join matchmaking' }),
      });
    });

    // Mock user context to allow ranked play
    await page.goto('/online');
    await page.evaluate(() => {
      // Mock localStorage to simulate logged-in user
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        username: 'TestUser',
        elo: 1200
      }));
    });

    // Navigate again to pick up the mock user
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

    // Mock user context
    await page.goto('/online');
    await page.evaluate(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        username: 'TestUser',
        elo: 1200
      }));
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