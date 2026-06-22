import asyncio
import os
import signal
import subprocess
import time
from playwright.async_api import async_playwright

async def verify():
    # Start the dev server
    proc = subprocess.Popen(
        ["npm", "run", "dev"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        preexec_fn=os.setsid
    )

    # Wait for server to be ready
    time.sleep(10)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # Check Local Play
            print("Checking Local Play Setup...")
            await page.goto("http://localhost:5173/play")
            await page.wait_for_selector(".setup-container", timeout=10000)
            await page.screenshot(path="/home/jules/verification/local_setup.png")

            print("Starting Local Game...")
            # Click the start button in PlaySetup
            await page.click(".start-button")
            await page.wait_for_selector(".chess-board", timeout=10000)
            await page.screenshot(path="/home/jules/verification/local_game.png")
            print("Local Play OK")

            # Check Online Play (Lobby)
            print("Checking Online Play...")
            await page.goto("http://localhost:5173/online")
            # The LobbyUI should be visible
            await page.wait_for_selector(".mode-option", timeout=10000)
            await page.screenshot(path="/home/jules/verification/online_lobby.png")
            print("Online Lobby OK")

        except Exception as e:
            print(f"Error during verification: {e}")
            await page.screenshot(path="/home/jules/verification/error_final.png")
            with open("/home/jules/verification/error_content_final.html", "w") as f:
                f.write(await page.content())
        finally:
            await browser.close()
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)

if __name__ == "__main__":
    if not os.path.exists("/home/jules/verification"):
        os.makedirs("/home/jules/verification")
    asyncio.run(verify())
