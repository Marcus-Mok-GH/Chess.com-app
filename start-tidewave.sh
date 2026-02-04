#!/bin/bash
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=$(which chromium)
export CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox"

# Download and run Tidewave CLI
curl -sL https://github.com/tidewave-ai/tidewave_app/releases/latest/download/tidewave-cli-x86_64-unknown-linux-gnu -o /tmp/tidewave-cli
chmod +x /tmp/tidewave-cli
/tmp/tidewave-cli --allow-remote-access "$@"
