#!/bin/bash
# Wrapper script for kilocode CLI with browser sandbox fix

# Chrome/Chromium sandbox configuration for containerized environments
export CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu"
export PUPPETEER_CHROMIUM_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu"
export PUPPETEER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu"
export CHROME_PATH="/nix/store/chromium/bin/chromium"
export PUPPETEER_SKIP_DOWNLOAD="true"
export PUPPETEER_EXECUTABLE_PATH="/nix/store/chromium/bin/chromium"

# Find kilo binary (supports both old and new installation paths)
KILO_BIN=""
if [ -x "/home/runner/workspace/.config/npm/node_global/bin/kilo" ]; then
    KILO_BIN="/home/runner/workspace/.config/npm/node_global/bin/kilo"
elif [ -x "/home/runner/.config/npm/node_global/bin/kilo" ]; then
    KILO_BIN="/home/runner/.config/npm/node_global/bin/kilo"
elif [ -x "/home/runner/.local/bin/kilo" ]; then
    KILO_BIN="/home/runner/.local/bin/kilo"
elif command -v kilo &> /dev/null; then
    KILO_BIN="$(command -v kilo)"
else
    echo "Error: kilo binary not found. Please install @kilocode/cli first."
    echo "Run: npm install -g @kilocode/cli"
    exit 1
fi

# Run kilo with all arguments
exec "$KILO_BIN" "$@"
