import asyncio
import os
import signal
import subprocess
import time
from playwright.async_api import async_playwright

async def verify():
    # Start the dev server
    import shutil
    npm_path = shutil.which("npm")
    if not npm_path:
        raise RuntimeError("npm not found in PATH")

    popen_kwargs = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
    }

    # Only use preexec_fn on Unix-like systems
    if os.name != 'nt':
        popen_kwargs["preexec_fn"] = os.setsid

    proc = subprocess.Popen(
        [npm_path, "run", "dev"],
        **popen_kwargs
    )

    # Wait for server to be ready
    time.sleep(10)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        verification_dir = os.getenv("VERIFICATION_OUTPUT_DIR", "./verification")

        try:
            # Check Local Play
            print("Checking Local Play Setup...")
            await page.goto("http://localhost:5173/play")
            await page.wait_for_selector(".setup-container", timeout=10000)
            await page.screenshot(path=f"{verification_dir}/local_setup.png")

            print("Starting Local Game...")
            # Click the start button in PlaySetup
            await page.click(".start-button")
            await page.wait_for_selector(".chess-board", timeout=10000)
            await page.screenshot(path=f"{verification_dir}/local_game.png")
            print("Local Play OK")

            # Check Online Play (Lobby)
            print("Checking Online Play...")
            await page.goto("http://localhost:5173/online")
            # The LobbyUI should be visible
            await page.wait_for_selector(".mode-option", timeout=10000)
            await page.screenshot(path=f"{verification_dir}/online_lobby.png")
            print("Online Lobby OK")

        except Exception as e:
            print(f"Error during verification: {e}")
            await page.screenshot(path=f"{verification_dir}/error_final.png")
            with open(f"{verification_dir}/error_content_final.html", "w") as f:
                f.write(await page.content())
        finally:
            await browser.close()
            if os.name != 'nt':
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            else:
                proc.terminate()

if __name__ == "__main__":
    verification_dir = os.getenv("VERIFICATION_OUTPUT_DIR", "./verification")
    if not os.path.exists(verification_dir):
        os.makedirs(verification_dir)
    asyncio.run(verify())
