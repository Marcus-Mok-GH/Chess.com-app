#!/bin/bash

# Browser Automation Setup Script for OpenCode
# This script helps set up browser automation capabilities for OpenCode

set -e

echo "🔧 OpenCode Browser Automation Setup"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if npx is available
check_npx() {
    if command -v npx &> /dev/null; then
        print_status "npx is available"
        return 0
    else
        print_error "npx is not available. Please install Node.js and npm."
        return 1
    fi
}

# Check if Chrome/Chromium is installed
check_chrome() {
    if command -v google-chrome &> /dev/null || command -v chromium &> /dev/null || command -v chromium-browser &> /dev/null; then
        print_status "Chrome/Chromium is installed"
        return 0
    else
        print_warning "Chrome/Chromium not found in PATH"
        echo "  You can install it with:"
        echo "    - Ubuntu/Debian: sudo apt install chromium-browser"
        echo "    - macOS: brew install --cask google-chrome"
        echo "    - Or download from: https://www.google.com/chrome/"
        return 1
    fi
}

# Install Chrome DevTools MCP server
install_chrome_devtools_mcp() {
    echo ""
    echo "📦 Installing Chrome DevTools MCP server..."
    
    # Check if already installed
    if npx -y chrome-devtools-mcp@latest --version &> /dev/null 2>&1; then
        print_status "Chrome DevTools MCP server is already installed"
    else
        # Try to install
        if npx -y chrome-devtools-mcp@latest --help &> /dev/null 2>&1; then
            print_status "Chrome DevTools MCP server installed successfully"
        else
            print_error "Failed to install Chrome DevTools MCP server"
            return 1
        fi
    fi
}

# Test Chrome DevTools MCP
test_chrome_devtools() {
    echo ""
    echo "🧪 Testing Chrome DevTools MCP..."
    echo "   This will start Chrome DevTools MCP briefly to verify it works."
    
    # Test if the MCP server can start
    timeout 5 npx -y chrome-devtools-mcp@latest &
    PID=$!
    sleep 2
    
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null
        print_status "Chrome DevTools MCP server started successfully"
    else
        print_warning "Could not verify Chrome DevTools MCP server (may need Chrome to be running)"
    fi
    
    wait $PID 2>/dev/null || true
}

# Alternative: Install opencode-browser plugin
install_opencode_browser_plugin() {
    echo ""
    echo "📦 Would you like to install the opencode-browser plugin?"
    echo "   This provides an alternative browser automation approach using Chrome Native Messaging."
    echo "   Note: This requires manual Chrome extension installation."
    read -p "   Install opencode-browser plugin? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "   Installing @different-ai/opencode-browser..."
        if npx -y @different-ai/opencode-browser@latest install; then
            print_status "opencode-browser plugin installed successfully"
            print_warning "Remember to load the extension in Chrome: chrome://extensions -> Developer mode -> Load unpacked"
        else
            print_error "Failed to install opencode-browser plugin"
        fi
    else
        echo "   Skipping opencode-browser plugin installation"
    fi
}

# Main setup function
main() {
    echo ""
    
    # Check prerequisites
    check_npx || exit 1
    check_chrome
    
    echo ""
    echo "📋 Configuration Summary:"
    echo "   MCP servers are configured in: .config/opencode/opencode.json"
    echo ""
    
    # Install Chrome DevTools MCP
    install_chrome_devtools_mcp
    
    # Test the installation
    test_chrome_devtools
    
    # Offer alternative installation
    install_opencode_browser_plugin
    
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "🚀 Quick Start:"
    echo "   You can now use browser automation in OpenCode:"
    echo ""
    echo "   Example prompts:"
    echo "     • 'use chrome-devtools to take a screenshot of localhost:5173'"
    echo "     • 'use chrome-devtools to navigate to http://localhost:5173 and check the console'"
    echo "     • 'use chrome-devtools to verify the chess game UI renders correctly'"
    echo ""
    echo "📚 Documentation:"
    echo "   See AGENTS.md for more details on browser automation usage."
    echo ""
}

# Run main function
main
