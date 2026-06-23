# Test Suite Documentation

This directory contains the test suite for the React Chess Application.

## Test Scripts

```bash
# Run all tests once
npm test

# Run tests in watch mode (interactive)
npm run test:watch

# Run tests with UI (vitest-dev-tools)
npm run test:ui

# Run tests with code coverage
npm run test:coverage
```

## Testing Stack

- **Vitest** - Fast unit testing framework
- **JSDOM** - DOM environment for testing React components
- **@testing-library/react** - React testing utilities
- **@testing-library/jest-dom** - Custom matchers
- **jsdom** - JavaScript implementation of web standards

## Test Coverage Goals

- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 75%
- **Statements**: 80%

## Test Organization

```
tests/
├── setup.js           # Test environment setup and mocks
├── README.md          # This file
└── [test files]       # Individual test files
```

## Testing Guidelines

1. **Component Tests**: Test all user-facing components with `render` from `@testing-library/react`
2. **Utility Tests**: Test pure functions in `src/utils/`
3. **Context Tests**: Test state management in `src/contexts/`
4. **Mock External APIs**: Mock `fetch`, `WebSocket`, and external services

## Example Test Structure

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly', () => {
    const { container } = render(<MyComponent />);
    expect(container).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const { getByRole, getByText } = render(<MyComponent />);

    const button = getByRole('button', { name: 'Submit' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(getByText('Success')).toBeInTheDocument();
    });
  });
});
```

## Known Issues & Fixes

### WebSocket Mock
The `WebSocket` class is mocked to prevent actual socket connections during tests. This allows testing components that use WebSockets without requiring a running server.

### IntersectionObserver Mock
Used for testing scrollable components. The mock allows `IntersectionObserver` to work without actual DOM elements.

## Running Tests

```bash
# Install dependencies first
npm install

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Open coverage report
open coverage/index.html
```
