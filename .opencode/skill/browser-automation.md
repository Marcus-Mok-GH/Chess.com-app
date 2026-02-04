# Browser Automation Skill for OpenCode

## Overview

This skill enables OpenCode to control and interact with web browsers for testing, debugging, and automation tasks. It leverages the Model Context Protocol (MCP) to provide powerful browser automation capabilities.

## When to Use This Skill

- **Testing web applications**: Verify UI changes, test user flows, check form submissions
- **Debugging issues**: Inspect console errors, network requests, DOM elements
- **Performance analysis**: Run performance traces, measure LCP, analyze load times
- **Visual verification**: Take screenshots, compare before/after states
- **Automation**: Fill forms, click buttons, navigate pages programmatically

## Available MCP Servers

### 1. Chrome DevTools MCP (Recommended)

**Status**: Enabled by default

**Features**:
- Direct Chrome DevTools Protocol integration
- Navigate to URLs
- Execute JavaScript in browser context
- Get DOM structure and elements
- Take screenshots
- Performance profiling
- Console and network debugging

**Tools Available**:
- `chrome_navigate` - Navigate to a URL
- `chrome_evaluate` - Execute JavaScript code
- `chrome_get_dom` - Get the current DOM structure
- `chrome_take_screenshot` - Capture a screenshot
- `performance_start_trace` - Begin performance tracing
- `performance_end_trace` - End performance tracing and analyze results

**Usage Pattern**:
```
Use chrome-devtools to [action] at [URL]
```

### 2. Browser MCP (Alternative)

**Status**: Disabled by default (enable in `opencode.json` if needed)

**Features**:
- Alternative browser automation
- Can be used as a fallback

## Common Workflows

### Workflow 1: Testing a Local Development Server

1. Start the dev server: `npm run dev`
2. Use browser automation to verify the UI:
   ```
   use chrome-devtools to navigate to localhost:5173 and take a screenshot
   ```

### Workflow 2: Debugging Console Errors

1. Navigate to the page:
   ```
   use chrome-devtools to navigate to localhost:5173
   ```
2. Check console for errors:
   ```
   use chrome-devtools to evaluate "console.error('Test error')" and check the console output
   ```

### Workflow 3: Performance Analysis

1. Navigate to the page:
   ```
   use chrome-devtools to navigate to localhost:5173
   ```
2. Start performance tracing:
   ```
   use chrome-devtools to start a performance trace
   ```
3. Interact with the page (if needed):
   ```
   use chrome-devtools to click on element with selector "#start-game"
   ```
4. End performance trace and analyze:
   ```
   use chrome-devtools to end the performance trace and show me the results
   ```

### Workflow 4: Visual Regression Testing

1. Take before screenshot:
   ```
   use chrome-devtools to navigate to localhost:5173 and take a screenshot named "before"
   ```
2. Make code changes
3. Take after screenshot:
   ```
   use chrome-devtools to navigate to localhost:5173 and take a screenshot named "after"
   ```

## Example Prompts

### Basic Navigation
```
use chrome-devtools to navigate to https://example.com
```

### Screenshot
```
use chrome-devtools to take a screenshot of localhost:5173
```

### DOM Inspection
```
use chrome-devtools to get the DOM structure of localhost:5173
```

### JavaScript Execution
```
use chrome-devtools to evaluate "document.title" at localhost:5173
```

### Performance Test
```
use chrome-devtools to check the LCP of localhost:5173
```

### Error Debugging
```
use chrome-devtools to navigate to localhost:5173 and check for console errors
```

### Form Testing
```
use chrome-devtools to test the login form at localhost:5173/login - fill in test credentials and submit
```

## Configuration

### Enable/Disable MCP Servers

Edit `.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"],
      "enabled": true
    },
    "browser-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@browsermcp/mcp@latest"],
      "enabled": false
    }
  }
}
```

### Headless Mode

To run Chrome in headless mode, use the `--headless` flag:
```
use chrome-devtools with --headless flag to take a screenshot of localhost:5173
```

## Prerequisites

1. **Node.js and npm**: Required to run MCP servers via npx
2. **Chrome or Chromium**: Must be installed on the system
   - Ubuntu/Debian: `sudo apt install chromium-browser`
   - macOS: `brew install --cask google-chrome`
   - Or download from: https://www.google.com/chrome/

## Troubleshooting

### Issue: "Chrome not found"
**Solution**: Install Chrome/Chromium and ensure it's in your PATH

### Issue: "MCP server failed to start"
**Solution**: 
1. Check that npx is available: `which npx`
2. Try installing the MCP server manually: `npm install -g chrome-devtools-mcp`

### Issue: "Cannot connect to browser"
**Solution**:
1. Ensure Chrome is running
2. Try restarting Chrome with remote debugging enabled:
   ```bash
   google-chrome --remote-debugging-port=9222
   ```

### Issue: Screenshots are blank
**Solution**: The page might not be fully loaded. Add a wait:
```
use chrome-devtools to navigate to localhost:5173, wait 2 seconds, then take a screenshot
```

## Best Practices

1. **Always specify URLs**: Be explicit about which URL to navigate to
2. **Wait for load**: Allow time for pages to fully load before taking actions
3. **Use screenshots**: Visual feedback helps verify the browser state
4. **Check console**: Console errors often reveal the root cause of issues
5. **Performance tracing**: Use performance tools to identify bottlenecks

## Additional Resources

- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- OpenCode MCP Docs: https://opencode.ai/docs/mcp-servers/
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
