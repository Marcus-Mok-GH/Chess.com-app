import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    console.log('Navigating to Online Play...');
    await page.goto('http://localhost:5173/online', { waitUntil: 'networkidle' });
    console.log('URL is:', page.url());

    // Wait for either the mode options or an error message
    try {
      await page.waitForSelector('.mode-option', { timeout: 15000 });
      console.log('Found .mode-option');
    } catch (e) {
      console.log('Timed out waiting for .mode-option. Current HTML snippet:');
      const html = await page.content();
      console.log(html.substring(0, 1000));
      fs.writeFileSync('online_debug.html', html);
    }

    await page.screenshot({ path: `${process.env.VERIFICATION_OUTPUT_DIR || './verification'}/online_play_final.png` });
  } catch (e) {
    console.error('Online Play navigation failed:', e.message);
  }

  try {
    console.log('Navigating to Local Play...');
    await page.goto('http://localhost:5173/play', { waitUntil: 'networkidle' });
    await page.waitForSelector('.setup-container', { timeout: 15000 });
    console.log('Found .setup-container');
    await page.screenshot({ path: `${process.env.VERIFICATION_OUTPUT_DIR || './verification'}/local_setup_final.png` });

    // Try to click a bot and start
    await page.click('.bot-card:first-child');
    await page.click('.start-game-btn');
    await page.waitForSelector('.chess-board', { timeout: 15000 });
    console.log('Found .chess-board');
    await page.screenshot({ path: `${process.env.VERIFICATION_OUTPUT_DIR || './verification'}/local_game_final.png` });
  } catch (e) {
    console.error('Local Play failed:', e.message);
    await page.screenshot({ path: `${process.env.VERIFICATION_OUTPUT_DIR || './verification'}/error_local_final.png` });
  }

  await browser.close();
})();
